// FanDuel's internal sportsbook API, normalized into the shape the boards read from The Odds API.
// Turn it on with ODDS_SOURCE=fanduel. It needs no Odds API key and spends no credits.
// Games only for now: moneyline, spread, and total. Player props are not fetched yet.
import { clubKey, nameKey, aliasTarget } from '../espn/evidence.js';
import { oddsStamp } from '../slate/window.js';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const API_KEY = 'FhMFpcPWXMeyZxOx';
const REGION = 'IL';
const TIMEOUT = 30_000;
const LAYOUT = 'https://api.sportsbook.fanduel.com/sbapi/content-managed-page';
const PRICES = 'https://smp.il.sportsbook.fanduel.com/api/sports/fixedodds/readonly/v1/getMarketPrices?priceHistory=0';
const TEAMS = 'https://site.api.espn.com/apis/site/v2/sports';

export type FanDuelSport = {
  page: string;
  customPageId?: string;
  eventTypeId: number;
  competitionId?: number | string;
  teams: string;
  match: 'football' | 'club';
};

const SPORTS: Record<string, FanDuelSport> = {
  americanfootball_nfl: { page: 'CUSTOM', customPageId: 'nfl', eventTypeId: 6423, competitionId: 12282733, teams: 'football/nfl', match: 'football' },
  americanfootball_ncaaf: { page: 'CUSTOM', customPageId: 'ncaaf', eventTypeId: 6423, competitionId: 12529073, teams: 'football/college-football', match: 'football' },
  basketball_nba: { page: 'CUSTOM', customPageId: 'nba', eventTypeId: 7522, competitionId: 10547864, teams: 'basketball/nba', match: 'football' },
  icehockey_nhl: { page: 'CUSTOM', customPageId: 'nhl', eventTypeId: 7524, competitionId: 12550521, teams: 'hockey/nhl', match: 'football' },
  baseball_mlb: { page: 'CUSTOM', customPageId: 'mlb', eventTypeId: 7511, teams: 'baseball/mlb', match: 'football' },
  soccer_epl: { page: 'SPORT', eventTypeId: 1, competitionId: 10932509, teams: 'soccer/eng.1', match: 'club' },
  soccer_uefa_champs_league: { page: 'SPORT', eventTypeId: 1, competitionId: 228, teams: 'soccer/uefa.champions', match: 'club' },
  soccer_spain_la_liga: { page: 'SPORT', eventTypeId: 1, competitionId: 117, teams: 'soccer/esp.1', match: 'club' },
  soccer_italy_serie_a: { page: 'SPORT', eventTypeId: 1, competitionId: 81, teams: 'soccer/ita.1', match: 'club' },
  soccer_germany_bundesliga: { page: 'SPORT', eventTypeId: 1, competitionId: 59, teams: 'soccer/ger.1', match: 'club' },
  soccer_france_ligue_one: { page: 'SPORT', eventTypeId: 1, competitionId: 55, teams: 'soccer/fra.1', match: 'club' },
};

/** FanDuel names that ESPN spells differently. Keyed by the folded FanDuel name. */
const TEAM_ALIASES: Record<string, string> = {
  samhoustonstate: 'sam houston bearakats',
  appalachianstate: 'app state mountaineers',
  connecticut: 'uconn huskies',
  hawaii: "hawai'i rainbow warriors",
  miamiflorida: 'miami hurricanes',
  'paris st g': 'paris saint-germain',
};

