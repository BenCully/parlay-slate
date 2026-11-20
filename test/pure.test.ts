import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { readStartArgs, requireRunKeys, selectDecisionModel, verify } from '../decisions/judge.js';
import { espnCacheFresh, ESPN_DAY_HOURS, ESPN_INJURY_HOURS, readEspnCache, writeEspnCache } from '../espn/cache.js';
import { aliasTarget, clubKey, createEvidence, nameKey, NFL_EVIDENCE, type GameBrief } from '../espn/evidence.js';
import { bookLabel, postedMarket } from '../odds/books.js';
import { listSavedOdds, oddsCacheName, oddsCreditFloor, oddsGet, oddsReplayCommand, oddsRequestKey, oddsRequestSource, oddsSlateFamily, oddsSourceLabel, parseOddsBody, preferFreshRecord, recordMergedBook, resetMergedBooks, setOddsReplay } from '../odds/cache.js';
import { normalizeBetMgm } from '../odds/betmgm.js';
import { normalizeCaesars } from '../odds/caesars.js';
import { compositeId, mergeBookEvents, splitBookId } from '../odds/direct.js';
import { normalizeDraftKings } from '../odds/draftkings.js';
import { buildTeamIndex, chooseDriverBets, classifyProp, eventSides, marketOutcomes, propOutcomes, resolveTeamName, sidesFromName } from '../odds/fanduel.js';
import { easternClock, quotaEntry } from '../odds/quota.js';
import { acquireRunLock } from '../scripts/lock.js';
import { scrubError } from '../scripts/scrub.js';
import { archiveStamp, saveDecisionSnapshot } from '../scripts/snapshot.js';
import { describeDriver, driverLine, driverLines, matchDriver } from '../sports/formula1/brief.js';
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
import { easternDay, easternRange, oddsStamp, scoreboardEvents } from '../slate/window.js';
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
  assert.equal(
    moneylineSlip({ team: 'Max Verstappen', price: -195, phrase: 'to finish top 2' }, supported),
    'Take Verstappen to finish top 2 -195',
  );
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

test('a printed error hides the odds api key', () => {
  const error = new Error('Odds API 401 from https://api.the-odds-api.com/v4/sports/x/odds?apiKey=super-secret&regions=us');
  const safe = scrubError(error, 'The slate failed.');
  assert.equal(safe.includes('super-secret'), false);
  assert.match(safe, /apiKey=\*\*\*/);
  assert.equal(scrubError('not an error', 'The slate failed.'), 'The slate failed.');
});

test('the first book that posted the market is named on the row', () => {
  const books = [
    { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Chiefs', price: -180 }] }] },
    { key: 'fanduel', markets: [{ key: 'spreads', outcomes: [{ name: 'Chiefs', price: -110, point: -3.5 }] }] },
    { key: 'somebook', title: 'Some Book', markets: [{ key: 'totals', outcomes: [{ name: 'Over', price: -105, point: 45 }] }] },
  ];
  assert.equal(postedMarket(books, 'h2h')?.book, 'DraftKings');
  assert.equal(postedMarket(books, 'spreads')?.book, 'FanDuel');
  assert.equal(postedMarket(books, 'totals')?.book, 'Some Book');
  assert.equal(postedMarket(books, 'player_points'), null);
  assert.equal(bookLabel({ key: 'williamhill_us' }), 'Caesars');
  assert.equal(bookLabel({ key: 'betonlineag' }), 'betonlineag');
  assert.equal(postedMarket([{ key: 'williamhill_us', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: -150 }] }] }], 'h2h')?.book, 'Caesars');
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
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE_HOURS = '24';
  process.env.ODDS_CACHE = '1';
  setOddsReplay(null);
  globalThis.fetch = async () => {
    throw new Error('odds fetch should not run');
  };
  const gamesUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-15T05:00:00Z&commenceTimeTo=2026-11-16T05:00:00Z';
  const emptyUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-18T05:00:00Z&commenceTimeTo=2026-11-19T05:00:00Z';
  const askUrl = 'https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-21T05:00:00Z';
  const staleGamesUrl = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-15T05:00:00Z&commenceTimeTo=2026-11-16T05:00:00Z';
  const freshEmptyUrl = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-18T05:00:00Z&commenceTimeTo=2026-11-19T05:00:00Z';
  const askNba = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=secret&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=2026-11-20T05:00:00Z&commenceTimeTo=2026-11-21T05:00:00Z';
  try {
    const now = Date.now();
    const game = {
      id: 'game-1',
      commence_time: '2026-11-15T18:00:00Z',
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
  const original = globalThis.fetch;
  let fetched = 0;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
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
    assert.equal(oddsReplayCommand('2026-11-17', 'the-odds-api', 'jev'), 'npm start -- odds=2026-11-17 model=jev');
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
    delete process.env.ODDS_SOURCE;
    const replay = await oddsGet(savedUrl);
    assert.equal(replay.cached, true);
    assert.ok(Array.isArray(replay.body));
    assert.equal(replay.body[0]?.id, 'odds-api');
    setOddsReplay(null);
    await listSavedOdds();
    const live = await oddsGet(liveUrl);
    assert.equal(live.cached, false);
    const days = await listSavedOdds();
    const nhl = days.flatMap((day) => day.slates).find((slate) => slate.sport === 'icehockey_nhl');
    assert.equal(nhl?.games, 1);
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
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousCache = process.env.ODDS_CACHE;
  const original = globalThis.fetch;
  const log = `${dir}/quota.jsonl`;
  process.env.QUOTA_LOG = log;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
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

    const live = await oddsGet(slate);
    assert.equal(live.cached, false);
    assert.equal(live.remaining, 42);
    await writeOdds(dir, prop, new Date().toISOString(), game);
    const cached = await oddsGet(prop);
    assert.equal(cached.cached, true);
    const lines = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { sport: string; event?: string; source: string; remaining: number | null });
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.sport, 'americanfootball_nfl');
    assert.equal(lines[0]?.event, undefined);
    assert.equal(lines[0]?.source, 'live');
    assert.equal(lines[0]?.remaining, 42);
    assert.equal(lines[1]?.sport, 'icehockey_nhl');
    assert.equal(lines[1]?.event, 'evt-9');
    assert.equal(lines[1]?.source, 'cached');
    assert.equal(lines[1]?.remaining, null);
    const text = await readFile(log, 'utf8');
    assert.equal(text.includes('secret-key'), false);
    assert.equal(text.includes('apiKey'), false);
    assert.equal(text.includes('http'), false);
  } finally {
    globalThis.fetch = original;
    setOddsReplay(null);
    if (previousLog == null) delete process.env.QUOTA_LOG;
    else process.env.QUOTA_LOG = previousLog;
    process.env.QUOTA_LOG ??= '0';
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
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
    requireRunKeys('jev', false);
  });
  withEnv({
    ODDS_SOURCE: 'draftkings',
    ODDS_API_KEY: undefined,
    TYPESAFE_API_KEY: 'present',
  }, () => {
    requireRunKeys('jev', false);
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
