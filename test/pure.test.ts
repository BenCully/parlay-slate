import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { readStartArgs, requireRunKeys, selectDecisionModel, verify } from '../decisions/judge.js';
import { aliasTarget, clubKey, createEvidence, nameKey, NFL_EVIDENCE, type GameBrief } from '../espn/evidence.js';
import { absenceText, applyFotmob, matchClub, openAbsences, parseLeague, pickFixture, type FotmobLeague } from '../sports/soccer/fotmob.js';
import { bookLabel, postedMarket } from '../odds/books.js';
import { oddsCreditFloor, oddsGet, oddsRequestKey, oddsSlateFamily, parseOddsBody, preferFreshRecord, setOddsReplay } from '../odds/cache.js';
import { acquireRunLock } from '../scripts/lock.js';
import { scrubError } from '../scripts/scrub.js';
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
