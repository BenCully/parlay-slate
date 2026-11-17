import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { readStartArgs, requireRunKeys, selectDecisionModel, verify } from '../decisions/judge.js';
import { aliasTarget, createEvidence, nameKey, NFL_EVIDENCE } from '../espn/evidence.js';
import { oddsCreditFloor, oddsGet, oddsRequestKey, oddsSlateFamily, setOddsReplay } from '../odds/cache.js';
import {
  droppedCall,
  implied,
  moneylineSlip,
  spreadSlip,
  toDecimal,
  totalSlip,
  type Judgment,
} from '../slate/board.js';
import { easternRange, oddsStamp, scoreboardEvents } from '../slate/window.js';

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('implied price and decimal payout', () => {
  assert.equal(implied(-150), 0.6);
  assert.equal(implied(150), 0.4);
  assert.ok(Math.abs(implied(-110) - 110 / 210) < 1e-12);
  assert.equal(toDecimal(-150), 1 + 100 / 150);
  assert.equal(toDecimal(150), 2.5);
});

test('eastern day keeps Sunday night and drops Monday night', () => {
  assert.deepEqual(easternRange('2026-11-15'), {
    from: '2026-11-15T05:00:00Z',
    to: '2026-11-16T05:00:00Z',
  });
  assert.deepEqual(easternRange('2026-07-15'), {
    from: '2026-07-15T04:00:00Z',
    to: '2026-07-16T04:00:00Z',
  });
  assert.equal(oddsStamp('2026-11-15T05:00:00.123Z'), '2026-11-15T05:00:00Z');
  assert.equal(oddsStamp('2026-11-15T05:00:00.000Z'), '2026-11-15T05:00:00Z');
  assert.throws(() => easternRange('11/15/2026'), /YYYY-MM-DD/);
});

test('name keys and team aliases', () => {
  assert.equal(nameKey('José Ramírez Jr.'), 'joseramirez');
  assert.equal(nameKey('Patrick Mahomes II'), 'patrickmahomes');
  assert.equal(aliasTarget('Los Angeles Clippers'), 'la clippers');
  assert.equal(aliasTarget('Köln'), 'cologne');
  assert.equal(aliasTarget('Inter Milan'), 'internazionale');
  assert.equal(aliasTarget('Las Vegas Athletics'), 'athletics');
  assert.equal(aliasTarget('Kansas City Chiefs'), undefined);
});

test('odds cache key drops the api key and the kickoff window', () => {
  const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=secret-key&commenceTimeFrom=2026-11-15T05:00:00Z&commenceTimeTo=2026-11-16T05:00:00Z';
  const key = oddsRequestKey(url);
  assert.equal(key.request.includes('secret-key'), false);
  assert.equal(key.request.includes('apiKey'), false);
  const shifted = url
    .replace('commenceTimeFrom=2026-11-15T05:00:00Z', 'commenceTimeFrom=2026-12-01T05:00:00Z')
    .replace('commenceTimeTo=2026-11-16T05:00:00Z', 'commenceTimeTo=2026-12-02T05:00:00Z');
  assert.equal(oddsSlateFamily(key.request), oddsSlateFamily(oddsRequestKey(shifted).request));
  const moneylineOnly = url.replace('markets=h2h,spreads,totals', 'markets=h2h');
  assert.notEqual(oddsSlateFamily(key.request), oddsSlateFamily(oddsRequestKey(moneylineOnly).request));
});

test('start args accept model before or after the day', () => {
  assert.deepEqual(readStartArgs(['2026-11-15', 'model=tail-jev']), {
    day: '2026-11-15',
    model: 'tail-jev',
    odds: undefined,
  });
  assert.deepEqual(readStartArgs(['model=autojev', 'odds=2026-11-15']), {
    day: undefined,
    model: 'autojev',
    odds: '2026-11-15',
  });
  assert.throws(() => readStartArgs(['odds=2026-11-15', '--fresh']), /fresh/);
  assert.throws(() => readStartArgs(['odds=2026-11-15', '2026-11-16']), /not both/);
  assert.throws(() => readStartArgs(['odds=yesterday']), /YYYY-MM-DD/);
});

