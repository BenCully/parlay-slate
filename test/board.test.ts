import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { selectDecisionModel } from '../decisions/judge.js';
import type { GameBrief, SideBrief } from '../espn/evidence.js';
import { oddsRequestKey, setOddsFresh, setOddsReplay } from '../odds/cache.js';
import { buildBoard } from '../slate/board.js';
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
  const from = '2027-01-15T05:00:00Z';
  const to = '2027-01-16T05:00:00Z';
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
  const relevance: Record<string, string> = { GateCity: '0.59', CapCity: '0.70' };
  const game = (id: string, home: string, price: number) => ({
    id,
    commence_time: '2027-01-15T18:00:00Z',
    home_team: home,
    away_team: `${home} Opp`,
    bookmakers: [{
      key: 'fanduel',
      markets: [{
        key: 'h2h',
        outcomes: [
          { name: home, price },
          { name: `${home} Opp`, price: 150 },
        ],
      }],
    }],
  });
  const games = [
    game('low', 'UnderDog', -122),
    game('gate', 'GateCity', -200),
    game('a', 'ReadyAlpha', -200),
    game('b', 'ReadyBravo', -200),
    game('review', 'ReviewClub', -200),
    game('p1', 'PassOne', -200),
    game('p2', 'PassTwo', -200),
    game('p3', 'PassThree', -200),
    game('p4', 'PassFour', -200),
    game('p5', 'PassFive', -200),
    game('cap', 'CapCity', -200),
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
    const ready = claim.includes('ReadyAlpha') || claim.includes('ReadyBravo');
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
  const source: BoardSource = {
    oddsKey,
    unit: 'points',
    query: 'Which NFL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: async () => ({ from, to, label: 'NFL test' }),
    getBrief: async (leg) => ({
      text: `rel=${relevance[leg.team] ?? '0.90'}`,
      pick: side(leg.team),
      opponent: side(leg.opponent),
    } satisfies GameBrief),
    profile: null,
    propsNote: 'No props in this test.',
  };
  try {
    const board = await buildBoard(source, undefined);
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
    assert.equal(tickets.length, 1);
    assert.ok(tickets.length <= 10);
    const slip = tickets[0]?.[0]?.[2] ?? '';
    assert.match(slip, /ReadyAlpha/);
    assert.match(slip, /ReadyBravo/);
    assert.equal(slip.includes('ReviewClub'), false);
    const legs = slip.split(' + ');
    assert.equal(new Set(legs).size, legs.length);
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
