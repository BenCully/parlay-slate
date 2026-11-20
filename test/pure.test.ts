import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readStartArgs, requireRunKeys, selectDecisionModel, verify } from '../decisions/judge.js';
import { espnCacheFresh, ESPN_DAY_HOURS, ESPN_INJURY_HOURS, readEspnCache, writeEspnCache } from '../espn/cache.js';
import { aliasTarget, clubKey, createEvidence, nameKey, NFL_EVIDENCE, type GameBrief } from '../espn/evidence.js';
import { bookLabel, postedMarket } from '../odds/books.js';
import { listSavedOdds, oddsCacheName, oddsGet, oddsReplayCommand, oddsRequestKey, oddsRequestSource, oddsSlateFamily, oddsSourceLabel, parseOddsBody, preferFreshRecord, recordMergedBook, resetMergedBooks, setOddsReplay } from '../odds/cache.js';
import { attachSpreads, betMgmCacheSize, betMgmSessionOpen, holdBetMgmSport, normalizeBetMgm } from '../odds/betmgm.js';
import { caesarsDataUrl, normalizeCaesars } from '../odds/caesars.js';
import { bookCacheSize, bookEventId, booksFetch, compositeId, mergeBookEvents, mergePropEvent, placeholderEvent, resetBookReads, splitBookId } from '../odds/direct.js';
import { draftKingsCacheSize, draftkingsFetch, normalizeDraftKings } from '../odds/draftkings.js';
import { buildTeamIndex, chooseDriverBets, classifyProp, eventSides, fanduelFetch, marketOutcomes, pickBalanced, propOutcomes, resolveTeamName, sidesFromName, teamResolver } from '../odds/fanduel.js';
import { balancedSpreads } from '../odds/lines.js';
import { appendQuota, easternClock, quotaEntry, quotaLogFile } from '../odds/quota.js';
import { acquireRunLock } from '../scripts/lock.js';
import { scrubError, scrubText } from '../scripts/scrub.js';
import { mapPool } from '../slate/pool.js';
import { archiveStamp, saveDecisionSnapshot } from '../scripts/snapshot.js';
import { loadPropBoard, pickLayeredExtra, type PropProfile } from '../props/board.js';
import { realExtra as mlbRealExtra } from '../sports/baseball/index.js';
import { realExtra as nbaRealExtra } from '../sports/basketball/index.js';
import { realExtra as footballRealExtra } from '../sports/football/props.js';
import { nflLeague } from '../sports/football/nfl.js';
import { ncaaLeague } from '../sports/football/ncaa.js';
import { soccer } from '../sports/soccer/index.js';
import { describeDriver, driverLine, driverLines, matchDriver } from '../sports/formula1/brief.js';
import { realExtra as nhlRealExtra } from '../sports/hockey/index.js';
import { absenceText, applyFotmob, matchClub, openAbsences, parseLeague, pickFixture, type FotmobLeague } from '../sports/soccer/fotmob.js';

process.env.QUOTA_LOG ??= '0';
import {
  droppedCall,
  implied,
  moneylineSlip,
  spreadSlip,
  toDecimal,
  totalSlip,
  type Judgment,
} from '../slate/board.js';
import { easternDay, easternRange, oddsStamp, scoreboardEvents, upcomingWindow } from '../slate/window.js';
import { savedOddsLabel, slateHeaders, type SavedSlate } from '../ui/screen.js';

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

function sampleLeague(): FotmobLeague {
  const league = parseLeague({
    table: [{
      data: {
        table: {
          all: [
            { name: 'Paris Saint-Germain', shortName: 'PSG', id: 9847, played: 10, wins: 7, draws: 2, losses: 1, goalConDiff: 12, pts: 23, idx: 1 },
            { name: 'Paris FC', shortName: 'Paris FC', id: 6379, played: 10, wins: 6, draws: 2, losses: 2, goalConDiff: 4, pts: 20, idx: 3 },
            { name: 'Lens', shortName: 'Lens', id: 8588, played: 10, wins: 3, draws: 4, losses: 3, goalConDiff: -1, pts: 13, idx: 11 },
            { name: 'Nice', shortName: 'Nice', id: 9831, played: 10, wins: 5, draws: 2, losses: 3, goalConDiff: 2, pts: 17, idx: 6 },
          ],
          home: [
            { id: 9847, wins: 3, draws: 0, losses: 1, idx: 7 },
            { id: 9831, wins: 3, draws: 1, losses: 1, idx: 4 },
          ],
          away: [{ id: 9847, wins: 4, draws: 2, losses: 0, idx: 1 }],
          xg: [{ id: 9847, xg: 26, xgConceded: 12 }],
        },
      },
    }],
    fixtures: {
      allMatches: [
        { id: '2', home: { id: '9831', name: 'Nice' }, away: { id: '9847', name: 'Paris Saint-Germain' }, status: { utcTime: '2026-11-21T16:15:00.000Z' } },
        { id: '3', home: { id: '9847', name: 'Paris Saint-Germain' }, away: { id: '9831', name: 'Nice' }, status: { utcTime: '2027-02-01T20:00:00.000Z' } },
      ],
    },
  });
  if (!league) throw new Error('sample league');
  return league;
}

test('fotmob table matches clubs and keeps the nearer fixture', () => {
  assert.equal(clubKey('AS Monaco'), 'monaco');
  assert.equal(clubKey('FC Köln'), 'cologne');
  assert.equal(clubKey('Bayern München'), 'bayern munich');
  const league = sampleLeague();
  assert.equal(matchClub(league.teams, 'Paris FC')?.id, '6379');
  assert.equal(matchClub(league.teams, 'Paris Saint Germain')?.id, '9847');
  assert.equal(matchClub(league.teams, 'RC Lens')?.id, '8588');
  assert.equal(pickFixture(league, 'Paris Saint Germain', 'Nice', '2026-11-21T16:15:00Z')?.id, '2');
  const brief: GameBrief = {
    text: 'Paris Saint Germain to win. Paris Saint-Germain injury report: nobody listed Out, Doubtful, Questionable, or on injured reserve. Nice are fine.',
    pick: { name: 'Paris Saint-Germain', short: 'PSG', record: '7-1-2', rest: '6 days rest', injury: 'no significant injuries listed', margin: 1, scored: 2, allowed: 1 },
    opponent: { name: 'Nice', short: 'Nice', record: '5-3-2', rest: '6 days rest', injury: 'no significant injuries listed', margin: 0, scored: 1, allowed: 1 },
  };
  const next = applyFotmob(brief, {
    team: 'Paris Saint Germain',
    opponent: 'Nice',
    home: false,
    commence: '2026-11-21T16:15:00Z',
  }, league, {
    homeId: '9831',
    awayId: '9847',
    home: [],
    away: [
      { name: 'Michel Diaz', kind: 'suspended', back: 'Mid November 2026', until: Date.parse('2026-11-21T18:00:00Z') },
      { name: 'Back Already', kind: 'injured', back: 'Early November 2026', until: Date.parse('2026-11-20T12:00:00Z') },
    ],
  });
  assert.match(next.pick.table ?? '', /1st of 4, 7-2-1, \+12 GD, 2\.6 xG and 1\.2 xGA per game, 1st away \(4-2-0\)/);
  assert.match(next.opponent.table ?? '', /4th at home \(3-1-1\)/);
  assert.equal(next.pick.injury, 'Michel Diaz suspended, back Mid November 2026');
  assert.match(next.text, /FotMob table:/);
  assert.match(next.text, /Paris Saint-Germain unavailable: Michel Diaz suspended/);
  assert.equal(next.text.includes('nobody listed'), false);
  const closed = openAbsences([
    { name: 'Back Already', kind: 'injured', back: '', until: Date.parse('2026-11-20T12:00:00Z') },
  ], Date.parse('2026-11-21T16:15:00Z'));
  assert.equal(absenceText(closed), '');
  assert.equal(closed.length, 0);
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
    fresh: false,
  });
  assert.deepEqual(readStartArgs(['model=autojev', 'odds=2026-11-15']), {
    day: undefined,
    model: 'autojev',
    odds: '2026-11-15',
    fresh: false,
  });
  assert.deepEqual(readStartArgs(['--fresh', 'model=jev']), {
    day: undefined,
    model: 'jev',
    odds: undefined,
    fresh: true,
  });
  assert.throws(() => readStartArgs(['odds=2026-11-15', '--fresh']), /fresh/);
  assert.throws(() => readStartArgs(['odds=2026-11-15', '2026-11-16']), /not both/);
  assert.throws(() => readStartArgs(['odds=yesterday']), /YYYY-MM-DD/);
  assert.throws(() => readStartArgs(['11/20']), /Date must be YYYY-MM-DD/);
  assert.throws(() => readStartArgs(['--freshh']), /Unknown option "--freshh"/);
  assert.throws(() => readStartArgs(['2026-11-20', '2026-11-21']), /Pass one date/);
});

