import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { selectDecisionModel } from '../decisions/judge.js';
import type { GameBrief, SideBrief } from '../espn/evidence.js';
import { oddsCacheName, oddsRequestKey, setOddsFresh, setOddsReplay } from '../odds/cache.js';
import { buildBoard } from '../slate/board.js';
import { easternDay, easternRange, oddsStamp } from '../slate/window.js';
import type { BoardSource } from '../sports/types.js';

function side(name: string): SideBrief {
  return {
    name,
    short: name,
    record: '1-0',
    rest: 'off a bye',
    injury: 'no significant injuries listed',
    margin: null,
    scored: null,
    allowed: null,
  };
}

test('the favorite gate, the top 8, and the tickets stay at the documented numbers', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-board-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousCache = process.env.ODDS_CACHE;
  const previousSource = process.env.ODDS_SOURCE;
  const previousUrl = process.env.AUTOJEV_URL;
  const previousKey = process.env.AUTOJEV_API_KEY;
  const original = globalThis.fetch;
  const kickoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { from, to } = easternRange(easternDay(kickoff));
  const commence = oddsStamp(kickoff.toISOString());
  const oddsKey = 'americanfootball_nfl';
  const url = `https://api.the-odds-api.com/v4/sports/${oddsKey}/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${from}&commenceTimeTo=${to}`;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  process.env.AUTOJEV_URL = 'http://stub/v1';
  process.env.AUTOJEV_API_KEY = 'test-key';
  setOddsReplay(null);
  setOddsFresh(false);
  selectDecisionModel('tail-jev');
  const relevance: Record<string, string> = {
    GateCity: '0.59',
    CapCity: '0.70',
    ReviewClub: '0.97',
    ReadyF: '0.65',
    ReadyG: '0.65',
  };
  const game = (id: string, home: string, price: number, away = `${home} Opp`, awayPrice = 150) => ({
    id,
    commence_time: commence,
    home_team: home,
    away_team: away,
    bookmakers: [{
      key: 'fanduel',
      markets: [{
        key: 'h2h',
        outcomes: [
          { name: home, price },
          { name: away, price: awayPrice },
        ],
      }],
    }],
  });
  const games = [
    game('low', 'UnderDog', -122),
    game('gate', 'GateCity', -200),
    game('a', 'ReadyAlpha', -500),
    game('b', 'ReadyBravo', -400),
    game('c', 'ReadyC', -300),
    game('d', 'ReadyD', -250),
    game('e', 'ReadyE', -200),
    game('f', 'ReadyF', -190),
    game('g', 'ReadyG', -180),
    game('review', 'ReviewClub', -200),
    game('p1', 'PassOne', -200),
    game('p2', 'PassTwo', -200),
    game('p3', 'PassThree', -200),
    game('p4', 'PassFour', -200),
    game('p5', 'PassFive', -200),
    game('cap', 'CapCity', -200),
    game('vig', 'VigHome', -160, 'VigAway', -155),
  ];
  const key = oddsRequestKey(url);
  await writeFile(`${dir}/${key.hash}.json`, `${JSON.stringify({
    savedAt: new Date().toISOString(),
    remaining: null,
    request: key.request,
    body: games,
  })}\n`);
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      state?: { item?: string; claim?: string };
      questions?: { answer?: { type?: string } };
    };
    if (body.questions?.answer?.type === 'noul') {
      const yes = Number(/rel=([0-9.]+)/.exec(body.state?.item ?? '')?.[1] ?? '0');
      return Response.json({ answers: { answer: { noul: yes } } });
    }
    const claim = body.state?.claim ?? '';
    const ready = claim.includes('Ready') || claim.includes('VigHome') || claim.includes('VigAway');
    const review = claim.includes('ReviewClub');
    const verdict = ready || review ? 'supported' : 'unsupported';
    const supported = ready ? 0.85 : review ? 0.79 : 0.05;
    return Response.json({
      answers: {
        answer: {
          choice: verdict,
          probabilities: { supported, contradicted: 0.05, unsupported: ready || review ? 0.1 : 0.9 },
        },
      },
    });
  };
  let active = 0;
  let peak = 0;
  const source: BoardSource = {
    oddsKey,
    unit: 'points',
    query: 'Which NFL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: async () => ({ from, to, label: 'NFL test' }),
    getBrief: async (leg) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      const pass = leg.team.startsWith('Pass');
      return {
        text: `rel=${relevance[leg.team] ?? (pass ? '0.61' : '0.99')}`,
        pick: side(leg.team),
        opponent: side(leg.opponent),
      } satisfies GameBrief;
    },
    profile: null,
    propsNote: 'No props in this test.',
  };
  try {
    const board = await buildBoard(source, undefined);
    assert.equal(peak, 6);
    const text = board.groups.flat().map((row) => row.join(' | ')).join('\n');
    assert.equal(text.includes('UnderDog'), false);
    assert.match(text, /GateCity/);
    assert.match(text, /Dropped 0\.59/);
    assert.match(text, /CapCity/);
    assert.match(text, /Dropped 0\.70/);
    assert.match(text, /top 8/);
    assert.match(text, /ReviewClub/);
    assert.match(text, /Review 0\.79/);
    const tickets = board.ticketGroups ?? [];
    assert.equal(tickets.length, 10);
    const slips = tickets.map((group) => group[0]?.[2] ?? '');
    const hits = tickets.map((group) => Number.parseFloat(group[0]?.[0] ?? ''));
    for (let index = 1; index < hits.length; index += 1) assert.ok(hits[index - 1]! >= hits[index]!);
    const slip = slips[0] ?? '';
    assert.match(slip, /ReadyAlpha/);
    assert.match(slip, /ReadyBravo/);
    assert.equal(slips.some((row) => row.includes('ReviewClub')), false);
    assert.equal(slips.some((row) => row.includes('VigHome') && row.includes('VigAway')), false);
    for (const row of slips) {
      const legs = row.split(' + ');
      assert.equal(new Set(legs).size, legs.length);
    }
  } finally {
    selectDecisionModel('jev');
    setOddsReplay(null);
    setOddsFresh(false);
    globalThis.fetch = original;
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousUrl == null) delete process.env.AUTOJEV_URL;
    else process.env.AUTOJEV_URL = previousUrl;
    if (previousKey == null) delete process.env.AUTOJEV_API_KEY;
    else process.env.AUTOJEV_API_KEY = previousKey;
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Formula 1 driver with one moneyline is a leg', async () => {
  const dir = await mkdtemp(`${tmpdir()}/parlay-f1-`);
  const previousDir = process.env.ODDS_CACHE_DIR;
  const previousCache = process.env.ODDS_CACHE;
  const previousSource = process.env.ODDS_SOURCE;
  const previousUrl = process.env.AUTOJEV_URL;
  const previousKey = process.env.AUTOJEV_API_KEY;
  const original = globalThis.fetch;
  const kickoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { from, to } = easternRange(easternDay(kickoff));
  const oddsKey = 'motorsport_f1';
  const url = `https://api.the-odds-api.com/v4/sports/${oddsKey}/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${from}&commenceTimeTo=${to}`;
  process.env.ODDS_CACHE_DIR = dir;
  process.env.ODDS_CACHE = '1';
  process.env.ODDS_SOURCE = 'the-odds-api';
  process.env.AUTOJEV_URL = 'http://stub/v1';
  process.env.AUTOJEV_API_KEY = 'test-key';
  setOddsReplay(null);
  setOddsFresh(false);
  selectDecisionModel('tail-jev');
  const key = oddsRequestKey(url);
  await writeFile(`${dir}/${oddsCacheName(key.hash, 'fanduel')}`, `${JSON.stringify({
    savedAt: new Date().toISOString(),
    remaining: null,
    request: key.request,
    source: 'fanduel',
    body: [{
      id: 'race:max',
      commence_time: oddsStamp(kickoff.toISOString()),
      home_team: 'Max Verstappen',
      away_team: 'Las Vegas',
      bookmakers: [{
        key: 'fanduel',
        markets: [{
          key: 'h2h',
          outcomes: [{ name: 'Max Verstappen', price: -150, description: 'to win the race' }],
        }],
      }],
    }],
  })}\n`);
  globalThis.fetch = async () => Response.json({
    answers: { answer: { noul: 0.9, choice: 'supported', probabilities: { supported: 0.9, contradicted: 0.05, unsupported: 0.05 } } },
  });
  const source: BoardSource = {
    oddsKey,
    unit: 'points',
    query: 'Which driver is very likely to win the race, finish top 2, or finish on the podium?',
    threeWay: false,
    outright: true,
    shortNames: false,
    window: async () => ({ from, to, label: 'Formula 1 test' }),
    getBrief: async (leg) => ({
      text: 'rel=0.90',
      pick: side(leg.team),
      opponent: side(leg.opponent),
    }),
    profile: null,
    propsNote: 'Formula 1 has no player props.',
  };
  try {
    const board = await buildBoard(source, undefined);
    const text = board.groups.flat().map((row) => row.join(' | ')).join('\n');
    assert.match(text, /Verstappen/);
    assert.equal(text.includes('No qualifying legs'), false);
    assert.equal(board.groups.length, 1);
  } finally {
    selectDecisionModel('jev');
    setOddsReplay(null);
    setOddsFresh(false);
    globalThis.fetch = original;
    if (previousDir == null) delete process.env.ODDS_CACHE_DIR;
    else process.env.ODDS_CACHE_DIR = previousDir;
    if (previousCache == null) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previousCache;
    if (previousSource == null) delete process.env.ODDS_SOURCE;
    else process.env.ODDS_SOURCE = previousSource;
    if (previousUrl == null) delete process.env.AUTOJEV_URL;
    else process.env.AUTOJEV_URL = previousUrl;
    if (previousKey == null) delete process.env.AUTOJEV_API_KEY;
    else process.env.AUTOJEV_API_KEY = previousKey;
    await rm(dir, { recursive: true, force: true });
  }
});