test('slip text follows the verdict', () => {
  const supported: Judgment = { kind: 'checked', verdict: 'supported', confidence: 0.91, status: 'ready' };
  const unsupported: Judgment = { kind: 'checked', verdict: 'unsupported', confidence: 0.91, status: 'ready' };
  const team = { team: 'Kansas City Chiefs', price: -150 };
  assert.equal(moneylineSlip(team, supported), 'Take Chiefs -150');
  assert.equal(moneylineSlip({ ...team, price: 130 }, supported), 'Take Chiefs +130');
  assert.equal(moneylineSlip(team, unsupported), 'Pass');
  assert.equal(moneylineSlip(team, { kind: 'dropped', relevance: 0.71, reason: 'cap' }), 'Pass');
  assert.equal(moneylineSlip(team, { kind: 'missed', stage: 'verify' }), 'Pass');

  const spread = { team: 'Kansas City Chiefs', opponent: 'Buffalo Bills', spread: { point: -3.5 } };
  const line = { verdict: 'supported' as const, confidence: 0.9, status: 'ready' as const };
  assert.equal(spreadSlip(spread, line), 'Take Chiefs -3.5');
  assert.equal(spreadSlip(spread, { ...line, verdict: 'contradicted' }), 'Take Bills +3.5');
  assert.equal(spreadSlip(spread, { ...line, verdict: 'unsupported' }), 'Pass');
  assert.equal(totalSlip('Over', 45.5, line), 'Take the over 45.5');
  assert.equal(totalSlip('Under', 45.5, { ...line, verdict: 'unsupported' }), 'Pass');
});

test('a top-8 cut is not described as a failed 0.60 gate', () => {
  assert.match(droppedCall(0.71, 'cap'), /at 0\.71/);
  assert.match(droppedCall(0.71, 'cap'), /clears 0\.60/);
  assert.match(droppedCall(0.71, 'cap'), /top 8/);
  assert.match(droppedCall(0.42, 'gate'), /at 0\.42, under 0\.60/);
  assert.match(droppedCall(0.599, 'gate'), /at 0\.599, under 0\.60/);
  assert.match(droppedCall(null, 'gate'), /under 0\.60/);
  assert.doesNotMatch(droppedCall(null, 'gate'), /clears 0\.60/);
});

test('keys are required before a run, and a replay does not need the odds key', () => {
  withEnv({
    ODDS_API_KEY: undefined,
    TYPESAFE_API_KEY: 'present',
    AUTOJEV_URL: 'http://example.test',
    AUTOJEV_API_KEY: 'present',
  }, () => {
    assert.throws(() => requireRunKeys('jev', false), /ODDS_API_KEY/);
    requireRunKeys('jev', true);
  });
  withEnv({ ODDS_API_KEY: 'present', TYPESAFE_API_KEY: undefined }, () => {
    assert.throws(() => requireRunKeys('jev', false), /TYPESAFE_API_KEY/);
  });
  withEnv({
    ODDS_API_KEY: 'present',
    AUTOJEV_URL: undefined,
    AUTOJEV_API_KEY: undefined,
  }, () => {
    assert.throws(() => requireRunKeys('tail-jev', true), /AUTOJEV_URL and AUTOJEV_API_KEY/);
  });
});

test('credit floor defaults to 30 and can be turned off', () => {
  withEnv({ ODDS_CREDIT_FLOOR: undefined }, () => assert.equal(oddsCreditFloor(), 30));
  withEnv({ ODDS_CREDIT_FLOOR: '0' }, () => assert.equal(oddsCreditFloor(), 0));
  withEnv({ ODDS_CREDIT_FLOOR: '12.9' }, () => assert.equal(oddsCreditFloor(), 12));
  withEnv({ ODDS_CREDIT_FLOOR: 'nope' }, () => assert.equal(oddsCreditFloor(), 30));
});