test('slip text follows the verdict', () => {
  const supported: Judgment = { kind: 'checked', verdict: 'supported', confidence: 0.91, status: 'ready' };
  const unsupported: Judgment = { kind: 'checked', verdict: 'unsupported', confidence: 0.91, status: 'ready' };
  const team = { team: 'Kansas City Chiefs', price: -150 };
  assert.equal(moneylineSlip(team, supported), 'Take Chiefs -150');
  assert.equal(moneylineSlip({ ...team, price: 130 }, supported), 'Take Chiefs +130');
  assert.equal(
    moneylineSlip({ team: 'Max Verstappen', price: -195, phrase: 'to finish top 2' }, supported),
    'Take Verstappen to finish top 2 -195',
  );
  const review: Judgment = { kind: 'checked', verdict: 'supported', confidence: 0.55, status: 'review' };
  assert.equal(moneylineSlip(team, review), 'Lean Chiefs -150');
  assert.equal(moneylineSlip(team, unsupported), 'Pass');
  assert.equal(moneylineSlip(team, { kind: 'dropped', relevance: 0.71, reason: 'cap' }), 'Pass');
  assert.equal(moneylineSlip(team, { kind: 'missed', stage: 'verify' }), 'Pass');

  const spread = { team: 'Kansas City Chiefs', opponent: 'Buffalo Bills', spread: { point: -3.5 } };
  const line = { verdict: 'supported' as const, confidence: 0.9, status: 'ready' as const };
  assert.equal(spreadSlip(spread, line), 'Take Chiefs -3.5');
  assert.equal(spreadSlip(spread, { ...line, verdict: 'contradicted' }), 'Take Bills +3.5');
  assert.equal(spreadSlip(spread, { ...line, status: 'review' }), 'Lean Chiefs -3.5');
  assert.equal(spreadSlip(spread, { ...line, verdict: 'contradicted', status: 'review' }), 'Lean Bills +3.5');
  assert.equal(spreadSlip(spread, { ...line, verdict: 'unsupported' }), 'Pass');
  assert.equal(totalSlip('Over', 45.5, line), 'Take the over 45.5');
  assert.equal(totalSlip('Over', 45.5, { ...line, status: 'review' }), 'Lean the over 45.5');
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

test('keys are required before a run, and the odds key is not one of them', () => {
  withEnv({
    ODDS_API_KEY: undefined,
    ODDS_SOURCE: undefined,
    TYPESAFE_API_KEY: 'present',
    AUTOJEV_URL: 'http://example.test',
    AUTOJEV_API_KEY: 'present',
  }, () => {
    requireRunKeys('jev');
    requireRunKeys('jev');
  });
  withEnv({ ODDS_API_KEY: 'present', TYPESAFE_API_KEY: undefined }, () => {
    assert.throws(() => requireRunKeys('jev'), /TYPESAFE_API_KEY/);
  });
  withEnv({
    ODDS_API_KEY: 'present',
    AUTOJEV_URL: undefined,
    AUTOJEV_API_KEY: undefined,
  }, () => {
    assert.throws(() => requireRunKeys('tail-jev'), /AUTOJEV_URL and AUTOJEV_API_KEY/);
  });
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

test('an unreadable scoreboard returns no events', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
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

test('a printed error hides the odds api key', () => {
  const error = new Error('Odds API 401 from https://api.the-odds-api.com/v4/sports/x/odds?apiKey=super-secret&regions=us');
  const safe = scrubError(error, 'The slate failed.');
  assert.equal(safe.includes('super-secret'), false);
  assert.match(safe, /apiKey=\*\*\*/);
  assert.equal(scrubError('not an error', 'The slate failed.'), 'The slate failed.');
});

test('the first book that posted the market is named on the row', () => {
  const books = [
    { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Chiefs', price: -180 }, { name: 'Raiders', price: 155 }] }] },
    { key: 'fanduel', markets: [{ key: 'spreads', outcomes: [{ name: 'Chiefs', price: -110, point: -3.5 }, { name: 'Raiders', price: -110, point: 3.5 }] }] },
    { key: 'somebook', title: 'Some Book', markets: [{ key: 'totals', outcomes: [{ name: 'Over', price: -105, point: 45 }, { name: 'Under', price: -115, point: 45 }] }] },
  ];
  assert.equal(postedMarket(books, 'h2h')?.book, 'DraftKings');
  assert.equal(postedMarket(books, 'spreads')?.book, 'FanDuel');
  assert.equal(postedMarket(books, 'totals')?.book, 'Some Book');
  assert.equal(postedMarket(books, 'player_points'), null);
  assert.equal(bookLabel({ key: 'williamhill_us' }), 'Caesars');
  assert.equal(bookLabel({ key: 'betonlineag' }), 'betonlineag');
  assert.equal(postedMarket([{ key: 'williamhill_us', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: -150 }, { name: 'B', price: 130 }] }] }], 'h2h')?.book, 'Caesars');
  const oneSided = [
    { key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Chiefs', price: -180 }] }] },
    { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Chiefs', price: -170 }, { name: 'Raiders', price: 150 }] }] },
  ];
  assert.equal(postedMarket(oneSided, 'h2h')?.book, 'DraftKings');
  const driver = [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Verstappen', price: -150 }] }] }];
  assert.equal(postedMarket(driver, 'h2h'), null);
  assert.equal(postedMarket(driver, 'h2h', { outright: true })?.book, 'FanDuel');
});

test('an empty odds body loses to a sibling that still has games', () => {
  const games = { savedAt: '2026-11-18T12:00:00Z', body: [{ id: 'game-1' }] };
  const newerEmpty = { savedAt: '2026-11-18T18:00:00Z', body: [] as unknown[] };
  const newerGames = { savedAt: '2026-11-18T20:00:00Z', body: [{ id: 'game-2' }, { id: 'game-3' }] };
  assert.equal(preferFreshRecord([newerEmpty, games]), games);
  assert.equal(preferFreshRecord([games, newerEmpty]), games);
  assert.equal(preferFreshRecord([games, newerGames]), newerGames);
  assert.deepEqual(preferFreshRecord([newerEmpty])?.body, []);
  assert.equal(preferFreshRecord([]), null);
});

async function writeOdds(dir: string, url: string, savedAt: string, body: unknown) {
  const key = oddsRequestKey(url);
  await writeFile(`${dir}/${key.hash}.json`, `${JSON.stringify({ savedAt, remaining: 40, body, request: key.request })}\n`);
}

test('family lookup skips an empty slate when a fresh sibling has games', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousHours = process.env.ODDS_CACHE_HOURS;
  const previousCache = process.env.ODDS_CACHE;
  const original = globalThis.fetch;
  const previousSource = process.env.ODDS_SOURCE;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE_HOURS = '24';
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  globalThis.fetch = async () => {
    throw new Error('odds fetch should not run');
  };
  const gamesUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-19T05:00:00Z&commenceTimeTo=2026-11-22T05:00:00Z';
  const emptyUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-23T05:00:00Z';
  const askUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-21T05:00:00Z';
  const staleGamesUrl = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-19T05:00:00Z&commenceTimeTo=2026-11-22T05:00:00Z';
  const freshEmptyUrl = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-23T05:00:00Z';
  const askNba = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-21T05:00:00Z';
  try {
    const now = Date.now();
    const game = {
      id: 'game-1',
      commence_time: '2026-11-20T18:00:00Z',
      home_team: 'Home',
      away_team: 'Away',
      bookmakers: [],
    };
    await writeOdds(dir, gamesUrl, new Date(now - 3_600_000).toISOString(), [game]);
    await writeOdds(dir, emptyUrl, new Date(now - 60_000).toISOString(), []);
    const family = await oddsGet(askUrl);
    assert.equal(family.cached, true);
    assert.ok(Array.isArray(family.body));
    assert.equal(family.body.length, 1);
    assert.equal(family.body[0]?.id, 'game-1');
    const exact = await oddsGet(emptyUrl);
    assert.equal(exact.cached, true);
    assert.deepEqual(exact.body, []);
    await writeOdds(dir, staleGamesUrl, new Date(now - 48 * 3_600_000).toISOString(), [{ ...game, id: 'old-game' }]);
    await writeOdds(dir, freshEmptyUrl, new Date(now - 60_000).toISOString(), []);
    const onlyFresh = await oddsGet(askNba);
    assert.equal(onlyFresh.cached, true);
    assert.deepEqual(onlyFresh.body, []);
  } finally {
    globalThis.fetch = original;
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousHours == null) delete process.env.ODDS_CACHE_HOURS;
    else process.env.ODDS_CACHE_HOURS = previousHours;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

function oddsGame(id: string, bookmakers: unknown[] = []) {
  return {
    id,
    commence_time: '2026-11-15T18:00:00Z',
    home_team: 'Home',
    away_team: 'Away',
    sport_key: 'icehockey_nhl',
    bookmakers,
  };
}

test('odds bodies are parsed once and a bad shape throws', () => {
  const slate = parseOddsBody([oddsGame('g1', [{
    key: 'fanduel',
    title: 'FanDuel',
    last_update: '2026-11-15T12:00:00Z',
    markets: [{ key: 'spreads', outcomes: [{ name: 'Home', price: -110, point: -1.5 }] }],
  }])]);
  assert.ok(Array.isArray(slate));
  assert.equal(slate[0]?.bookmakers[0]?.markets[0]?.outcomes[0]?.point, -1.5);
  assert.equal('sport_key' in (slate[0] ?? {}), false);
  const prop = parseOddsBody(oddsGame('g2', [{
    key: 'draftkings',
    markets: [{ key: 'player_goal_scorer_anytime', outcomes: [{ name: 'Yes', description: 'A Player', price: 150 }] }],
  }]));
  assert.ok(!Array.isArray(prop));
  assert.equal(prop.bookmakers[0]?.markets[0]?.outcomes[0]?.description, 'A Player');
  assert.deepEqual(parseOddsBody([]), []);
  const noBooks = parseOddsBody([oddsGame('g3')]);
  assert.ok(Array.isArray(noBooks));
  assert.deepEqual(noBooks[0]?.bookmakers, []);
  assert.throws(() => parseOddsBody({ message: 'nope' }), /unexpected payload/);
  assert.throws(() => parseOddsBody([oddsGame('g4', [{ key: 'fanduel', markets: 'nope' }])]), /unexpected payload/);
  assert.throws(() => parseOddsBody([oddsGame('g5', [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: '150' }] }] }])]), /unexpected payload/);
});

test('a cached odds body with the wrong shape throws and does not fetch', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousCache = process.env.ODDS_CACHE;
  const previousSource = process.env.ODDS_SOURCE;
  const original = globalThis.fetch;
  let fetched = 0;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  globalThis.fetch = async () => {
    fetched += 1;
    throw new Error('odds fetch should not run');
  };
  const url = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?regions=us&markets=h2h';
  try {
    await writeOdds(dir, url, new Date().toISOString(), { nope: true });
    await assert.rejects(oddsGet(url), /unexpected payload/);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = original;
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second start exits while the lock is held, and a dead lock is taken over', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-lock-`);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    const release = await acquireRunLock(dir);
    await assert.rejects(acquireRunLock(dir), new RegExp(`pid ${process.pid}`));
    await release();
    const dead = await new Promise<number>((resolve, reject) => {
      const finished = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
      finished.once('exit', () => finished.pid == null ? reject(new Error('no pid')) : resolve(finished.pid));
    });
    await writeFile(`${dir}/slate.lock`, `${dead}\n`);
    const taken = await acquireRunLock(dir);
    assert.match(await readFile(`${dir}/slate.lock`, 'utf8'), new RegExp(`^${process.pid}\\n`));
    await taken();
    assert.equal(child.pid == null, false);
    await writeFile(`${dir}/slate.lock`, `${child.pid}\n`);
    await assert.rejects(acquireRunLock(dir), new RegExp(`pid ${child.pid}`));
    assert.match(await readFile(`${dir}/slate.lock`, 'utf8'), new RegExp(`^${child.pid}\\n`));
    await writeFile(`${dir}/slate.lock`, 'nope\n');
    await assert.rejects(acquireRunLock(dir), /runs\/slate\.lock/);
    assert.equal(await readFile(`${dir}/slate.lock`, 'utf8'), 'nope\n');
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
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

test('FanDuel prop types map onto the markets the boards ask for', () => {
  assert.deepEqual(classifyProp('ANY_TIME_TOUCHDOWN_SCORER'), { key: 'player_anytime_td', kind: 'yes' });
  assert.deepEqual(classifyProp('PLAYER_X_PASSING_YARDS_HIGH'), { key: 'player_pass_yds', kind: 'ou' });
  assert.deepEqual(classifyProp('PLAYER_LOW_RECEIVING_YARDS_CFB'), { key: 'player_reception_yds', kind: 'ou' });
  assert.deepEqual(classifyProp('PLAYER_M_TOTAL_MADE_3_POINT_FIELD_GOALS'), { key: 'player_threes', kind: 'ou' });
  assert.deepEqual(classifyProp('PLAYER_TOTAL_SHOTS'), { key: 'player_shots_on_goal', kind: 'ou' });
  assert.deepEqual(classifyProp('TO_SCORE'), { key: 'player_goal_scorer_anytime', kind: 'yes' });
  assert.deepEqual(classifyProp('PLAYER_TO_HAVE_2_OR_MORE_SHOTS'), { key: 'player_shots', kind: 'milestone', point: 1.5 });
  assert.deepEqual(classifyProp('PLAYER_TO_HAVE_1_OR_MORE_SHOTS_ON_TARGET'), { key: 'player_shots_on_target', kind: 'milestone', point: 0.5 });
  assert.equal(classifyProp('PLAYER_X_ALT_PASSING_YARDS_HIGH'), null);
  assert.equal(classifyProp('PLAYER_X_1ST_QUARTER_PASSING_YARDS'), null);
  assert.equal(classifyProp('PLAYER_X_PASSING_+_RUSHING_YARDS'), null);
  assert.equal(classifyProp('TO_SCORE_2_OR_MORE_GOALS'), null);
});

test('FanDuel runners become over, under, and yes outcomes', () => {
  assert.deepEqual(propOutcomes({ key: 'player_pass_yds', kind: 'ou' }, [
    { runnerName: 'Daniel Jones Over', handicap: 180.5, resultType: 'OVER', odds: -114, runnerStatus: 'ACTIVE' },
    { runnerName: 'Daniel Jones Under', handicap: 180.5, resultType: 'UNDER', odds: -106, runnerStatus: 'ACTIVE' },
    { runnerName: 'Daniel Jones Over', handicap: 0, resultType: 'OVER', odds: -600, runnerStatus: 'ACTIVE' },
  ]), [
    { name: 'Over', description: 'Daniel Jones', price: -114, point: 180.5 },
    { name: 'Under', description: 'Daniel Jones', price: -106, point: 180.5 },
  ]);
  assert.deepEqual(propOutcomes({ key: 'player_shots_on_goal', kind: 'ou' }, [
    { runnerName: 'Alex DeBrincat - Over', handicap: 3.5, resultType: 'OVER', odds: -115.4, runnerStatus: 'ACTIVE' },
  ]), [
    { name: 'Over', description: 'Alex DeBrincat', price: -115, point: 3.5 },
  ]);
  assert.deepEqual(propOutcomes({ key: 'player_anytime_td', kind: 'yes' }, [
    { runnerName: 'Jonathan Taylor', handicap: 0, odds: 125, runnerStatus: 'ACTIVE' },
    { runnerName: 'No', handicap: 0, odds: -150, runnerStatus: 'ACTIVE' },
  ]), [
    { name: 'Yes', description: 'Jonathan Taylor', price: 125, point: null },
  ]);
  assert.deepEqual(propOutcomes({ key: 'player_shots', kind: 'milestone', point: 1.5 }, [
    { runnerName: 'Erling Haaland', handicap: 0, odds: -140, runnerStatus: 'SUSPENDED' },
    { runnerName: 'Phil Foden', handicap: 0, odds: 120, runnerStatus: 'ACTIVE' },
  ]), [
    { name: 'Over', description: 'Phil Foden', price: 120, point: 1.5 },
  ]);
});

function collegeTeam(id: string, displayName: string, short: string, location: string, abbreviation: string, name: string) {
  return { id, displayName, shortDisplayName: short, location, abbreviation, name };
}

test('FanDuel college names match ESPN location and short name', () => {
  const index = buildTeamIndex([
    collegeTeam('150', 'Duke Blue Devils', 'Duke', 'Duke', 'DUKE', 'Blue Devils'),
    collegeTeam('228', 'Clemson Tigers', 'Clemson', 'Clemson', 'CLEM', 'Tigers'),
    collegeTeam('130', 'Michigan Wolverines', 'Michigan', 'Michigan', 'MICH', 'Wolverines'),
    collegeTeam('127', 'Michigan State Spartans', 'Michigan St', 'Michigan State', 'MSU', 'Spartans'),
    collegeTeam('251', 'Texas Longhorns', 'Texas', 'Texas', 'TEX', 'Longhorns'),
    collegeTeam('245', 'Texas A&M Aggies', 'Texas A&M', 'Texas A&M', 'TA&M', 'Aggies'),
    collegeTeam('61', 'Georgia Bulldogs', 'Georgia', 'Georgia', 'UGA', 'Bulldogs'),
    collegeTeam('2247', 'Georgia State Panthers', 'Georgia St', 'Georgia State', 'GAST', 'Panthers'),
    collegeTeam('2294', 'Iowa Hawkeyes', 'Iowa', 'Iowa', 'IOWA', 'Hawkeyes'),
    collegeTeam('66', 'Iowa State Cyclones', 'Iowa State', 'Iowa State', 'ISU', 'Cyclones'),
    collegeTeam('99', 'LSU Tigers', 'LSU', 'LSU', 'LSU', 'Tigers'),
    collegeTeam('30', 'USC Trojans', 'USC', 'USC', 'USC', 'Trojans'),
    collegeTeam('252', 'BYU Cougars', 'BYU', 'BYU', 'BYU', 'Cougars'),
    collegeTeam('145', 'Ole Miss Rebels', 'Ole Miss', 'Ole Miss', 'MISS', 'Rebels'),
    collegeTeam('152', 'NC State Wolfpack', 'NC State', 'NC State', 'NCSU', 'Wolfpack'),
    collegeTeam('2534', 'Sam Houston Bearkats', 'Sam Houston', 'Sam Houston', 'SHSU', 'Bearkats'),
    collegeTeam('2026', 'App State Mountaineers', 'App State', 'App State', 'APP', 'Mountaineers'),
    collegeTeam('41', 'UConn Huskies', 'UConn', 'UConn', 'CONN', 'Huskies'),
    collegeTeam('62', "Hawai'i Rainbow Warriors", "Hawai'i", "Hawai'i", 'HAW', 'Rainbow Warriors'),
    collegeTeam('2390', 'Miami Hurricanes', 'Miami', 'Miami', 'MIA', 'Hurricanes'),
    collegeTeam('193', 'Miami (OH) RedHawks', 'Miami OH', 'Miami (OH)', 'M-OH', 'RedHawks'),
    collegeTeam('2433', 'UL Monroe Warhawks', 'UL Monroe', 'UL Monroe', 'ULM', 'Warhawks'),
    collegeTeam('194', 'Ohio State Buckeyes', 'Ohio State', 'Ohio State', 'OSU', 'Buckeyes'),
    collegeTeam('3161', 'Ohio State Newark Titans', 'Osunewark', 'Ohio State Newark', 'OSU', 'Titans'),
    collegeTeam('2429', 'Charlotte 49ers', 'Charlotte', 'Charlotte', 'CLT', '49ers'),
    collegeTeam('3253', 'Charlotte Saints', 'Faith NC', 'Charlotte', 'COLLE', 'Saints'),
    collegeTeam('2653', 'Troy Trojans', 'Troy', 'Troy', 'TROY', 'Trojans'),
    collegeTeam('3237', 'Troy Vikings', 'Hudson', 'Troy', 'HVCC', 'Vikings'),
    collegeTeam('12', 'LA Clippers', 'Clippers', 'LA', 'LAC', 'Clippers'),
  ], 'football');
  const name = (team: string) => resolveTeamName(team, index, 'football');
  assert.equal(name('Duke'), 'Duke Blue Devils');
  assert.equal(name('Clemson'), 'Clemson Tigers');
  assert.equal(name('Ohio State'), 'Ohio State Buckeyes');
  assert.equal(name('Michigan'), 'Michigan Wolverines');
  assert.equal(name('Michigan State'), 'Michigan State Spartans');
  assert.equal(name('Texas'), 'Texas Longhorns');
  assert.equal(name('Texas A&M'), 'Texas A&M Aggies');
  assert.equal(name('Georgia'), 'Georgia Bulldogs');
  assert.equal(name('Georgia State'), 'Georgia State Panthers');
  assert.equal(name('Iowa'), 'Iowa Hawkeyes');
  assert.equal(name('Iowa State'), 'Iowa State Cyclones');
  assert.equal(name('LSU'), 'LSU Tigers');
  assert.equal(name('USC'), 'USC Trojans');
  assert.equal(name('BYU'), 'BYU Cougars');
  assert.equal(name('Ole Miss'), 'Ole Miss Rebels');
  assert.equal(name('NC State'), 'NC State Wolfpack');
  assert.equal(name('Sam Houston State'), 'Sam Houston Bearkats');
  assert.equal(name('Appalachian State'), 'App State Mountaineers');
  assert.equal(name('Connecticut'), 'UConn Huskies');
  assert.equal(name('Hawaii'), "Hawai'i Rainbow Warriors");
  assert.equal(name('Miami'), 'Miami Hurricanes');
  assert.equal(name('Miami Florida'), 'Miami Hurricanes');
  assert.equal(name('Miami (OH)'), 'Miami (OH) RedHawks');
  assert.equal(name('UL Monroe'), 'UL Monroe Warhawks');
  assert.equal(name('Charlotte'), 'Charlotte 49ers');
  assert.equal(name('Troy'), 'Troy Trojans');
  assert.equal(name('OSU'), 'OSU');
  assert.equal(name('Los Angeles Clippers'), 'LA Clippers');
});

test('a repeated soccer club name still resolves an alias', () => {
  const index = buildTeamIndex([
    { id: '160', displayName: 'Paris Saint-Germain', shortDisplayName: 'PSG', name: 'Paris Saint-Germain' },
    { id: '121', displayName: 'AS Roma', shortDisplayName: 'Roma', name: 'AS Roma' },
    { id: '89', displayName: 'Sunderland', shortDisplayName: 'Sunderland', name: 'Sunderland' },
  ], 'club');
  assert.equal(resolveTeamName('Paris St-G', index, 'club'), 'Paris Saint-Germain');
  assert.equal(resolveTeamName('AS Roma', index, 'club'), 'AS Roma');
  assert.equal(index.get('paris saint germain')?.length, 1);
});

test('FanDuel totals keep Over and Under, and soccer v is home first', () => {
  const totals = marketOutcomes({
    runners: [
      { selectionId: 1, runnerName: 'Over' },
      { selectionId: 2, runnerName: 'Under' },
      { selectionId: 3, runnerName: 'Over', runnerStatus: 'SUSPENDED' },
    ],
  }, {
    runnerDetails: [
      { selectionId: 1, runnerStatus: 'ACTIVE', handicap: 2.5, winRunnerOdds: { americanDisplayOdds: { americanOdds: -115.4 } } },
      { selectionId: 2, runnerStatus: 'ACTIVE', handicap: 2.5, winRunnerOdds: { americanDisplayOdds: { americanOdds: -105 } } },
      { selectionId: 3, runnerStatus: 'SUSPENDED', handicap: 2.5, winRunnerOdds: { americanDisplayOdds: { americanOdds: 100 } } },
    ],
  });
  assert.deepEqual(totals.map((row) => ({ name: row.name, price: row.price, point: row.point })), [
    { name: 'Over', price: -115, point: 2.5 },
    { name: 'Under', price: -105, point: 2.5 },
  ]);
  assert.deepEqual(sidesFromName('Buffalo Bills @ Kansas City Chiefs'), { away: 'Buffalo Bills', home: 'Kansas City Chiefs' });
  assert.deepEqual(sidesFromName('Liverpool v Manchester United'), { home: 'Liverpool', away: 'Manchester United' });
  assert.deepEqual(sidesFromName('No separator'), { away: 'Away', home: 'Home' });
  const index = buildTeamIndex([
    collegeTeam('145', 'Ole Miss Rebels', 'Ole Miss', 'Ole Miss', 'MISS', 'Rebels'),
    collegeTeam('2695', 'Wofford Terriers', 'Wofford', 'Wofford', 'WOF', 'Terriers'),
  ], 'football');
  const resolve = (name: string) => resolveTeamName(name, index, 'football');
  assert.deepEqual(eventSides('Wofford @ Ole Miss', [{ name: 'Wofford Terriers', kind: 'AWAY' }], resolve), {
    home: 'Ole Miss Rebels',
    away: 'Wofford Terriers',
  });
});

test('a FanDuel read ignores an Odds API cache record', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h';
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_SOURCE = 'fanduel';
  setOddsReplay(null);
  try {
    const { hash, request } = oddsRequestKey(url);
    await writeFile(`${dir}/${hash}.json`, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      remaining: 10,
      body: [{ id: 'odds-api' }],
      request,
    })}\n`);
    const result = await oddsGet(url, undefined, { cacheOnly: true });
    assert.equal(result.skipped, true);
    assert.equal(result.cached, false);
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

test('FanDuel cache files do not replace Odds API files', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const url = 'https://api.the-odds-api.com/v4/sports/soccer_uefa_champs_league/odds?regions=us&markets=h2h,spreads,totals';
  const savedAt = new Date().toISOString();
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  setOddsReplay(null);
  try {
    const { hash, request } = oddsRequestKey(url);
    assert.equal(oddsCacheName(hash, 'the-odds-api'), `${hash}.json`);
    assert.equal(oddsCacheName(hash, 'fanduel'), `fanduel-${hash}.json`);
    assert.notEqual(oddsCacheName(hash, 'fanduel'), oddsCacheName(hash, 'the-odds-api'));
    const event = (id: string) => ({
      id,
      commence_time: '2026-11-18T20:00:00Z',
      home_team: 'Home',
      away_team: 'Away',
      bookmakers: [],
    });
    await writeFile(`${dir}/${hash}.json`, `${JSON.stringify({
      savedAt,
      remaining: 10,
      body: [event('odds-api')],
      request,
    })}\n`);
    await writeFile(`${dir}/fanduel-${hash}.json`, `${JSON.stringify({
      savedAt,
      remaining: null,
      body: [event('fanduel-game')],
      request,
      source: 'fanduel',
    })}\n`);
    await writeFile(`${dir}/fanduel-prop.json`, `${JSON.stringify({
      savedAt,
      remaining: null,
      body: event('prop'),
      request: '/v4/sports/soccer_uefa_champs_league/events/99/odds?markets=player_goal_scorer_anytime',
      source: 'fanduel',
    })}\n`);
    process.env.ODDS_SOURCE = 'fanduel';
    const hit = await oddsGet(url);
    assert.equal(hit.cached, true);
    assert.ok(Array.isArray(hit.body));
    assert.equal(hit.body[0]?.id, 'fanduel-game');
    const legacy = JSON.parse(await readFile(`${dir}/${hash}.json`, 'utf8')) as { body: { id: string }[] };
    assert.equal(legacy.body[0]?.id, 'odds-api');
    delete process.env.ODDS_SOURCE;
    const days = await listSavedOdds();
    const champs = days.filter((day) => day.day === easternDay(savedAt));
    assert.deepEqual(champs.map((day) => day.source), ['the-odds-api', 'fanduel']);
    assert.equal(champs[0]?.props, 0);
    assert.equal(champs[1]?.props, 1);
    assert.equal(champs[0]?.slates[0]?.sport, 'soccer_uefa_champs_league');
    assert.equal(champs[1]?.slates[0]?.games, 1);
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('replay commands override a different active source', () => {
  withEnv({ ODDS_SOURCE: 'fanduel' }, () => {
    assert.equal(
      oddsReplayCommand('2026-11-17', 'the-odds-api', 'jev'),
      'ODDS_SOURCE=the-odds-api npm start -- odds=2026-11-17 model=jev',
    );
    assert.equal(oddsReplayCommand('2026-11-17', 'fanduel', 'tail-jev'), 'npm start -- odds=2026-11-17 model=tail-jev');
  });
  withEnv({ ODDS_SOURCE: undefined }, () => {
    assert.equal(
      oddsReplayCommand('2026-11-17', 'the-odds-api', 'jev'),
      'ODDS_SOURCE=the-odds-api npm start -- odds=2026-11-17 model=jev',
    );
    assert.equal(oddsReplayCommand('2026-11-17', 'books', 'jev'), 'npm start -- odds=2026-11-17 model=jev');
    assert.equal(
      oddsReplayCommand('2026-11-17', 'fanduel', 'jev'),
      'ODDS_SOURCE=fanduel npm start -- odds=2026-11-17 model=jev',
    );
  });
});

test('a replay miss names the source, and a live save updates the day list', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const original = globalThis.fetch;
  const savedUrl = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h';
  const missingUrl = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?regions=us&markets=h2h';
  const liveUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?regions=us&markets=h2h';
  const savedAt = new Date().toISOString();
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  delete process.env.ODDS_SOURCE;
  setOddsReplay(null);
  globalThis.fetch = async () => new Response(JSON.stringify([oddsGame('fresh')]), {
    status: 200,
    headers: { 'x-requests-remaining': '10' },
  });
  try {
    const { hash, request } = oddsRequestKey(savedUrl);
    await writeFile(`${dir}/${hash}.json`, `${JSON.stringify({
      savedAt,
      remaining: 10,
      body: [oddsGame('odds-api')],
      request,
    })}\n`);
    process.env.ODDS_SOURCE = 'fanduel';
    setOddsReplay(easternDay(savedAt));
    await assert.rejects(oddsGet(savedUrl), /No FanDuel odds saved on .+ by The Odds API[\s\S]*ODDS_SOURCE=the-odds-api/);
    await assert.rejects(oddsGet(missingUrl), (error: Error) => {
      assert.match(error.message, /No FanDuel odds saved/);
      assert.doesNotMatch(error.message, /ODDS_SOURCE=/);
      return true;
    });
    process.env.ODDS_SOURCE = 'the-odds-api';
    const replay = await oddsGet(savedUrl);
    assert.equal(replay.cached, true);
    assert.ok(Array.isArray(replay.body));
    assert.equal(replay.body[0]?.id, 'odds-api');
    setOddsReplay(null);
    await assert.rejects(oddsGet(liveUrl), /no longer called/);
    const days = await listSavedOdds();
    const nhl = days.flatMap((day) => day.slates).find((slate) => slate.sport === 'icehockey_nhl');
    assert.equal(nhl, undefined);
  } finally {
    globalThis.fetch = original;
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a replaced snapshot keeps the previous file in the archive', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-snapshot-`);
  const first = { savedAt: '2026-11-18T15:00:00.000Z', title: 'first' };
  const second = { savedAt: '2026-11-18T18:00:00.000Z', title: 'second' };
  try {
    const created = await saveDecisionSnapshot(dir, '2026-11-15', 'tail-jev', first);
    assert.equal(created.archived, undefined);
    assert.equal(created.path.endsWith('/2026-11-15-tail-jev.json'), true);
    const replaced = await saveDecisionSnapshot(dir, '2026-11-15', 'tail-jev', second);
    assert.equal(replaced.path, created.path);
    assert.match(replaced.archived ?? '', /archive\/2026-11-15-tail-jev-2026-11-18T150000Z\.json$/);
    const archived = JSON.parse(await readFile(replaced.archived ?? '', 'utf8')) as { title: string };
    const current = JSON.parse(await readFile(replaced.path, 'utf8')) as { title: string };
    assert.equal(archived.title, 'first');
    assert.equal(current.title, 'second');
    const same = await saveDecisionSnapshot(dir, '2026-11-15', 'tail-jev', second);
    assert.equal(same.archived, undefined);
    assert.equal(archiveStamp('2026-11-18T15:00:00.000Z'), '2026-11-18T150000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('espn pages last for the eastern day, and injuries are shorter', () => {
  const saved = '2026-11-18T15:00:00Z';
  const threeHours = Date.parse('2026-11-18T18:00:00Z');
  assert.equal(ESPN_INJURY_HOURS < ESPN_DAY_HOURS, true);
  assert.equal(espnCacheFresh(saved, 'injury', threeHours - 1), true);
  assert.equal(espnCacheFresh(saved, 'injury', threeHours), false);
  assert.equal(espnCacheFresh(saved, 'day', Date.parse('2026-11-18T19:00:01Z')), true);
  assert.equal(espnCacheFresh('2026-11-18T04:00:00Z', 'day', Date.parse('2026-11-18T06:00:00Z')), false);
  assert.equal(espnCacheFresh('2026-11-18T06:00:00Z', 'day', Date.parse('2026-11-19T02:00:00Z')), false);
});

test('a same-day espn page is reused and a stale page is not', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-espn-`);
  const previous = process.env.ESPN_CACHE_DIR;
  process.env.ESPN_CACHE_DIR = dir;
  const teams = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32';
  const injury = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
  const gamelog = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/1/gamelog';
  try {
    assert.equal(await readEspnCache(teams, 'day'), undefined);
    await writeEspnCache(teams, { teams: 32 });
    assert.deepEqual(await readEspnCache(teams, 'day'), { teams: 32 });
    await writeEspnCache(gamelog, { names: ['rush'] });
    assert.deepEqual(await readEspnCache(gamelog, 'day'), { names: ['rush'] });
    await writeEspnCache(injury, { injuries: 1 }, '2020-01-01T00:00:00.000Z');
    assert.equal(await readEspnCache(injury, 'injury'), undefined);
    await writeEspnCache('https://example.test/teams', { no: true });
    assert.equal(await readEspnCache('https://example.test/teams', 'day'), undefined);
  } finally {
    if (previous == null) delete process.env.ESPN_CACHE_DIR;
    else process.env.ESPN_CACHE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a live odds response writes a quota line without the url or the key', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-quota-`);
  const previousLog = process.env.QUOTA_LOG;
  const previousPath = process.env.QUOTA_LOG_PATH;
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousCache = process.env.ODDS_CACHE;
  const previousSource = process.env.ODDS_SOURCE;
  const original = globalThis.fetch;
  const log = `${dir}/quota.jsonl`;
  process.env.QUOTA_LOG = '1';
  process.env.QUOTA_LOG_PATH = log;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  const slate = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=secret-key&regions=us&markets=h2h';
  const prop = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/evt-9/odds?apiKey=secret-key&regions=us&markets=player_goal_scorer_anytime';
  const game = {
    id: 'evt-9',
    commence_time: '2026-11-18T23:00:00Z',
    home_team: 'Home',
    away_team: 'Away',
    bookmakers: [],
  };
  globalThis.fetch = async () => new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'x-requests-remaining': '42' },
  });
  try {
    const shaped = quotaEntry(
      '/v4/sports/icehockey_nhl/events/evt-9/odds?regions=us',
      'live',
      42,
      new Date('2026-11-18T15:00:00Z'),
    );
    assert.equal(shaped.time, '2026-11-18T10:00:00');
    assert.equal(shaped.sport, 'icehockey_nhl');
    assert.equal(shaped.event, 'evt-9');
    assert.equal(easternClock(new Date('2026-11-18T15:00:00Z')), '2026-11-18T10:00:00');
    assert.equal(JSON.stringify(shaped).includes('http'), false);
    assert.equal(JSON.stringify(shaped).includes('apiKey'), false);

    await assert.rejects(oddsGet(slate), /no longer called/);
    await writeOdds(dir, prop, new Date().toISOString(), game);
    const cached = await oddsGet(prop);
    assert.equal(cached.cached, true);
    const lines = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { sport: string; event?: string; source: string; remaining: number | null });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.sport, 'icehockey_nhl');
    assert.equal(lines[0]?.event, 'evt-9');
    assert.equal(lines[0]?.source, 'cached');
    assert.equal(lines[0]?.remaining, null);
    const text = await readFile(log, 'utf8');
    assert.equal(text.includes('secret-key'), false);
    assert.equal(text.includes('apiKey'), false);
    assert.equal(text.includes('http'), false);
  } finally {
    globalThis.fetch = original;
    setOddsReplay(null);
    if (previousLog == null) delete process.env.QUOTA_LOG;
    else process.env.QUOTA_LOG = previousLog;
    if (previousPath == null) delete process.env.QUOTA_LOG_PATH;
    else process.env.QUOTA_LOG_PATH = previousPath;
    process.env.QUOTA_LOG ??= '0';
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

test('the header names the odds source beside the model', () => {
  assert.equal(oddsSourceLabel('fanduel'), 'FanDuel');
  assert.equal(oddsSourceLabel('the-odds-api'), 'The Odds API');
  assert.equal(oddsSourceLabel(undefined), '');
  assert.equal(savedOddsLabel('fanduel', 'fanduel'), 'FanDuel');
  assert.equal(savedOddsLabel('fanduel', 'the-odds-api'), 'FanDuel · The Odds API');
  assert.equal(savedOddsLabel(undefined), '');

  const board = { title: 'NFL', groups: [] as string[][][] };
  const saved: SavedSlate = {
    savedAt: '2026-11-19T02:00:24.234Z',
    model: 'jev',
    oddsSource: 'fanduel',
    title: 'NFL',
    groups: [],
    sports: [{
      label: 'Football',
      leagues: [{ label: 'NFL', short: 'NFL', games: board, props: { title: 'Props', groups: [] } }],
    }],
  };
  const wide = slateHeaders(saved, 100, [0, 0, 0]);
  assert.match(wide[0] ?? '', /Model: Jev {2}Odds Source: FanDuel {3}x $/);
  assert.equal((wide[0] ?? '').length, 100);
  const oddsApi = slateHeaders({ ...saved, oddsSource: 'the-odds-api' }, 120, [0, 0, 0]);
  assert.match(oddsApi[0] ?? '', /Model: Jev {2}Odds Source: The Odds API {3}x $/);
  const blank = slateHeaders({ ...saved, oddsSource: undefined }, 100, [0, 0, 0]);
  assert.equal((blank[0] ?? '').includes('Odds Source'), false);
  assert.match(blank[0] ?? '', /Model: Jev {3}x $/);
  const narrow = slateHeaders(saved, 30, [0, 0, 0]);
  assert.equal((narrow[0] ?? '').includes('Odds Source'), false);
  assert.match(narrow[0] ?? '', /Model: Jev {3}x $/);
  const squeezed = slateHeaders(saved, 40, [0, 0, 0]);
  assert.match(squeezed[0] ?? '', /^ Football /);
  assert.equal((squeezed[0] ?? '').includes('Odds Source'), false);
  for (const width of [30, 40, 60, 80, 120]) {
    for (const line of slateHeaders(saved, width, [0, 0, 0])) {
      assert.equal(line.length <= width, true, `${line.length} > ${width}`);
    }
    for (const line of slateHeaders({ ...saved, model: 'tail-jev', oddsSource: 'the-odds-api' }, width, [0, 0, 0])) {
      assert.equal(line.length <= width, true, `${line.length} > ${width}`);
    }
  }
});

test('a Formula 1 driver keeps the hardest bet that clears 0.60', () => {
  const quotes = [
    { marketType: 'PODIUM_FINISH', name: 'Max Verstappen', price: -360, selectionId: 'podium-max' },
    { marketType: 'F1_ALT_DRIVER_TO_FINISH_TOP_2', name: 'Max Verstappen', price: -195, selectionId: 'top2-max' },
    { marketType: 'OUTRIGHT_BETTING', name: 'Max Verstappen', price: 145, selectionId: 'win-max' },
    { marketType: 'PODIUM_FINISH', name: 'George Russell', price: -195, selectionId: 'podium-george' },
    { marketType: 'F1_ALT_DRIVER_TO_FINISH_TOP_2', name: 'George Russell', price: 140, selectionId: 'top2-george' },
    { marketType: 'PODIUM_FINISH', name: 'Lando Norris', price: -140, selectionId: 'podium-lando' },
    { marketType: 'OUTRIGHT_BETTING', name: 'Kimi Antonelli', price: -150, selectionId: 'win-kimi' },
    { marketType: 'PODIUM_FINISH', name: 'Kimi Antonelli', price: -400, selectionId: 'podium-kimi' },
    { marketType: 'SAFETY_CAR', name: 'Yes', price: -275, selectionId: 'safety' },
  ];
  const chosen = chooseDriverBets(quotes);
  const byName = new Map(chosen.map((bet) => [bet.name, bet]));
  assert.equal(byName.get('Max Verstappen')?.phrase, 'to finish top 2');
  assert.equal(byName.get('Max Verstappen')?.selectionId, 'top2-max');
  assert.equal(byName.get('George Russell')?.phrase, 'to finish on the podium');
  assert.equal(byName.has('Lando Norris'), false);
  assert.equal(byName.get('Kimi Antonelli')?.phrase, 'to win the race');
  assert.equal(byName.get('Kimi Antonelli')?.price, -150);
  assert.equal(byName.has('Yes'), false);
});

test('Formula 1 prices stay on FanDuel when the run uses The Odds API', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousFetch = globalThis.fetch;
  const url = 'https://api.the-odds-api.com/v4/sports/motorsport_f1/odds?regions=us&markets=h2h&commenceTimeFrom=2026-11-19T05:00:00Z&commenceTimeTo=2026-11-20T05:00:00Z';
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('Formula 1 must not call The Odds API.');
  }) as typeof fetch;
  try {
    assert.equal(oddsRequestSource(url), 'fanduel');
    withEnv({ ODDS_SOURCE: 'fanduel' }, () => {
      assert.equal(oddsRequestSource(url), 'fanduel');
    });
    assert.equal(oddsRequestSource('https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds'), 'the-odds-api');
    withEnv({ ODDS_SOURCE: undefined }, () => {
      assert.equal(oddsRequestSource('https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds'), 'books');
      assert.equal(oddsRequestSource(url), 'fanduel');
    });
    const { hash, request } = oddsRequestKey(url);
    await writeFile(`${dir}/${oddsCacheName(hash, 'fanduel')}`, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      remaining: null,
      body: [{
        id: '36297007:82532500',
        commence_time: '2026-11-20T00:30:00Z',
        home_team: 'Max Verstappen',
        away_team: 'Las Vegas Grand Prix',
        bookmakers: [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Max Verstappen', price: -195, description: 'to finish top 2' }] }] }],
      }],
      request,
      source: 'fanduel',
    })}\n`);
    const result = await oddsGet(url);
    assert.equal(called, false);
    assert.equal(result.cached, true);
    assert.equal(Array.isArray(result.body) && result.body[0]?.home_team, 'Max Verstappen');
  } finally {
    globalThis.fetch = previousFetch;
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Formula 1 brief uses championship points from the last five races', () => {
  const line = driverLine({
    athlete: { displayName: 'Max Verstappen' },
    stats: [
      { name: 'rank', displayValue: '2' },
      { name: 'championshipPts', displayValue: '279' },
      { name: 'USA', displayValue: '15', played: true },
      { name: 'MEX', displayValue: '25', played: true },
      { name: 'BRA', displayValue: '-', played: true },
      { name: 'LAS', displayValue: '-', played: false },
    ],
  });
  assert.deepEqual(line, {
    name: 'Max Verstappen',
    rank: '2',
    points: '279',
    recent: ['15', '25', 'DNF'],
  });
  const lines = driverLines({
    children: [{ abbreviation: 'Driver', standings: { entries: [line && {
      athlete: { displayName: line.name },
      stats: [
        { name: 'rank', displayValue: '2' },
        { name: 'championshipPts', displayValue: '279' },
      ],
    }] } }],
  });
  assert.equal(matchDriver(lines, 'Max Verstappen')?.rank, '2');
  assert.equal(matchDriver(lines, 'George Russell'), undefined);
  const text = describeDriver('Max Verstappen', line ?? undefined, 'to finish top 2', 'Las Vegas Grand Prix');
  assert.match(text, /P2 in the 2026 championship with 279 points/);
  assert.match(text, /15, 25, and DNF points/);
  assert.match(text, /to finish top 2 at the Las Vegas Grand Prix/);
  assert.match(describeDriver('Oscar Piastri', undefined, 'to win the race', 'Las Vegas Grand Prix'), /no 2026 championship line/);
});

test('the sport row keeps Formula 1 inside the terminal width', () => {
  const league = (label: string, short: string) => ({
    label,
    short,
    games: { title: label, groups: [] as string[][][] },
    props: { title: 'Props', groups: [] as string[][][] },
  });
  const saved: SavedSlate = {
    savedAt: '2026-11-19T18:00:00.000Z',
    model: 'jev',
    oddsSource: 'the-odds-api',
    title: 'NFL',
    groups: [],
    sports: [
      { label: 'Football', leagues: [league('NFL', 'NFL')] },
      { label: 'Soccer', leagues: [league('Premier League', 'EPL')] },
      { label: 'Hockey', leagues: [league('NHL', 'NHL')] },
      { label: 'Basketball', leagues: [league('NBA', 'NBA')] },
      { label: 'Baseball', leagues: [league('MLB', 'MLB')] },
      { label: 'Formula 1', leagues: [league('F1', 'F1')] },
    ],
  };
  const wide = slateHeaders(saved, 160, [0, 0, 0]);
  assert.match(wide[0] ?? '', /Formula 1/);
  const shorts = slateHeaders(saved, 100, [0, 0, 0]);
  assert.match(shorts[0] ?? '', / F1 /);
  assert.equal((shorts[0] ?? '').includes('Formula 1'), false);
  for (const width of [40, 55, 70, 90, 120, 160]) {
    for (const line of slateHeaders(saved, width, [5, 0, 0])) {
      assert.equal(line.length <= width, true, `${line.length} > ${width}: ${line}`);
    }
  }
});

async function fixture(name: string) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as any;
}

function same(name: string) {
  return name;
}

function outcomes(event: { bookmakers: { markets: { key: string; outcomes: { name: string; price: number; point?: number; description?: string }[] }[] }[] }, key: string) {
  return event.bookmakers[0]?.markets.find((market) => market.key === key)?.outcomes ?? [];
}

test('direct books normalize the Illinois shapes the boards already read', async () => {
  const draftkings = await fixture('draftkings.json');
  const slate = normalizeDraftKings(draftkings, { from: '', to: '', resolve: same });
  const nfl = slate.find((event) => event.id === '34118011');
  const soccer = slate.find((event) => event.id === 'soccer1');
  assert.ok(nfl && soccer);
  assert.deepEqual(outcomes(nfl, 'h2h'), [
    { name: 'IND Colts', price: 500 },
    { name: 'HOU Texans', price: -690 },
  ]);
  assert.deepEqual(outcomes(soccer, 'h2h').map((row) => row.name), ['Man City', 'Draw', 'Fulham']);
  assert.deepEqual(outcomes(soccer, 'spreads').map((row) => row.point), [0.5, -0.5]);
  assert.deepEqual(outcomes(soccer, 'totals').map((row) => row.point), [2.5, 2.5]);
  const props = normalizeDraftKings(draftkings, { from: '', to: '', resolve: same, props: true, eventId: '34118011' });
  const propEvent = props.find((event) => event.id === '34118011');
  assert.ok(propEvent);
  assert.deepEqual(outcomes(propEvent, 'player_pass_yds'), [
    { name: 'Over', price: -112, point: 303.5, description: 'Joe Burrow' },
    { name: 'Under', price: -112, point: 303.5, description: 'Joe Burrow' },
  ]);
  assert.deepEqual(outcomes(propEvent, 'player_anytime_td'), [
    { name: 'Yes', price: -140, description: 'Chase Brown' },
  ]);
  assert.equal(propEvent.bookmakers[0]?.markets.some((market) => market.key === 'player_pass_yds' && market.outcomes.some((row) => row.description === '220+')), false);

  const caesars = await fixture('caesars.json');
  const caesarsSlate = normalizeCaesars(caesars.events, { from: '', to: '', resolve: same, mode: 'slate' });
  const texans = caesarsSlate.find((event) => event.home_team === 'Houston Texans');
  const bodo = caesarsSlate.find((event) => event.home_team === 'Bodo/Glimt');
  assert.ok(texans && bodo);
  const caesarsSpread = outcomes(texans, 'spreads');
  assert.deepEqual(caesarsSpread.find((row) => row.name === 'Houston Texans'), { name: 'Houston Texans', price: -110, point: -12.5 });
  assert.deepEqual(caesarsSpread.find((row) => row.name === 'Indianapolis Colts'), { name: 'Indianapolis Colts', price: -110, point: 12.5 });
  assert.deepEqual(outcomes(bodo, 'h2h').map((row) => row.name), ['Bodo/Glimt', 'Draw', 'Fulham']);
  const caesarsProps = normalizeCaesars(caesars.events, { from: '', to: '', resolve: same, mode: 'props' });
  const passing = caesarsProps.find((event) => outcomes(event, 'player_pass_yds').length);
  assert.ok(passing);
  assert.deepEqual(outcomes(passing, 'player_pass_yds'), [
    { name: 'Over', price: -115, point: 253.5, description: 'C.J. Stroud' },
    { name: 'Under', price: -105, point: 253.5, description: 'C.J. Stroud' },
  ]);
  assert.equal(passing.bookmakers[0]?.markets.some((market) => market.outcomes.some((row) => row.description === 'Daniel Jones')), false);

  const betmgm = await fixture('betmgm.json');
  const nflMgm = normalizeBetMgm([betmgm.fixtures[0]], { from: '', to: '', resolve: same, soccer: false, mode: 'slate' });
  assert.equal(nflMgm[0]?.id, '6:44037');
  assert.deepEqual(outcomes(nflMgm[0]!, 'h2h').map((row) => row.name), ['Pittsburgh Steelers', 'Philadelphia Eagles']);
  assert.deepEqual(outcomes(nflMgm[0]!, 'spreads').map((row) => ({ name: row.name, point: row.point })), [
    { name: 'Pittsburgh Steelers', point: -4 },
    { name: 'Philadelphia Eagles', point: 4 },
  ]);
  const soccerMgm = normalizeBetMgm([betmgm.fixtures[1]], { from: '', to: '', resolve: same, soccer: true, mode: 'slate' });
  assert.equal(outcomes(soccerMgm[0]!, 'h2h').length, 0);
  assert.deepEqual(outcomes(soccerMgm[0]!, 'spreads').map((row) => ({ name: row.name, point: row.point })), [
    { name: 'Newcastle United', point: 0.5 },
    { name: 'Arsenal', point: -0.5 },
  ]);
  assert.deepEqual(outcomes(soccerMgm[0]!, 'totals').map((row) => row.point), [2.5, 2.5]);
  const mgmProps = normalizeBetMgm(betmgm.fixtures, { from: '', to: '', resolve: same, soccer: false, mode: 'props' });
  const steelers = mgmProps.find((event) => event.id === '6:44037');
  assert.ok(steelers);
  assert.deepEqual(outcomes(steelers, 'player_pass_yds'), [
    { name: 'Over', price: -115, point: 205.5, description: 'Aaron Rodgers' },
    { name: 'Under', price: -105, point: 205.5, description: 'Aaron Rodgers' },
  ]);
  assert.deepEqual(outcomes(steelers, 'player_anytime_td'), [
    { name: 'Yes', price: 120, description: 'DeVonta Smith' },
  ]);
});

test('merged book ids and cache files stay apart', () => {
  assert.deepEqual(splitBookId('fd=10,dk=20,mgm=6:44037,czr='), { fd: '10', dk: '20', mgm: '6:44037', czr: '' });
  assert.equal(splitBookId('34118011'), null);
  const merged = mergeBookEvents([
    { source: 'fanduel', events: [{ id: '10', commence_time: '2026-11-20T01:15:00Z', home_team: 'Houston Texans', away_team: 'Indianapolis Colts', bookmakers: [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Houston Texans', price: -690 }] }] }] }] },
    { source: 'draftkings', events: [{ id: '20', commence_time: '2026-11-20T01:15:00Z', home_team: 'Houston Texans', away_team: 'Indianapolis Colts', bookmakers: [{ key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Houston Texans', price: -650 }] }] }] }] },
    { source: 'williamhill_us', events: [{ id: '30', commence_time: '2026-11-21T01:15:00Z', home_team: 'Houston Texans', away_team: 'Indianapolis Colts', bookmakers: [{ key: 'williamhill_us', markets: [] }] }] },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.id, compositeId({ fd: '10', dk: '20' }));
  assert.deepEqual(merged[0]?.bookmakers.map((book) => book.key), ['fanduel', 'draftkings']);
  const hash = 'abc123';
  assert.equal(oddsCacheName(hash, 'draftkings'), `draftkings-${hash}.json`);
  assert.equal(oddsCacheName(hash, 'betmgm'), `betmgm-${hash}.json`);
  assert.equal(oddsCacheName(hash, 'caesars'), `caesars-${hash}.json`);
  assert.equal(oddsCacheName(hash, 'books'), `books-${hash}.json`);
  assert.equal(oddsCacheName(hash, 'the-odds-api'), `${hash}.json`);
  resetMergedBooks();
  assert.equal(oddsSourceLabel('books'), 'FanDuel · DraftKings · BetMGM · Caesars');
  assert.equal(oddsSourceLabel('draftkings'), 'DraftKings');
  assert.equal(oddsSourceLabel('betmgm'), 'BetMGM');
  assert.equal(oddsSourceLabel('caesars'), 'Caesars');
  assert.equal(oddsSourceLabel('nope'), '');
  recordMergedBook('betmgm', false);
  assert.equal(oddsSourceLabel('books'), 'FanDuel · DraftKings · Caesars');
  resetMergedBooks();
});

test('a direct source does not require the Odds API key', () => {
  withEnv({
    ODDS_SOURCE: 'books',
    ODDS_API_KEY: undefined,
    TYPESAFE_API_KEY: 'present',
  }, () => {
    requireRunKeys('jev');
  });
  withEnv({
    ODDS_SOURCE: 'draftkings',
    ODDS_API_KEY: undefined,
    TYPESAFE_API_KEY: 'present',
  }, () => {
    requireRunKeys('jev');
  });
});

test('a replay miss names every other source that saved that day', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h';
  const savedAt = new Date().toISOString();
  process.env.ODDS_CACHE_DIR = dir;
  setOddsReplay(null);
  try {
    const { request } = oddsRequestKey(url);
    const event = oddsGame('saved');
    await writeFile(`${dir}/caesars-third.json`, `${JSON.stringify({
      savedAt,
      remaining: null,
      body: [event],
      request,
      source: 'caesars',
    })}\n`);
    await writeFile(`${dir}/fanduel-third.json`, `${JSON.stringify({
      savedAt,
      remaining: null,
      body: [event],
      request,
      source: 'fanduel',
    })}\n`);
    process.env.ODDS_SOURCE = 'draftkings';
    setOddsReplay(easternDay(savedAt));
    await assert.rejects(oddsGet(url), (error: Error) => {
      assert.match(error.message, /No DraftKings odds saved/);
      assert.match(error.message, /Caesars/);
      assert.match(error.message, /FanDuel/);
      assert.match(error.message, /ODDS_SOURCE=caesars/);
      assert.match(error.message, /ODDS_SOURCE=fanduel/);
      return true;
    });
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    await rm(dir, { recursive: true, force: true });
  }
});

test('resetBookReads drops in-memory book prices', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-espn-`);
  const previousEspn = process.env.ESPN_CACHE_DIR;
  const original = globalThis.fetch;
  let draftKingsCalls = 0;
  process.env.ESPN_CACHE_DIR = dir;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('draftkings.com')) draftKingsCalls += 1;
    return new Response(JSON.stringify({ events: [], markets: [], selections: [], sports: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const oddsUrl = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h';
  try {
    resetBookReads();
    assert.equal(bookCacheSize(), 0);
    await draftkingsFetch(oddsUrl);
    const afterFirst = draftKingsCalls;
    assert.ok(afterFirst > 0);
    assert.ok(draftKingsCacheSize() > 0);
    await draftkingsFetch(oddsUrl);
    assert.equal(draftKingsCalls, afterFirst);
    const cached = { id: '1', optionMarkets: [{ name: { value: 'Moneyline' } }] };
    holdBetMgmSport('11', [cached]);
    assert.equal(betMgmSessionOpen(), true);
    assert.ok(betMgmCacheSize() > 0);
    recordMergedBook('betmgm', false);
    assert.equal(oddsSourceLabel('books').includes('BetMGM'), false);
    resetBookReads();
    assert.equal(draftKingsCacheSize(), 0);
    assert.equal(betMgmCacheSize(), 0);
    assert.equal(betMgmSessionOpen(), false);
    assert.equal(bookCacheSize(), 0);
    assert.equal(oddsSourceLabel('books'), 'FanDuel · DraftKings · BetMGM · Caesars');
    assert.equal(cached.optionMarkets?.length, 1);
    await draftkingsFetch(oddsUrl);
    assert.ok(draftKingsCalls > afterFirst);
  } finally {
    globalThis.fetch = original;
    resetBookReads();
    if (previousEspn == null) delete process.env.ESPN_CACHE_DIR;
    else process.env.ESPN_CACHE_DIR = previousEspn;
    await rm(dir, { recursive: true, force: true });
  }
});

test('BetMGM spread copy leaves the cached fixture alone', () => {
  const fixture = { id: '1', optionMarkets: [{ name: { value: 'Moneyline' } }] };
  const next = attachSpreads(fixture, [{ name: { value: 'Spread' } }]);
  assert.notEqual(next, fixture);
  assert.equal(fixture.optionMarkets?.length, 1);
  assert.equal(next.optionMarkets?.length, 2);
  assert.notEqual(next.optionMarkets, fixture.optionMarkets);
});

test('bookEventId reads one book from a merged prop id', async () => {
  const combined = 'fd=10,dk=20,mgm=6:44037,czr=';
  assert.equal(bookEventId(combined, 'fd'), '10');
  assert.equal(bookEventId(combined, 'dk'), '20');
  assert.equal(bookEventId(combined, 'mgm'), '6:44037');
  assert.equal(bookEventId(combined, 'czr'), '');
  assert.equal(bookEventId('fd=,dk=20,mgm=6:44037,czr=9', 'fd'), '');
  assert.equal(bookEventId('34118011', 'fd'), '34118011');
  assert.equal(bookEventId('fd%3D10%2Cdk%3D20%2Cmgm%3D6%3A44037%2Cczr%3D', 'dk'), '20');
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/fd=,dk=20,mgm=6:1,czr=/odds?markets=player_pass_yds';
    assert.deepEqual(await fanduelFetch(url), []);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('a merged props read keeps every book even when the team names differ', () => {
  const priced = (key: string, player: string) => ({
    key,
    markets: [{ key: 'player_goal_scorer_anytime', outcomes: [{ name: 'Yes', price: -110, description: player }] }],
  });
  const merged = mergePropEvent('fd=10,dk=20,mgm=,czr=', [
    {
      source: 'fanduel',
      events: [{
        id: '10',
        commence_time: '2026-11-21T15:00:00Z',
        home_team: 'Man City',
        away_team: 'Arsenal',
        bookmakers: [priced('fanduel', 'Haaland')],
      }],
    },
    {
      source: 'draftkings',
      events: [{
        id: '20',
        commence_time: '2026-11-21T15:00:00Z',
        home_team: 'Manchester City',
        away_team: 'Arsenal',
        bookmakers: [priced('draftkings', 'Haaland')],
      }],
    },
    {
      source: 'betmgm',
      events: [{
        id: '30',
        commence_time: '2026-11-21T15:00:00Z',
        home_team: 'Home',
        away_team: 'Away',
        bookmakers: [],
      }],
    },
  ]);
  assert.equal(merged.home_team, 'Man City');
  assert.equal(merged.id, 'fd=10,dk=20,mgm=,czr=');
  assert.deepEqual(merged.bookmakers.map((book) => book.key), ['fanduel', 'draftkings']);
  const empty = mergePropEvent('fd=,dk=,mgm=,czr=', [{ source: 'fanduel', events: [] }]);
  assert.equal(empty.home_team, 'Home');
  assert.deepEqual(empty.bookmakers, []);
});

test('a dated run does not reuse another day from the family cache', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const saved = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&commenceTimeFrom=2026-11-21T05:00:00Z&commenceTimeTo=2026-11-22T05:00:00Z';
  const next = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&commenceTimeFrom=2026-11-22T05:00:00Z&commenceTimeTo=2026-11-23T05:00:00Z';
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'books';
  setOddsReplay(null);
  try {
    const { hash, request } = oddsRequestKey(saved);
    const game = { ...oddsGame('nov-21'), commence_time: '2026-11-21T18:00:00Z', bookmakers: [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: -150 }] }] }] };
    await writeFile(`${dir}/${oddsCacheName(hash, 'books')}`, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      remaining: null,
      body: [game],
      request,
      source: 'books',
    })}\n`);
    const missed = await oddsGet(next, undefined, { cacheOnly: true });
    assert.equal(missed.skipped, true);
    assert.equal(missed.body, null);
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a partial merged read stays fresh for 30 minutes', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-odds-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h';
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'books';
  setOddsReplay(null);
  try {
    const { hash, request } = oddsRequestKey(url);
    const file = `${dir}/${oddsCacheName(hash, 'books')}`;
    const game = { ...oddsGame('partial'), bookmakers: [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: -150 }] }] }] };
    const write = (savedAt: string) => writeFile(file, `${JSON.stringify({
      savedAt,
      remaining: null,
      body: [game],
      request,
      source: 'books',
      partial: true,
    })}\n`);
    await write(new Date(Date.now() - 31 * 60_000).toISOString());
    const stale = await oddsGet(url, undefined, { cacheOnly: true });
    assert.equal(stale.skipped, true);
    await write(new Date(Date.now() - 5 * 60_000).toISOString());
    const fresh = await oddsGet(url, undefined, { cacheOnly: true });
    assert.equal(fresh.cached, true);
    assert.ok(Array.isArray(fresh.body));
    assert.equal(fresh.body[0]?.id, 'partial');
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('BetMGM baseball keeps MLB and drops the other league', () => {
  const game = (id: string, competition: string, home: string, away: string) => ({
    id,
    startDate: '2026-11-21T18:00:00Z',
    fixtureType: 'PairGame',
    stage: 'PreMatch',
    isOpenForBetting: true,
    competition: { name: { value: competition } },
    participants: [
      { name: { value: home }, properties: { type: 'HomeTeam' } },
      { name: { value: away }, properties: { type: 'AwayTeam' } },
    ],
    optionMarkets: [{
      name: { value: 'Moneyline' },
      parameters: [
        { key: 'MarketType', value: '2way' },
        { key: 'Period', value: 'FullTime' },
      ],
      options: [
        { name: { value: home }, price: { americanOdds: -150 }, status: 'Visible' },
        { name: { value: away }, price: { americanOdds: 130 }, status: 'Visible' },
      ],
    }],
  });
  const events = normalizeBetMgm(
    [game('mlb', 'MLB', 'New York Yankees', 'Boston Red Sox'), game('winter', 'LIDOM', 'Tigres', 'Leones')],
    { from: '', to: '', resolve: (name) => name, soccer: false, mode: 'slate', sportKey: 'baseball_mlb' },
  );
  assert.deepEqual(events.map((event) => event.id), ['mlb']);
});

test('an extra prop prefers 0.60 and can use a lower featured price', () => {
  const row = (player: string, impliedPrice: number) => ({ implied: impliedPrice, market: 'player_steals', player });
  assert.equal(pickLayeredExtra('Lakers', [[row('Star', 0.55)]])?.player, 'Star');
  assert.equal(pickLayeredExtra('Lakers', [[row('Star', 0.65)], [row('Other', 0.8)]])?.player, 'Star');
  assert.equal(pickLayeredExtra('Lakers', [[], [row('Backup', 0.55)]])?.player, 'Backup');
});

test('rare stat unders are not extra props', () => {
  const option = (market: string, side: 'Over' | 'Under', point: number) => ({
    market,
    side,
    posted: { point },
    ref: { name: 'Player', pos: 'G' },
  });
  assert.equal(nbaRealExtra(option('player_steals', 'Under', 1.5)), false);
  assert.equal(nbaRealExtra(option('player_blocks', 'Under', 1.5)), false);
  assert.equal(nbaRealExtra(option('player_steals', 'Over', 0.5)), true);
  assert.equal(mlbRealExtra(option('batter_stolen_bases', 'Under', 1.5)), false);
  assert.equal(mlbRealExtra(option('batter_stolen_bases', 'Over', 0.5)), true);
  assert.equal(mlbRealExtra(option('batter_total_bases', 'Under', 1.5)), true);
  assert.equal(nhlRealExtra(option('player_power_play_points', 'Under', 1.5)), false);
  assert.equal(nhlRealExtra(option('player_power_play_points', 'Over', 0.5)), true);
  assert.equal(nhlRealExtra(option('player_total_saves', 'Over', 18.5)), true);
  assert.equal(footballRealExtra(option('player_pass_tds', 'Under', 0.5)), false);
  assert.equal(footballRealExtra(option('player_pass_tds', 'Over', 1.5)), true);
  assert.equal(footballRealExtra(option('player_field_goals', 'Under', 1.5)), false);
  assert.equal(footballRealExtra(option('player_field_goals', 'Over', 1.5)), true);
});

test('the main line beats an alternate that is closer on one side', () => {
  const main = pickBalanced([
    [{ label: 'Over', price: -110, point: 45.5 }, { label: 'Under', price: -110, point: 45.5 }],
    [{ label: 'Over', price: 100, point: 47.5 }, { label: 'Under', price: -125, point: 47.5 }],
  ]);
  assert.equal(main[0]?.point, 45.5);
});

test('spread pairing keeps pickem and does not pair a team with itself', () => {
  const pickem = balancedSpreads([
    { name: 'Chiefs', price: -110, point: 0 },
    { name: 'Raiders', price: -110, point: 0 },
  ]);
  assert.deepEqual(pickem.map((side) => side.label), ['Chiefs', 'Raiders']);
  const line = balancedSpreads([
    { name: 'Bills', price: -110, point: -3.5 },
    { name: 'Dolphins', price: -110, point: 3.5 },
  ]);
  assert.deepEqual(line.map((side) => side.point), [3.5, -3.5]);
  const doubled = balancedSpreads([
    { name: 'Bills', price: -110, point: -3.5 },
    { name: 'Bills', price: -105, point: -3.5 },
    { name: 'Dolphins', price: -110, point: 3.5 },
  ]);
  assert.equal(doubled.length, 2);
  assert.equal(new Set(doubled.map((side) => side.label)).size, 2);
  const alone = balancedSpreads([
    { name: 'Bills', price: -110, point: -3.5 },
    { name: 'Bills', price: -105, point: 3.5 },
  ]);
  assert.equal(alone.length, 0);
});

test('scrubText replaces a key, a bearer token, and a tailnet address', () => {
  const previousUrl = process.env.AUTOJEV_URL;
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.AUTOJEV_URL = 'http://tailnet.example.test/v1';
  process.env.TYPESAFE_API_KEY = 'typesafe-secret-value';
  try {
    const text = scrubText('failed http://tailnet.example.test/v1 key typesafe-secret-value Bearer other-token-value and apiKey=abcd1234');
    assert.equal(text.includes('tailnet.example'), false);
    assert.equal(text.includes('typesafe-secret'), false);
    assert.equal(text.includes('other-token-value'), false);
    assert.equal(text.includes('abcd1234'), false);
    assert.match(text, /AUTOJEV_URL/);
    assert.match(text, /TYPESAFE_API_KEY/);
    assert.match(text, /Bearer \*\*\*/);
    assert.match(text, /apiKey=\*\*\*/);
  } finally {
    if (previousUrl == null) delete process.env.AUTOJEV_URL;
    else process.env.AUTOJEV_URL = previousUrl;
    if (previousKey == null) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }
});

test('QUOTA_LOG=1 uses the default file and a path is QUOTA_LOG_PATH', () => {
  const previousLog = process.env.QUOTA_LOG;
  const previousPath = process.env.QUOTA_LOG_PATH;
  try {
    process.env.QUOTA_LOG = '0';
    delete process.env.QUOTA_LOG_PATH;
    assert.equal(quotaLogFile(), '');
    process.env.QUOTA_LOG = '1';
    assert.equal(quotaLogFile(), '');
    process.env.QUOTA_LOG_PATH = '/tmp/parlay-quota.jsonl';
    assert.equal(quotaLogFile(), '/tmp/parlay-quota.jsonl');
  } finally {
    if (previousLog == null) delete process.env.QUOTA_LOG;
    else process.env.QUOTA_LOG = previousLog;
    if (previousPath == null) delete process.env.QUOTA_LOG_PATH;
    else process.env.QUOTA_LOG_PATH = previousPath;
    process.env.QUOTA_LOG ??= '0';
  }
});

test('a unicode minus is an American price', () => {
  const rows = marketOutcomes(
    { runners: [{ selectionId: 1, runnerName: 'Chiefs', runnerStatus: 'ACTIVE' }] },
    { runnerDetails: [{ selectionId: 1, runnerStatus: 'ACTIVE', winRunnerOdds: { americanDisplayOdds: { americanOdds: '\u2212110' } } }] },
  );
  assert.equal(rows[0]?.price, -110);
  const props = propOutcomes(
    { key: 'player_anytime_td', kind: 'yes' },
    [{ runnerName: 'Player', odds: '\u2212110', runnerStatus: 'ACTIVE' }],
  );
  assert.equal(props[0]?.price, -110);
});

test('a FanDuel error names the status and leaves the body out', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>blocked</html>', { status: 403 });
  try {
    await assert.rejects(
      fanduelFetch('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h'),
      (error: Error) => {
        assert.match(error.message, /403/);
        assert.equal(error.message.includes('<html'), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('a Caesars data path stays on the Illinois host', () => {
  const url = caesarsDataUrl('/v4/events/abc-1');
  assert.match(url, /americanwagering\.com/);
  assert.match(url, /\/sb\/v4\/events\/abc-1$/);
  const encoded = caesarsDataUrl('/v4/events/x/tabs/Total%20Goals');
  assert.match(encoded, /americanwagering\.com/);
  assert.match(encoded, /Total%20Goals/);
  const queried = caesarsDataUrl('/v4/events/x?tab=1');
  assert.match(queried, /\/sb\/v4\/events\/x\?tab=1$/);
  assert.throws(() => caesarsDataUrl('https://evil.test/x'), /Caesars/);
  assert.throws(() => caesarsDataUrl('/v4/../admin'), /Caesars/);
  assert.throws(() => caesarsDataUrl('/../x'), /Caesars/);
  assert.throws(() => caesarsDataUrl('%2e%2e/x'), /Caesars/);
  assert.throws(() => caesarsDataUrl('//evil.example/x'), /Caesars/);
});

test('a placeholder event is Home at Away with no prices', () => {
  const row = placeholderEvent('e1', 'draftkings', '2026-12-01T18:00:00Z');
  assert.equal(row.home_team, 'Home');
  assert.equal(row.away_team, 'Away');
  assert.equal(row.id, 'e1');
  assert.equal(row.bookmakers[0]?.key, 'draftkings');
  assert.equal(row.bookmakers[0]?.markets.length, 0);
});

test('a doubleheader stays two games and each game keeps both books', () => {
  const game = (id: string, time: string, book: string) => ({
    id,
    commence_time: time,
    home_team: 'New York Yankees',
    away_team: 'Boston Red Sox',
    bookmakers: [{
      key: book,
      markets: [{
        key: 'h2h',
        outcomes: [
          { name: 'Boston Red Sox', price: -150 },
          { name: 'New York Yankees', price: 130 },
        ],
      }],
    }],
  });
  const early = '2026-06-01T17:05:00Z';
  const near = '2026-06-01T18:00:00Z';
  const late = '2026-06-01T23:10:00Z';
  const merged = mergeBookEvents([
    { source: 'fanduel', events: [game('fd-early', early, 'fanduel'), game('fd-late', late, 'fanduel')] },
    { source: 'draftkings', events: [game('dk-early', early, 'draftkings'), game('dk-near', near, 'draftkings'), game('dk-late', late, 'draftkings')] },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.every((event) => event.bookmakers.map((book) => book.key).sort().join() === 'draftkings,fanduel'), true);
  const ids = merged.map((event) => event.id).join(' ');
  assert.match(ids, /fd-early/);
  assert.match(ids, /dk-early/);
  assert.match(ids, /fd-late/);
  assert.match(ids, /dk-late/);
  assert.equal(ids.includes('dk-near'), false);
});

test('mapPool keeps order and limits how many run at once', async () => {
  let active = 0;
  let max = 0;
  const result = await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return item * 10;
  });
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(max, 2);
});

test('upcomingWindow starts at the first game still ahead', async () => {
  const original = globalThis.fetch;
  const now = Date.now();
  const old = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const soon = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const later = new Date(now + 26 * 60 * 60 * 1000).toISOString();
  globalThis.fetch = async () => new Response(JSON.stringify({
    week: { number: 12 },
    events: [{ date: old }, { date: soon }, { date: later }],
  }), { status: 200 });
  try {
    const window = await upcomingWindow(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      'NFL',
      undefined,
      (status) => `scoreboard ${status}`,
      { tailMs: 4 * 60 * 60 * 1000, label: (board) => `NFL week ${board.week?.number}` },
    );
    assert.equal(window.label, 'NFL week 12');
    assert.ok(Math.abs(Date.parse(window.from) - (Date.parse(soon) - 60 * 60 * 1000)) < 2000);
    assert.ok(Math.abs(Date.parse(window.to) - (Date.parse(later) + 4 * 60 * 60 * 1000)) < 2000);
  } finally {
    globalThis.fetch = original;
  }
});

test('a lock older than 12 hours is taken over', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-lock-stale-`);
  try {
    const old = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    await writeFile(`${dir}/slate.lock`, `${process.pid}\n${old}\n`);
    const release = await acquireRunLock(dir);
    assert.match(await readFile(`${dir}/slate.lock`, 'utf8'), new RegExp(`^${process.pid}\\n`));
    await release();
    const fresh = new Date().toISOString();
    await writeFile(`${dir}/slate.lock`, `${process.pid}\n${fresh}\n`);
    await assert.rejects(acquireRunLock(dir), new RegExp(`pid ${process.pid}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a family cache hit has to cover the requested window', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-window-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const sport = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american';
  const narrow = `${sport}&commenceTimeFrom=2026-11-21T05:00:00Z&commenceTimeTo=2026-11-22T05:00:00Z`;
  const wide = `${sport}&commenceTimeFrom=2026-11-21T05:00:00Z&commenceTimeTo=2026-11-26T05:00:00Z`;
  const day = `${sport}&commenceTimeFrom=2026-11-22T05:00:00Z&commenceTimeTo=2026-11-23T05:00:00Z`;
  const event = (id: string, time: string) => ({
    id,
    commence_time: time,
    home_team: 'Home',
    away_team: 'Away',
    bookmakers: [{ key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: -150 }, { name: 'Away', price: 130 }] }] }],
  });
  const save = async (url: string, savedAt: string, body: unknown) => {
    const { hash, request } = oddsRequestKey(url);
    await writeFile(`${dir}/${oddsCacheName(hash, 'books')}`, `${JSON.stringify({
      savedAt,
      remaining: null,
      body,
      request,
      source: 'books',
    })}\n`);
  };
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'books';
  setOddsReplay(null);
  try {
    await save(narrow, '2026-11-21T12:00:00Z', [event('nov-21', '2026-11-21T18:00:00Z')]);
    const missed = await oddsGet(wide, undefined, { cacheOnly: true });
    assert.equal(missed.skipped, true);
    await save(wide, '2026-11-21T08:00:00Z', [
      event('nov-21', '2026-11-21T18:00:00Z'),
      event('nov-22', '2026-11-22T18:00:00Z'),
      event('nov-25', '2026-11-25T18:00:00Z'),
    ]);
    const covered = await oddsGet(wide, undefined, { cacheOnly: true });
    assert.equal(covered.cached, true);
    assert.deepEqual((covered.body as { id: string }[]).map((row) => row.id).sort(), ['nov-21', 'nov-22', 'nov-25']);
    const sliced = await oddsGet(day, undefined, { cacheOnly: true });
    assert.equal(sliced.cached, true);
    assert.deepEqual((sliced.body as { id: string }[]).map((row) => row.id), ['nov-22']);
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a partial merged read is stored and an empty partial slate is not', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-partial-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const previousEspn = process.env.ESPN_CACHE_DIR;
  const original = globalThis.fetch;
  const game = {
    id: 'mlb-1',
    startDate: '2026-11-21T18:00:00Z',
    fixtureType: 'PairGame',
    stage: 'PreMatch',
    isOpenForBetting: true,
    competition: { name: { value: 'MLB' } },
    participants: [
      { name: { value: 'New York Yankees' }, properties: { type: 'HomeTeam' } },
      { name: { value: 'Boston Red Sox' }, properties: { type: 'AwayTeam' } },
    ],
    optionMarkets: [{
      name: { value: 'Moneyline' },
      parameters: [
        { key: 'MarketType', value: '2way' },
        { key: 'Period', value: 'FullTime' },
      ],
      options: [
        { name: { value: 'New York Yankees' }, price: { americanOdds: -150 }, status: 'Visible' },
        { name: { value: 'Boston Red Sox' }, price: { americanOdds: 130 }, status: 'Visible' },
      ],
    }],
  };
  const filled = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us&markets=h2h&oddsFormat=american';
  const empty = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?regions=us&markets=h2h,spreads&oddsFormat=american';
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  delete process.env.ODDS_SOURCE;
  process.env.ESPN_CACHE_DIR = dir;
  setOddsReplay(null);
  globalThis.fetch = async () => {
    throw new Error('stubbed book read');
  };
  try {
    holdBetMgmSport('23', [game]);
    const saved = await oddsGet(filled);
    assert.equal(saved.cached, false);
    const { hash } = oddsRequestKey(filled);
    const raw = await readFile(`${dir}/${oddsCacheName(hash, 'books')}`, 'utf8');
    const record = JSON.parse(raw) as { partial?: boolean; body?: { id?: string }[] };
    assert.equal(record.partial, true);
    assert.match(record.body?.[0]?.id ?? '', /mlb-1/);
    holdBetMgmSport('23', []);
    const blank = await oddsGet(empty);
    assert.equal(blank.cached, false);
    const missed = oddsCacheName(oddsRequestKey(empty).hash, 'books');
    const names = await readdir(dir);
    assert.equal(names.includes(missed), false);
  } finally {
    resetBookReads();
    setOddsReplay(null);
    globalThis.fetch = original;
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousEspn == null) delete process.env.ESPN_CACHE_DIR;
    else process.env.ESPN_CACHE_DIR = previousEspn;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a book error note hides a key', async () => {
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'typesafe-secret-value';
  try {
    const result = await booksFetch('https://api.the-odds-api.com/v4/sports/typesafe-secret-value/odds?regions=us&markets=h2h');
    const text = result.omitted.join(' ');
    assert.equal(text.includes('typesafe-secret-value'), false);
    assert.match(text, /TYPESAFE_API_KEY/);
    assert.equal(result.failed.length, 4);
  } finally {
    if (previous == null) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }
});

test('one listing on a different kickoff stays one game', () => {
  const game = (id: string, time: string, book: string) => ({
    id,
    commence_time: time,
    home_team: 'New York Yankees',
    away_team: 'Boston Red Sox',
    bookmakers: [{
      key: book,
      markets: [{ key: 'h2h', outcomes: [{ name: 'Boston Red Sox', price: -150 }, { name: 'New York Yankees', price: 130 }] }],
    }],
  });
  const merged = mergeBookEvents([
    { source: 'fanduel', events: [game('fd', '2026-06-01T17:05:00Z', 'fanduel')] },
    { source: 'draftkings', events: [game('dk', '2026-06-01T20:30:00Z', 'draftkings')] },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]?.bookmakers.map((book) => book.key).sort(), ['draftkings', 'fanduel']);
});

test('mapPool stops starting work after a failure', async () => {
  let started = 0;
  const run = mapPool([0, 1, 2, 3, 4, 5], 2, async (item) => {
    started += 1;
    if (item === 1) throw new Error('fail');
    await new Promise((resolve) => setTimeout(resolve, 40));
    return item;
  });
  await assert.rejects(run, /fail/);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(started <= 3);
});

test('nfl, ncaa, and soccer windows start at the first game still ahead', async () => {
  const original = globalThis.fetch;
  const now = Date.now();
  const old = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const soon = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const later = new Date(now + 26 * 60 * 60 * 1000).toISOString();
  globalThis.fetch = async () => new Response(JSON.stringify({
    events: [{ date: old }, { date: soon }, { date: later }],
  }), { status: 200 });
  try {
    const premier = soccer.kind === 'leagues' ? soccer.leagues[0]?.source : undefined;
    const sources = [nflLeague.source, ncaaLeague.source, premier];
    for (const source of sources) {
      assert.ok(source);
      const window = await source.window(undefined);
      assert.ok(Math.abs(Date.parse(window.from) - (Date.parse(soon) - 60 * 60 * 1000)) < 2000);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('an unreadable ESPN team list stays empty', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-teams-`);
  const previous = process.env.ESPN_CACHE_DIR;
  const original = globalThis.fetch;
  process.env.ESPN_CACHE_DIR = dir;
  globalThis.fetch = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    const resolve = await teamResolver('americanfootball_nfl');
    assert.equal(resolve('Kansas City Chiefs'), 'Kansas City Chiefs');
  } finally {
    globalThis.fetch = original;
    if (previous == null) delete process.env.ESPN_CACHE_DIR;
    else process.env.ESPN_CACHE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('QUOTA_LOG set to a path warns and writes there', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-quota-`);
  const log = `${dir}/x.jsonl`;
  const previousLog = process.env.QUOTA_LOG;
  const previousPath = process.env.QUOTA_LOG_PATH;
  const errors: string[] = [];
  const write = console.error;
  console.error = (message?: unknown) => {
    errors.push(String(message ?? ''));
  };
  process.env.QUOTA_LOG = log;
  delete process.env.QUOTA_LOG_PATH;
  try {
    assert.equal(quotaLogFile(), log);
    assert.equal(quotaLogFile(), log);
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /QUOTA_LOG_PATH/);
    await appendQuota(quotaEntry('/v4/sports/americanfootball_nfl/odds', 'cached', null, new Date('2026-11-20T18:00:00Z')));
    const text = await readFile(log, 'utf8');
    assert.match(text, /americanfootball_nfl/);
    assert.equal(text.includes('apiKey'), false);
  } finally {
    console.error = write;
    if (previousLog == null) delete process.env.QUOTA_LOG;
    else process.env.QUOTA_LOG = previousLog;
    if (previousPath == null) delete process.env.QUOTA_LOG_PATH;
    else process.env.QUOTA_LOG_PATH = previousPath;
    process.env.QUOTA_LOG ??= '0';
    await rm(dir, { recursive: true, force: true });
  }
});

test('a bad slate date prints one line', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/parlays.ts', '11/20'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString('utf8');
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('slate date check hung'));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      resolve(status);
    });
  });
  assert.equal(code, 1);
  assert.match(err, /Date must be YYYY-MM-DD\./);
  assert.equal(err.includes('at readStartArgs'), false);
});

test('a featured hockey extra can be priced under 0.60', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-extra-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const markets = ['player_goal_scorer_anytime', 'player_total_saves', 'player_power_play_points'];
  const yes = {
    slip: (who: string, price: string) => `Take ${who} anytime goal ${price}`,
    thing: 'anytime goal',
    claim: (player: string, opponent: string, when: string) => `${player} scores against ${opponent} on ${when}.`,
  };
  const profile: PropProfile = {
    sport: 'icehockey_nhl',
    markets,
    core: [{ market: 'player_goal_scorer_anytime', label: 'Anytime goal', phrase: 'goals', stat: 'goals', yes }],
    extra: [
      { market: 'player_total_saves', label: 'Saves', phrase: 'saves', stat: 'saves' },
      { market: 'player_power_play_points', label: 'PP points', phrase: 'power-play points', stat: 'powerPlayPoints' },
    ],
    title: 'NHL props',
    note: 'NHL props.',
    loadRosters: async () => ({
      match: (team, player) => ({ id: player, name: player, pos: player.includes('Swayman') ? 'G' : 'C', team }),
      failed: [],
    }),
    injuryFor: async () => null,
    recentStat: async () => () => 'no recent games',
    realExtra: nhlRealExtra,
    featureExtra: (option, featured) => featured.has(nameKey(option.ref.name)) || (option.ref.pos === 'G' && option.market === 'player_total_saves'),
  };
  const event = (id: string, home: string, away: string, bookmakers: unknown[]) => ({
    id,
    commence_time: '2026-11-21T23:00:00Z',
    home_team: home,
    away_team: away,
    bookmakers,
  });
  const save = async (id: string, body: unknown) => {
    const url = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${id}/odds?regions=us&oddsFormat=american&markets=${markets.join(',')}`;
    const { hash, request } = oddsRequestKey(url);
    await writeFile(`${dir}/${hash}.json`, `${JSON.stringify({ savedAt: new Date().toISOString(), remaining: null, body, request })}\n`);
  };
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  try {
    await save('bos', event('bos', 'Bruins', 'Rangers', [{
      key: 'fanduel',
      markets: [
        { key: 'player_goal_scorer_anytime', outcomes: [{ name: 'Yes', description: 'David Pastrnak', price: -120 }] },
        { key: 'player_total_saves', outcomes: [{ name: 'Over', description: 'Jeremy Swayman', price: 105, point: 24.5 }] },
        { key: 'player_power_play_points', outcomes: [{ name: 'Under', description: 'David Pastrnak', price: -300, point: 0.5 }] },
      ],
    }]));
    await save('nyi', event('nyi', 'Islanders', 'Rangers', [{
      key: 'fanduel',
      markets: [
        { key: 'player_power_play_points', outcomes: [{ name: 'Under', description: 'Chris Kreider', price: -300, point: 0.5 }] },
      ],
    }]));
    const loaded = await loadPropBoard([
      { eventId: 'bos', home: 'Bruins', away: 'Rangers', commence: '2026-11-21T23:00:00Z', homeImplied: 0.6, awayImplied: 0.4 },
      { eventId: 'nyi', home: 'Islanders', away: 'Rangers', commence: '2026-11-21T23:00:00Z', homeImplied: 0.55, awayImplied: 0.45 },
    ], profile);
    const board = loaded.finish([]);
    const rows = board.groups.flat();
    const saves = rows.find((row) => row[2]?.includes('Saves'));
    assert.equal(saves?.[1], 'Jeremy Swayman');
    assert.match(saves?.[2] ?? '', /over 24\.5/);
    assert.ok(rows.some((row) => row[5]?.includes('No featured player had a usable extra for the Rangers.')));
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a supported prop under 0.80 says Lean', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-lean-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousSource = process.env.ODDS_SOURCE;
  const previousCache = process.env.ODDS_CACHE;
  const markets = ['player_anytime_td'];
  const profile: PropProfile = {
    sport: 'americanfootball_nfl',
    markets,
    core: [{
      market: 'player_anytime_td',
      label: 'Anytime TD',
      phrase: 'rushing or receiving touchdowns',
      stat: 'touchdowns',
      yes: {
        slip: (who, price) => `Take ${who} anytime TD ${price}`,
        thing: 'anytime touchdown',
        claim: (player, opponent, when) => `${player} scores a touchdown against ${opponent} on ${when}.`,
      },
    }],
    extra: [],
    title: 'Props',
    note: 'Props.',
    loadRosters: async () => ({
      match: (team, player) => ({ id: player, name: player, pos: 'QB', team }),
      failed: [],
    }),
    injuryFor: async () => null,
    recentStat: async () => () => 'no recent games',
    realExtra: () => false,
    featureExtra: () => false,
  };
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  setOddsReplay(null);
  try {
    const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/kc/odds?regions=us&oddsFormat=american&markets=${markets.join(',')}`;
    const { hash, request } = oddsRequestKey(url);
    await writeFile(`${dir}/${hash}.json`, `${JSON.stringify({
      savedAt: new Date().toISOString(),
      remaining: null,
      request,
      body: {
        id: 'kc',
        commence_time: '2026-11-21T23:00:00Z',
        home_team: 'Chiefs',
        away_team: 'Bills',
        bookmakers: [{
          key: 'fanduel',
          markets: [{ key: 'player_anytime_td', outcomes: [{ name: 'Yes', description: 'Patrick Mahomes', price: -150 }] }],
        }],
      },
    })}\n`);
    const loaded = await loadPropBoard([
      { eventId: 'kc', home: 'Chiefs', away: 'Bills', commence: '2026-11-21T23:00:00Z', homeImplied: 0.7, awayImplied: 0.3 },
    ], profile);
    const id = loaded.claims[0]?.id ?? '';
    const board = loaded.finish([{ id, verdict: 'supported', confidence: 0.7, status: 'review' }]);
    const slip = board.groups.flat().find((row) => row[1] === 'Patrick Mahomes')?.[4] ?? '';
    assert.match(slip, /^Lean /);
  } finally {
    setOddsReplay(null);
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    await rm(dir, { recursive: true, force: true });
  }
});