function headers() {
  return { 'x-sportsbook-region': REGION, 'x-app-version': '1.0', 'User-Agent': 'Mozilla/5.0' };
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    throw new Error('FanDuel did not answer.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FanDuel ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function layoutUrl(sport: FanDuelSport) {
  const params = new URLSearchParams({
    page: sport.customPageId ? 'CUSTOM' : sport.page,
    eventTypeId: String(sport.eventTypeId),
    pbHorizontal: 'false',
    _ak: API_KEY,
    timezone: 'America/Chicago',
  });
  if (sport.customPageId) params.set('customPageId', sport.customPageId);
  return `${LAYOUT}?${params}`;
}

async function espnTeams(sport: FanDuelSport) {
  const data = await getJson(`${TEAMS}/${sport.teams}/teams?limit=1000`);
  return (data.sports?.[0]?.leagues ?? []).flatMap((league: any) => (league.teams ?? []).map((row: any) => row.team ?? row));
}

function teamKeys(team: any, match: 'football' | 'club') {
  const key = (value: unknown) => (match === 'football' ? nameKey(String(value ?? '')) : clubKey(String(value ?? '')));
  const keys = [key(team.displayName)];
  if (match === 'club') keys.push(key(team.shortDisplayName), key(team.name));
  return keys.filter(Boolean);
}

function teamIndex(teams: any[], match: 'football' | 'club') {
  const index = new Map<string, any[]>();
  for (const team of teams) {
    for (const key of teamKeys(team, match)) {
      const list = index.get(key) ?? [];
      list.push(team);
      index.set(key, list);
    }
  }
  return index;
}

function words(key: string) {
  return key.split(/[^a-z0-9]+/).filter(Boolean);
}

function startsWithWords(candidate: string, prefix: string) {
  const a = words(candidate);
  const b = words(prefix);
  return b.length > 0 && b.length <= a.length && a.slice(0, b.length).every((word, i) => word === b[i]);
}

async function askPick(candidates: string[], label: string) {
  if (!input.isTTY) return null;
  const lines = candidates.map((name, i) => `  ${i + 1}. ${name}`).join('\n');
  output.write(`FanDuel team is unclear. Pick the ESPN team for ${label}.\n${lines}\n> `);
  const rl = createInterface({ input, output });
  const answer = (await new Promise<string>((resolve) => rl.question('> ', (value) => resolve(value)))) as string;
  rl.close();
  const index = Number(answer) - 1;
  return index >= 0 && index < candidates.length ? candidates[index] : null;
}

async function resolveTeam(name: string, index: Map<string, any[]>, sport: FanDuelSport) {
  const match = sport.match;
  const key = match === 'football' ? nameKey(name) : clubKey(name);
  const direct = index.get(key);
  if (direct?.length === 1) return direct[0].displayName;
  const alias = TEAM_ALIASES[key] ?? aliasTarget(name);
  if (alias) {
    const aliasKey = match === 'football' ? nameKey(alias) : clubKey(alias);
    const via = index.get(aliasKey);
    if (via?.length === 1) return via[0].displayName;
  }
  const candidates = [...index.entries()]
    .filter(([candidateKey]) => candidateKey.length >= 4 && (match === 'football' ? startsWithWords(candidateKey, key) : candidateKey.includes(key) || key.includes(candidateKey)))
    .flatMap(([, list]) => list.map((team) => team.displayName));
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) {
    const picked = await askPick(unique, name);
    if (picked) return picked;
  }
  return name;
}

async function marketOutcomes(market: any, price: any, resolve: (name: string) => Promise<string>) {
  const runners = new Map<string, any>();
  for (const runner of market.runners ?? []) runners.set(String(runner.selectionId), runner);
  const rows = await Promise.all((price?.runnerDetails ?? []).map(async (detail: any) => {
    const runner = runners.get(String(detail.selectionId));
    if (!runner) return null;
    const odds = detail.winRunnerOdds?.americanDisplayOdds?.americanOdds;
    if (odds == null) return null;
    return {
      name: await resolve(runner.runnerName),
      price: odds,
      point: detail.handicap ?? null,
      kind: runner.result?.type ?? runner.homeOrAway,
    };
  }));
  return rows.filter(Boolean);
}

const MARKET_KEY: Record<string, string> = {
  MONEY_LINE: 'h2h',
  'WIN-DRAW-WIN': 'h2h',
  'MATCH_HANDICAP_(2-WAY)': 'spreads',
  'TOTAL_POINTS_(OVER/UNDER)': 'totals',
};

function gameMarkets(list: any[]) {
  const found: Record<string, any> = {};
  for (const market of list) {
    const key = MARKET_KEY[market.marketType];
    if (key && !found[key]) found[key] = market;
  }
  return found;
}