test('a failed ESPN read degrades the brief instead of throwing', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/schedule')) return new Response('no', { status: 500 });
    if (url.includes('/injuries')) return new Response('no', { status: 500 });
    if (url.includes('/teams')) {
      const body = {
        sports: [{
          leagues: [{
            teams: [{
              team: { displayName: 'Kansas City Chiefs', abbreviation: 'KC', id: '1', shortDisplayName: 'Chiefs' },
            }],
          }],
        }],
      };
      return new Response(JSON.stringify(body));
    }
    throw new Error(`unexpected ${url}`);
  };
  try {
    const evidence = createEvidence('https://example.test/degrade', NFL_EVIDENCE);
    const brief = await evidence.getBrief({
      team: 'Kansas City Chiefs',
      opponent: 'Buffalo Bills',
      home: true,
      commence: '2026-11-15T18:00:00Z',
    });
    assert.match(brief.text, /No recent games/);
    assert.match(brief.text, /No significant injuries listed/);
    assert.equal(brief.pick.margin, null);
    assert.equal(brief.pick.injury, 'no significant injuries listed');
    assert.equal(brief.pick.record, 'record unavailable');
    assert.equal(brief.opponent.injury, 'no significant injuries listed');
  } finally {
    globalThis.fetch = original;
  }
});

test('one Autojev failure leaves the other claim', async () => {
  const original = globalThis.fetch;
  const previousUrl = process.env.AUTOJEV_URL;
  const previousKey = process.env.AUTOJEV_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    }
    return new Response(JSON.stringify({
      answers: {
        answer: {
          choice: 'supported',
          probabilities: { supported: 0.91, contradicted: 0.04, unsupported: 0.05 },
        },
      },
    }));
  };
  process.env.AUTOJEV_URL = 'http://autojev.test/v1';
  process.env.AUTOJEV_API_KEY = 'test-key';
  selectDecisionModel('tail-jev');
  try {
    const result = await verify({
      claims: [
        { id: 'a', claim: 'Chiefs win.', evidence: 'Chiefs are 8-2.' },
        { id: 'b', claim: 'Bills win.', evidence: 'Bills are 7-3.' },
      ],
      minConfidence: 0.8,
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.checks.map((check) => check.id), ['b']);
    assert.equal(result.checks[0]?.verdict, 'supported');
    assert.match(result.problem ?? '', /timed out/);
    assert.equal(result.stopped, undefined);
  } finally {
    globalThis.fetch = original;
    selectDecisionModel('jev');
    if (previousUrl == null) delete process.env.AUTOJEV_URL;
    else process.env.AUTOJEV_URL = previousUrl;
    if (previousKey == null) delete process.env.AUTOJEV_API_KEY;
    else process.env.AUTOJEV_API_KEY = previousKey;
  }
});

test('three Autojev failures stop the rest of the checks', async () => {
  const original = globalThis.fetch;
  const previousUrl = process.env.AUTOJEV_URL;
  const previousKey = process.env.AUTOJEV_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const error = new Error('down');
    error.name = 'TimeoutError';
    throw error;
  };
  process.env.AUTOJEV_URL = 'http://autojev.test/v1';
  process.env.AUTOJEV_API_KEY = 'test-key';
  selectDecisionModel('tail-jev');
  try {
    const result = await verify({
      claims: ['a', 'b', 'c', 'd'].map((id) => ({ id, claim: id, evidence: 'facts' })),
      minConfidence: 0.8,
    });
    assert.equal(calls, 3);
    assert.equal(result.checks.length, 0);
    assert.equal(result.stopped, true);
    assert.match(result.problem ?? '', /Stopped checking after 3 failures in a row/);
  } finally {
    globalThis.fetch = original;
    selectDecisionModel('jev');
    if (previousUrl == null) delete process.env.AUTOJEV_URL;
    else process.env.AUTOJEV_URL = previousUrl;
    if (previousKey == null) delete process.env.AUTOJEV_API_KEY;
    else process.env.AUTOJEV_API_KEY = previousKey;
  }
});

test('a failed scoreboard returns no events', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('no', { status: 503 });
  try {
    const result = await scoreboardEvents(
      'https://example.test/apis/site/v2/sports/football/nfl/scoreboard',
      (status) => `ESPN scoreboard returned ${status}`,
    );
    assert.deepEqual(result.stamps, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('a credit-floor miss does not call the network', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previous = process.env.ODDS_CACHE_DIR;
  process.env.ODDS_CACHE_DIR = dir;
  setOddsReplay(null);
  try {
    const result = await oddsGet(
      'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h',
      undefined,
      { cacheOnly: true },
    );
    assert.equal(result.skipped, true);
    assert.equal(result.cached, false);
    assert.equal(result.body, null);
  } finally {
    setOddsReplay(null);
    if (previous == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