async function fetchPrices(marketIds: string[]) {
  const prices = new Map<string, any>();
  for (let start = 0; start < marketIds.length; start += 100) {
    const chunk = marketIds.slice(start, start + 100);
    const body = await getJson(PRICES, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketIds: chunk }),
    });
    for (const item of body) prices.set(item.marketId, item);
  }
  return prices;
}

/** Slate games in the requested window, normalized like a The Odds API slate response. */
export async function fanduelSlate(sportKey: string, from: string, to: string): Promise<any[]> {
  const sport = SPORTS[sportKey];
  if (!sport) throw new Error(`FanDuel has no odds for ${sportKey}.`);
  const layout = await getJson(layoutUrl(sport));
  const events: Record<string, any> = layout.attachments?.events ?? {};
  const markets: Record<string, any> = layout.attachments?.markets ?? {};
  const byEvent = new Map<string, any[]>();
  for (const market of Object.values(markets)) {
    const list = byEvent.get(market.eventId) ?? [];
    list.push(market);
    byEvent.set(market.eventId, list);
  }

  const games: any[] = [];
  const wanted = new Set<string>();
  for (const event of Object.values(events)) {
    if (sport.competitionId != null && String(event.competitionId) !== String(sport.competitionId)) continue;
    if (!event.openDate) continue;
    const commence = Date.parse(event.openDate);
    if (from && commence < Date.parse(from)) continue;
    if (to && commence > Date.parse(to)) continue;
    const found = gameMarkets(byEvent.get(event.eventId) ?? []);
    if (!found.h2h) continue;
    games.push({ event, ...found });
    wanted.add(found.h2h.marketId);
    if (found.spreads) wanted.add(found.spreads.marketId);
    if (found.totals) wanted.add(found.totals.marketId);
  }
  if (!games.length) return [];

  const prices = await fetchPrices([...wanted]);
  const teams = await espnTeams(sport);
  const index = teamIndex(teams, sport.match);
  const resolve = async (name: string) => resolveTeam(name, index, sport);

  const built = await Promise.all(games.map(async (game) => {
    const event = game.event;
    const raw = await marketOutcomes(game.h2h, prices.get(game.h2h.marketId), resolve);
    const home = raw.find((outcome: any) => outcome.kind === 'HOME')?.name ?? null;
    const away = raw.find((outcome: any) => outcome.kind === 'AWAY')?.name ?? null;
    const h2h = raw
      .filter((outcome: any) => outcome.kind !== 'DRAW' && outcome.kind !== 'TIE')
      .map((outcome: any) => ({ name: outcome.name, price: outcome.price }));
    const spreads = game.spreads
      ? (await marketOutcomes(game.spreads, prices.get(game.spreads.marketId), resolve))
          .map((outcome: any) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : [];
    const totals = game.totals
      ? (await marketOutcomes(game.totals, prices.get(game.totals.marketId), resolve))
          .map((outcome: any) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : [];
    return {
      id: String(event.eventId),
      sport_key: sportKey,
      sport_title: event.name,
      home_team: home,
      away_team: away,
      commence_time: oddsStamp(event.openDate),
      bookmakers: [{
        key: 'fanduel',
        last_update: new Date().toISOString(),
        markets: [
          { key: 'h2h', last_update: new Date().toISOString(), outcomes: h2h },
          { key: 'spreads', last_update: new Date().toISOString(), outcomes: spreads },
          { key: 'totals', last_update: new Date().toISOString(), outcomes: totals },
        ],
      }],
    };
  }));
  return built;
}

/** Player props are not fetched from FanDuel yet. The props board shows no line for every row. */
export async function fanduelProps(): Promise<any[]> {
  return [];
}

/** Read either a slate URL or an events URL from The Odds API shape and answer from FanDuel. */
export async function fanduelFetch(url: string): Promise<any> {
  const parsed = new URL(url);
  const sportKey = /\/sports\/([^/]+)/.exec(parsed.pathname)?.[1];
  if (!sportKey) throw new Error(`FanDuel could not read the sport from ${parsed.pathname}.`);
  if (parsed.pathname.includes('/events/')) return fanduelProps();
  const from = parsed.searchParams.get('commenceTimeFrom') ?? '';
  const to = parsed.searchParams.get('commenceTimeTo') ?? '';
  return fanduelSlate(sportKey, from, to);
}