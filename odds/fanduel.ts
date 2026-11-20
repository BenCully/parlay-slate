// FanDuel's internal sportsbook API, normalized into the shape the boards read from The Odds API.
// Turn it on with ODDS_SOURCE=fanduel. It needs no Odds API key and spends no credits.
// Games come from the content-managed page. Player props come from the facet search for that event.
// Team names resolve to ESPN display names with no prompt. A miss keeps the FanDuel name.
import { readEspnCache, writeEspnCache } from '../espn/cache.js';
import { aliasTarget, clubKey, matchKey, nameKey } from '../espn/evidence.js';
import { bookEventId, placeholderEvent } from './direct.js';
import { americanPrice, fetchJson } from './http.js';
import { oddsStamp } from '../slate/window.js';

const SPORTSBOOK_APP = 'FhMFpcPWXMeyZxOx';
const REGION = 'IL';
const LAYOUT = 'https://api.sportsbook.fanduel.com/sbapi/content-managed-page';
const PRICES = 'https://smp.il.sportsbook.fanduel.com/api/sports/fixedodds/readonly/v1/getMarketPrices?priceHistory=0';
const FACET = 'https://scan.il.sportsbook.fanduel.com/api/sports/navigation/facet/v1.0/search';
const TEAMS = 'https://site.api.espn.com/apis/site/v2/sports';

export type FanDuelSport = {
  page: string;
  customPageId?: string;
  eventTypeId: number;
  competitionId?: number | string;
  teams: string;
  match: 'football' | 'club';
  /** Driver prices for one race, not a home and away moneyline. Formula 1 uses this. */
  outright?: boolean;
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
  soccer_usa_mls: { page: 'SPORT', eventTypeId: 1, competitionId: 141, teams: 'soccer/usa.1', match: 'club' },
  // Motor Sport event type 8. Competition 12433415 is Formula 1, not NASCAR on the same page.
  motorsport_f1: { page: 'SPORT', eventTypeId: 8, competitionId: 12433415, teams: 'racing/f1', match: 'football', outright: true },
};

/** FanDuel names that ESPN spells differently. Football keys keep spaces. Club keys are clubKey. */
const TEAM_ALIASES: Record<string, string> = {
  'sam houston state': 'sam houston bearkats',
  'appalachian state': 'app state mountaineers',
  'connecticut': 'uconn huskies',
  'hawaii': "hawai'i rainbow warriors",
  'miami florida': 'miami hurricanes',
  'paris st g': 'paris saint-germain',
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'nottm forest': 'nottingham forest',
  'spurs': 'tottenham hotspur',
  'wolves': 'wolverhampton wanderers',
  'psg': 'paris saint-germain',
};

function headers() {
  return { 'x-sportsbook-region': REGION, 'x-app-version': '1.0', 'User-Agent': 'Mozilla/5.0' };
}

async function getJson(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<any> {
  return fetchJson(url, { ...headers(), ...init?.headers }, 'FanDuel', { method: init?.method, body: init?.body });
}

function layoutUrl(sport: FanDuelSport) {
  const params = new URLSearchParams({
    page: sport.customPageId ? 'CUSTOM' : sport.page,
    eventTypeId: String(sport.eventTypeId),
    pbHorizontal: 'false',
    _ak: SPORTSBOOK_APP,
    timezone: 'America/Chicago',
  });
  if (sport.customPageId) params.set('customPageId', sport.customPageId);
  return `${LAYOUT}?${params}`;
}

const ESPN_TIMEOUT_MS = 10_000;

export type EspnTeam = {
  id?: string | number;
  displayName?: string;
  shortDisplayName?: string;
  location?: string;
  abbreviation?: string;
  name?: string;
};

function teamsFrom(data: unknown): EspnTeam[] {
  const root = data as { sports?: { leagues?: { teams?: { team?: EspnTeam }[] }[] }[] };
  return (root?.sports?.[0]?.leagues ?? []).flatMap((league) =>
    (league.teams ?? []).map((row) => row.team ?? (row as EspnTeam)),
  );
}

async function espnTeams(sport: FanDuelSport) {
  const url = `${TEAMS}/${sport.teams}/teams?limit=1000`;
  const cached = await readEspnCache(url, 'day');
  if (cached !== undefined) return teamsFrom(cached);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(ESPN_TIMEOUT_MS) });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    console.error(name === 'TimeoutError' || name === 'AbortError'
      ? `ESPN teams timed out for ${sport.teams}. FanDuel names will be used as posted.`
      : `ESPN teams did not answer for ${sport.teams}. FanDuel names will be used as posted.`);
    return [];
  }
  if (!res.ok) {
    console.error(`ESPN teams returned ${res.status} for ${sport.teams}. FanDuel names will be used as posted.`);
    return [];
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.error(`ESPN teams returned an unreadable body for ${sport.teams}. FanDuel names will be used as posted.`);
    return [];
  }
  await writeEspnCache(url, body);
  return teamsFrom(body);
}

function teamKeys(team: EspnTeam, match: 'football' | 'club') {
  const key = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return match === 'football' ? matchKey(text) : clubKey(text);
  };
  const keys = [key(team.displayName)];
  if (match === 'football') keys.push(key(team.shortDisplayName), key(team.location), key(team.abbreviation));
  if (match === 'club') keys.push(key(team.shortDisplayName), key(team.name));
  return [...new Set(keys.filter(Boolean))];
}

export function buildTeamIndex(teams: EspnTeam[], match: 'football' | 'club') {
  const index = new Map<string, EspnTeam[]>();
  for (const team of teams) {
    for (const key of teamKeys(team, match)) {
      const list = index.get(key) ?? [];
      list.push(team);
      index.set(key, list);
    }
  }
  return index;
}

function teamId(team: EspnTeam) {
  return String(team?.id ?? team?.displayName ?? '');
}

function pickIndexed(list: EspnTeam[], key: string, match: 'football' | 'club') {
  const unique: EspnTeam[] = [];
  for (const team of list) {
    if (unique.some((item) => teamId(item) === teamId(team))) continue;
    unique.push(team);
  }
  if (unique.length === 1) return unique[0];
  if (unique.length > 1 && new Set(unique.map((team) => team.displayName)).size === 1) return unique[0];
  // Two schools can share a city. Prefer the one whose short name is that key,
  // so Charlotte is the 49ers and Troy is the Trojans. A shared abbreviation stays unresolved.
  if (match !== 'football' || unique.length < 2) return null;
  const named = unique.filter((team) => {
    const short = matchKey(String(team.shortDisplayName ?? ''));
    const display = matchKey(String(team.displayName ?? ''));
    return short === key || display === key;
  });
  return named.length === 1 ? named[0] : null;
}

/**
 * ESPN display name for a posted team, or the posted name when nothing matches.
 * A short form such as "IND Colts" tries the nickname and the abbreviation after the full name misses.
 */
export function resolvePostedName(name: string, index: Map<string, EspnTeam[]>, match: 'football' | 'club') {
  const attempt = (value: string) => {
    const hit = resolveTeamName(value, index, match);
    return hit === value ? null : hit;
  };
  const posted = name.trim();
  const direct = attempt(posted);
  if (direct) return direct;
  const key = match === 'football' ? matchKey(posted) : clubKey(posted);
  if ((index.get(key) ?? []).length) return resolveTeamName(posted, index, match);
  const abbr = /^([A-Z]{2,4})\s+(.+)$/.exec(posted);
  if (abbr) {
    const nick = attempt(abbr[2] ?? '');
    if (nick) return nick;
    const code = attempt(abbr[1] ?? '');
    if (code) return code;
  }
  return posted;
}

/** Resolver for one Odds API sport key. A miss keeps the posted name. An unknown sport returns the name unchanged. */
export async function teamResolver(sportKey: string): Promise<(name: string) => string> {
  const sport = SPORTS[sportKey];
  if (!sport) return (name: string) => name;
  const teams = await espnTeams(sport);
  const index = buildTeamIndex(teams, sport.match);
  const cache = new Map<string, string>();
  return (name: string) => {
    const hit = cache.get(name);
    if (hit != null) return hit;
    const value = resolvePostedName(name, index, sport.match);
    cache.set(name, value);
    return value;
  };
}

/** ESPN display name for a FanDuel team, or the FanDuel name when nothing matches. */
export function resolveTeamName(name: string, index: Map<string, EspnTeam[]>, match: 'football' | 'club') {
  const key = match === 'football' ? matchKey(name) : clubKey(name);
  const direct = pickIndexed(index.get(key) ?? [], key, match);
  if (direct) return String(direct.displayName);
  const alias = TEAM_ALIASES[key] ?? aliasTarget(name);
  if (alias) {
    const aliasKey = match === 'football' ? matchKey(alias) : clubKey(alias);
    const via = pickIndexed(index.get(aliasKey) ?? [], aliasKey, match);
    if (via) return String(via.displayName);
  }
  if (match === 'club' && key.length >= 4) {
    const hits = new Map<string, EspnTeam>();
    for (const [candidateKey, list] of index) {
      if (candidateKey.length < 4) continue;
      if (!candidateKey.includes(key) && !key.includes(candidateKey)) continue;
      for (const team of list) hits.set(teamId(team), team);
    }
    if (hits.size === 1) return String([...hits.values()][0].displayName);
  }
  return name;
}

type FdRunner = {
  selectionId?: string | number;
  runnerName?: string;
  runnerStatus?: string;
  result?: { type?: string };
  homeOrAway?: string;
};

type FdDetail = {
  selectionId?: string | number;
  runnerStatus?: string;
  handicap?: number | null;
  winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: unknown } };
};

export function marketOutcomes(
  market: { runners?: FdRunner[] },
  price: { runnerDetails?: FdDetail[] } | undefined,
  resolve?: (name: string) => string,
) {
  const runners = new Map<string, FdRunner>();
  for (const runner of market?.runners ?? []) runners.set(String(runner.selectionId), runner);
  const rows = [];
  for (const detail of price?.runnerDetails ?? []) {
    const runner = runners.get(String(detail.selectionId));
    if (!runner) continue;
    const status = detail.runnerStatus ?? runner.runnerStatus;
    if (status && status !== 'ACTIVE') continue;
    const odds = americanPrice(detail.winRunnerOdds?.americanDisplayOdds?.americanOdds);
    if (odds == null) continue;
    const runnerName = String(runner.runnerName ?? '');
    rows.push({
      name: resolve ? resolve(runnerName) : runnerName,
      price: odds,
      point: detail.handicap ?? null,
      kind: runner.result?.type ?? runner.homeOrAway,
    });
  }
  return rows;
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
  let pending = [...new Set(marketIds)];
  let size = 40;
  while (pending.length) {
    const chunk = pending.slice(0, size);
    pending = pending.slice(size);
    const body = await getJson(PRICES, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketIds: chunk }),
    });
    const got = new Set<string>();
    for (const item of body ?? []) {
      prices.set(item.marketId, item);
      got.add(item.marketId);
    }
    const missed = chunk.filter((id) => !got.has(id));
    if (!missed.length) continue;
    if (size === 1) continue;
    pending = [...missed, ...pending];
    size = Math.max(1, Math.floor(size / 2));
  }
  return prices;
}

async function facetSearch(filter: Record<string, unknown>, facets: unknown[]) {
  return getJson(FACET, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-application': SPORTSBOOK_APP },
    body: JSON.stringify({
      filter: {
        productTypes: ['SPORTSBOOK'],
        contentGroup: { language: 'en', regionCode: 'NAMERICA' },
        ...filter,
      },
      facets,
      currencyCode: 'USD',
    }),
  });
}

function americanImplied(price: number) {
  return price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

export type PropClass =
  | { key: string; kind: 'yes' }
  | { key: string; kind: 'ou' }
  | { key: string; kind: 'milestone'; point: number };

const YES_PROPS: Record<string, string> = {
  ANY_TIME_TOUCHDOWN_SCORER: 'player_anytime_td',
  ANY_TIME_TOUCHDOWN_SCORER_CFB: 'player_anytime_td',
  ANY_TIME_GOAL_SCORER: 'player_goal_scorer_anytime',
  TO_SCORE: 'player_goal_scorer_anytime',
};

const OU_PROPS: Record<string, string> = {
  PLAYER_TOTAL_SHOTS: 'player_shots_on_goal',
  PLAYER_TOTAL_SAVES: 'player_total_saves',
};

const STAT_KEYS: Record<string, string> = {
  PASSING_YARDS: 'player_pass_yds',
  RECEIVING_YARDS: 'player_reception_yds',
  RUSHING_YARDS: 'player_rush_yds',
  RECEPTIONS: 'player_receptions',
  PASSING_TOUCHDOWNS: 'player_pass_tds',
  PASS_COMPLETIONS: 'player_pass_completions',
  RUSH_ATTEMPTS: 'player_rush_attempts',
  POINTS: 'player_points',
  REBOUNDS: 'player_rebounds',
  ASSISTS: 'player_assists',
  MADE_3_POINT_FIELD_GOALS: 'player_threes',
  BLOCKS: 'player_blocks',
  STEALS: 'player_steals',
};

/** Map a full-game FanDuel market type onto an Odds API prop key. Alternates and period markets are skipped. */
export function classifyProp(marketType: string): PropClass | null {
  if (/ALT|QUARTER|HALF|PERIOD|INNING|DRIVE|LONGEST|\+/.test(marketType)) return null;
  const yes = YES_PROPS[marketType];
  if (yes) return { key: yes, kind: 'yes' };
  const ou = OU_PROPS[marketType];
  if (ou) return { key: ou, kind: 'ou' };
  if (marketType === 'ANYTIME_ASSIST') return { key: 'player_assists', kind: 'milestone', point: 0.5 };
  const onTarget = /^PLAYER_TO_HAVE_(\d+)_OR_MORE_SHOTS_ON_TARGET$/.exec(marketType);
  if (onTarget) return { key: 'player_shots_on_target', kind: 'milestone', point: Number(onTarget[1]) - 0.5 };
  const shots = /^PLAYER_TO_HAVE_(\d+)_OR_MORE_SHOTS$/.exec(marketType);
  if (shots) return { key: 'player_shots', kind: 'milestone', point: Number(shots[1]) - 0.5 };
  const nba = /^PLAYER_[A-Z]_TOTAL_(POINTS|REBOUNDS|ASSISTS|MADE_3_POINT_FIELD_GOALS|BLOCKS|STEALS)$/.exec(marketType);
  if (nba?.[1] && STAT_KEYS[nba[1]]) return { key: STAT_KEYS[nba[1]], kind: 'ou' };
  const nfl = /^PLAYER_X_(PASSING_YARDS|RECEIVING_YARDS|RUSHING_YARDS|RECEPTIONS|PASSING_TOUCHDOWNS|PASS_COMPLETIONS|RUSH_ATTEMPTS)_(LOW|MEDIUM|HIGH)$/.exec(marketType);
  if (nfl?.[1] && STAT_KEYS[nfl[1]]) return { key: STAT_KEYS[nfl[1]], kind: 'ou' };
  const college = /^PLAYER_(LOW|MEDIUM|HIGH)_(PASSING_YARDS|RUSHING_YARDS|RECEIVING_YARDS|RECEPTIONS|PASSING_TOUCHDOWNS|PASS_COMPLETIONS|RUSH_ATTEMPTS)_CFB$/.exec(marketType);
  if (college?.[2] && STAT_KEYS[college[2]]) return { key: STAT_KEYS[college[2]], kind: 'ou' };
  return null;
}

export type PropRunner = {
  runnerName: string;
  handicap?: number | null;
  resultType?: string | null;
  odds?: unknown;
  runnerStatus?: string | null;
};

export type PropOutcome = { name: string; description: string; price: number; point: number | null };

function ouSide(runner: PropRunner): 'Over' | 'Under' | null {
  const type = runner.resultType?.toUpperCase();
  if (type === 'OVER' || type === 'UNDER') return type === 'OVER' ? 'Over' : 'Under';
  const match = /(?:\s+-\s+|\s+)(Over|Under)$/i.exec(runner.runnerName.trim());
  if (!match) return null;
  return match[1]!.toLowerCase() === 'over' ? 'Over' : 'Under';
}

function playerFromOu(name: string) {
  return name.trim().replace(/(?:\s+-\s+|\s+)(Over|Under)$/i, '').trim();
}

function linePoint(handicap: number | null | undefined) {
  const point = Number(handicap);
  if (!Number.isFinite(point) || point === 0) return null;
  return point;
}

/** One FanDuel market as Odds API outcomes. The props board picks the line from these. */
export function propOutcomes(classified: PropClass, runners: PropRunner[]): PropOutcome[] {
  const rows: PropOutcome[] = [];
  for (const runner of runners) {
    if (runner.runnerStatus && runner.runnerStatus !== 'ACTIVE') continue;
    const price = americanPrice(runner.odds);
    if (price == null) continue;
    const name = runner.runnerName.trim();
    if (!name || name.toLowerCase() === 'no') continue;
    if (classified.kind === 'yes') {
      rows.push({ name: 'Yes', description: name, price, point: null });
      continue;
    }
    if (classified.kind === 'milestone') {
      rows.push({ name: 'Over', description: name, price, point: classified.point });
      continue;
    }
    const side = ouSide(runner);
    const point = linePoint(runner.handicap);
    const player = playerFromOu(name);
    if (!side || point == null || !player) continue;
    rows.push({ name: side, description: player, price, point });
  }
  return rows;
}

const SOCCER_TOTAL_CODES = ['05', '15', '25', '35', '45', '55', '65', '75', '85', '95'].map((line) => `OVER_UNDER_${line}`);
const SOCCER_SPREAD_CODES = ['HOME', 'AWAY'].flatMap((side) =>
  ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5'].map((line) => `${side}_TEAM_-${line}_GOALS`),
);

function parseSoccerRunner(name: string): { label: string; point: number } | null {
  const total = /^(Over|Under)\s+(\d+(?:\.\d+)?)\b/i.exec(name.trim());
  if (total) {
    return { label: total[1]!.toLowerCase() === 'over' ? 'Over' : 'Under', point: Number(total[2]) };
  }
  const spread = /^(.*?)\s+([+-]\d+(?:\.\d+)?)\s+Goals$/i.exec(name.trim());
  if (!spread) return null;
  return { label: spread[1]!.trim(), point: Number(spread[2]) };
}

function soccerQuotes(market: any, price: any) {
  const byId = new Map<string, any>();
  for (const detail of price?.runnerDetails ?? []) byId.set(String(detail.selectionId), detail);
  const rows: { label: string; price: number; point: number }[] = [];
  for (const runner of market.runners ?? []) {
    const detail = byId.get(String(runner.selectionId));
    const odds = americanPrice(detail?.winRunnerOdds?.americanDisplayOdds?.americanOdds);
    const status = detail?.runnerStatus ?? runner.runnerStatus;
    if (status && status !== 'ACTIVE') continue;
    if (odds == null) continue;
    const parsed = parseSoccerRunner(String(runner.runnerName ?? ''));
    if (!parsed || !Number.isFinite(parsed.point)) continue;
    rows.push({ label: parsed.label, price: odds, point: parsed.point });
  }
  return rows;
}

export type LineQuote = { label: string; price: number; point: number };

/** The pair closest to a fair 50/50. A tie keeps the pair with less vig, then the earlier group. */
export function pickBalanced(groups: LineQuote[][]): LineQuote[] {
  let best: LineQuote[] | null = null;
  let bestFair = Infinity;
  let bestVig = Infinity;
  for (const quotes of groups) {
    const left = quotes[0];
    const right = quotes[1];
    if (!left || !right) continue;
    const first = americanImplied(left.price);
    const second = americanImplied(right.price);
    const vig = first + second;
    const fair = vig > 0 ? Math.abs(first / vig - 0.5) : 1;
    if (fair > bestFair || (fair === bestFair && vig >= bestVig)) continue;
    best = quotes;
    bestFair = fair;
    bestVig = vig;
  }
  return best ?? [];
}

async function loadSoccerLines(eventIds: string[]) {
  const map = new Map<string, { spreads: any[]; totals: any[] }>();
  if (!eventIds.length) return map;
  let body: any;
  try {
    body = await facetSearch({
      eventIds: eventIds.map(Number),
      marketTypeCodes: [...SOCCER_TOTAL_CODES, ...SOCCER_SPREAD_CODES],
      attachments: ['MARKET'],
    }, [{ type: 'MARKET' }]);
  } catch {
    return map;
  }
  for (const market of Object.values(body.attachments?.sportsBookMarkets ?? {}) as any[]) {
    const id = String(market.eventId);
    const bucket = map.get(id) ?? { spreads: [], totals: [] };
    if (/^OVER_UNDER_\d+$/.test(market.marketType)) bucket.totals.push(market);
    else if (/^(HOME|AWAY)_TEAM_-[\d.]+_GOALS$/.test(market.marketType)) bucket.spreads.push(market);
    map.set(id, bucket);
  }
  return map;
}

/** Hardest Formula 1 bet first. A driver keeps the first one whose price clears 0.60. */
export const F1_DRIVER_MARKETS = [
  { type: 'OUTRIGHT_BETTING', phrase: 'to win the race' },
  { type: 'F1_ALT_DRIVER_TO_FINISH_TOP_2', phrase: 'to finish top 2' },
  { type: 'PODIUM_FINISH', phrase: 'to finish on the podium' },
] as const;

const F1_DRIVER_RANK = new Map(F1_DRIVER_MARKETS.map((market, index) => [market.type, index]));
const F1_DRIVER_PHRASE = new Map(F1_DRIVER_MARKETS.map((market) => [market.type, market.phrase]));

export type DriverQuote = {
  marketType: string;
  name: string;
  price: number;
  selectionId: string;
};

export type DriverBet = DriverQuote & { phrase: string };

/** One bet per driver. Race win beats top 2, and top 2 beats a podium, when each price is at least 0.60. */
export function chooseDriverBets(quotes: DriverQuote[]): DriverBet[] {
  const best = new Map<string, DriverBet & { rank: number }>();
  for (const quote of quotes) {
    const rank = F1_DRIVER_RANK.get(quote.marketType as (typeof F1_DRIVER_MARKETS)[number]['type']);
    if (rank == null) continue;
    if (americanImplied(quote.price) < 0.6) continue;
    const key = nameKey(quote.name);
    if (!key) continue;
    const phrase = F1_DRIVER_PHRASE.get(quote.marketType as (typeof F1_DRIVER_MARKETS)[number]['type']);
    if (!phrase) continue;
    const current = best.get(key);
    if (current && current.rank <= rank) continue;
    best.set(key, { ...quote, phrase, rank });
  }
  return [...best.values()].map((bet) => ({
    marketType: bet.marketType,
    name: bet.name,
    price: bet.price,
    selectionId: bet.selectionId,
    phrase: bet.phrase,
  }));
}

function raceLabel(name: string) {
  const text = name.replace(/^F1\s+/i, '').trim();
  return text || 'Formula 1';
}

function runnerQuotes(market: any, price: any): DriverQuote[] {
  const runners = new Map<string, any>();
  for (const runner of market?.runners ?? []) runners.set(String(runner.selectionId), runner);
  const details = price?.runnerDetails?.length ? price.runnerDetails : (market?.runners ?? []);
  const rows: DriverQuote[] = [];
  for (const detail of details) {
    const runner = runners.get(String(detail.selectionId)) ?? detail;
    const status = detail.runnerStatus ?? runner.runnerStatus;
    if (status && status !== 'ACTIVE') continue;
    const odds = americanPrice(detail.winRunnerOdds?.americanDisplayOdds?.americanOdds
      ?? runner.winRunnerOdds?.americanDisplayOdds?.americanOdds);
    if (odds == null) continue;
    const name = String(runner.runnerName ?? '').trim();
    if (!name) continue;
    rows.push({
      marketType: String(market.marketType ?? ''),
      name,
      price: odds,
      selectionId: String(runner.selectionId ?? detail.selectionId ?? name),
    });
  }
  return rows;
}

/** One race becomes one event per driver whose hardest qualifying bet clears 0.60. */
async function outrightSlate(sportKey: string, sport: FanDuelSport, from: string, to: string): Promise<any[]> {
  const layout = await getJson(layoutUrl(sport));
  const events: Record<string, any> = layout.attachments?.events ?? {};
  const markets: Record<string, any> = layout.attachments?.markets ?? {};
  const byEvent = new Map<string, any[]>();
  for (const market of Object.values(markets) as any[]) {
    if (!F1_DRIVER_RANK.has(market.marketType)) continue;
    const list = byEvent.get(String(market.eventId)) ?? [];
    list.push(market);
    byEvent.set(String(market.eventId), list);
  }

  const races: { event: any; markets: any[] }[] = [];
  for (const event of Object.values(events) as any[]) {
    if (sport.competitionId != null && String(event.competitionId) !== String(sport.competitionId)) continue;
    if (!event.openDate) continue;
    const commence = Date.parse(event.openDate);
    if (from && commence < Date.parse(from)) continue;
    if (to && commence > Date.parse(to)) continue;
    const found = byEvent.get(String(event.eventId)) ?? [];
    if (!found.length) continue;
    races.push({ event, markets: found });
  }
  if (!races.length) return [];

  const prices = await fetchPrices(races.flatMap((race) => race.markets.map((market) => String(market.marketId))));
  const now = new Date().toISOString();
  const slate: any[] = [];
  for (const race of races) {
    const quotes = race.markets.flatMap((market) => runnerQuotes(market, prices.get(String(market.marketId))));
    const raceName = raceLabel(String(race.event.name ?? ''));
    for (const bet of chooseDriverBets(quotes)) {
      slate.push({
        id: `${race.event.eventId}:${bet.selectionId}`,
        sport_key: sportKey,
        sport_title: raceName,
        home_team: bet.name,
        away_team: raceName,
        commence_time: oddsStamp(race.event.openDate),
        bookmakers: [{
          key: 'fanduel',
          last_update: now,
          markets: [{
            key: 'h2h',
            last_update: now,
            outcomes: [{ name: bet.name, price: bet.price, description: bet.phrase }],
          }],
        }],
      });
    }
  }
  return slate;
}

/** Slate games in the requested window, normalized like a The Odds API slate response. */
export async function fanduelSlate(sportKey: string, from: string, to: string): Promise<any[]> {
  const sport = SPORTS[sportKey];
  if (!sport) throw new Error(`FanDuel has no odds for ${sportKey}.`);
  if (sport.outright) return outrightSlate(sportKey, sport, from, to);
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

  const soccerLines = sport.match === 'club'
    ? await loadSoccerLines(games.map((game) => String(game.event.eventId)))
    : new Map<string, { spreads: any[]; totals: any[] }>();
  for (const bucket of soccerLines.values()) {
    for (const market of [...bucket.spreads, ...bucket.totals]) wanted.add(market.marketId);
  }

  const prices = await fetchPrices([...wanted]);
  const teams = await espnTeams(sport);
  const index = buildTeamIndex(teams, sport.match);
  const resolved = new Map<string, string>();
  const resolve = (name: string) => {
    const hit = resolved.get(name);
    if (hit != null) return hit;
    const value = resolveTeamName(name, index, sport.match);
    resolved.set(name, value);
    return value;
  };

  return games.map((game) => {
    const event = game.event;
    const raw = marketOutcomes(game.h2h, prices.get(game.h2h.marketId), resolve);
    const { home, away } = eventSides(String(event.name ?? ''), raw, resolve);
    const h2h = raw
      .filter((outcome) => outcome.kind !== 'DRAW' && outcome.kind !== 'TIE')
      .map((outcome) => ({ name: outcome.name, price: outcome.price }));
    const extra = soccerLines.get(String(event.eventId));
    const spreadQuotes = game.spreads
      ? marketOutcomes(game.spreads, prices.get(game.spreads.marketId), resolve)
          .map((outcome) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : pickBalanced((extra?.spreads ?? []).map((market) => soccerQuotes(market, prices.get(market.marketId)))).map((quote) => ({
          name: resolve(quote.label),
          price: quote.price,
          point: quote.point,
        }));
    const totals = game.totals
      ? marketOutcomes(game.totals, prices.get(game.totals.marketId))
          .map((outcome) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : pickBalanced((extra?.totals ?? []).map((market) => soccerQuotes(market, prices.get(market.marketId)))).map((quote) => ({
          name: quote.label,
          price: quote.price,
          point: quote.point,
        }));
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
          { key: 'spreads', last_update: new Date().toISOString(), outcomes: spreadQuotes },
          { key: 'totals', last_update: new Date().toISOString(), outcomes: totals },
        ],
      }],
    };
  });
}

export function sidesFromName(name: string) {
  const at = name.split(' @ ');
  if (at.length === 2) return { away: at[0]!.trim(), home: at[1]!.trim() };
  const vs = name.split(' v ');
  if (vs.length === 2) return { home: vs[0]!.trim(), away: vs[1]!.trim() };
  return { away: 'Away', home: 'Home' };
}

/** Home and away from the moneyline. A missing side is taken from the event name and resolved. */
export function eventSides(eventName: string, outcomes: { name: string; kind?: string }[], resolve: (name: string) => string) {
  const fallback = sidesFromName(eventName);
  const named = (side: string, kind: string) => {
    const posted = outcomes.find((outcome) => outcome.kind === kind)?.name;
    if (posted) return posted;
    if (side === 'Home' || side === 'Away') return side;
    return resolve(side);
  };
  return { home: named(fallback.home, 'HOME'), away: named(fallback.away, 'AWAY') };
}

function emptyEvent(eventId: string, event: any) {
  const name = String(event?.name ?? '');
  if (!name.includes(' @ ') && !name.includes(' v ')) return placeholderEvent(String(eventId), 'fanduel', event?.openDate);
  return eventShell(eventId, event, []);
}

function eventShell(eventId: string, event: any, markets: any[]) {
  const sides = sidesFromName(String(event?.name ?? ''));
  const open = event?.openDate ? oddsStamp(event.openDate) : oddsStamp(new Date().toISOString());
  return {
    id: String(eventId),
    commence_time: open,
    home_team: sides.home || 'Home',
    away_team: sides.away || 'Away',
    bookmakers: [{ key: 'fanduel', last_update: new Date().toISOString(), markets }],
  };
}

async function loadEvent(eventId: string) {
  const found = await facetSearch(
    { eventIds: [Number(eventId)], maxResults: 0, attachments: ['EVENT'] },
    [{ type: 'EVENT' }],
  );
  const events = found.attachments?.events ?? {};
  return events[eventId] ?? events[Number(eventId)] ?? Object.values(events)[0] ?? null;
}

/** One event's player props, in the shape `/events/{id}/odds` returns. */
export async function fanduelProps(eventId: string, wanted: Set<string>) {
  const event = await loadEvent(eventId);
  if (!wanted.size) return emptyEvent(eventId, event);
  const listed = await facetSearch(
    { eventIds: [Number(eventId)], maxResults: 0 },
    [{ type: 'MARKET_TYPE' }],
  );
  const types: string[] = [];
  for (const facet of listed.facets ?? []) {
    if (facet.type !== 'MARKET_TYPE') continue;
    for (const value of facet.values ?? []) if (value?.value) types.push(String(value.value));
  }
  const selected = types.filter((type) => {
    const classified = classifyProp(type);
    return classified != null && wanted.has(classified.key);
  });
  if (!selected.length) return emptyEvent(eventId, event);

  const found = await facetSearch(
    { eventIds: [Number(eventId)], marketTypeCodes: selected, attachments: ['MARKET'] },
    [{ type: 'MARKET' }],
  );
  const markets = (Object.values(found.attachments?.sportsBookMarkets ?? {}) as any[])
    .filter((market) => String(market.eventId) === String(eventId));
  const open = markets.filter((market) => market.marketStatus == null || market.marketStatus === 'OPEN');
  const prices = await fetchPrices(open.map((market) => market.marketId));
  const grouped = new Map<string, PropOutcome[]>();
  for (const market of open) {
    const classified = classifyProp(market.marketType);
    if (!classified || !wanted.has(classified.key)) continue;
    const price = prices.get(market.marketId);
    const bySelection = new Map<string, any>();
    for (const detail of price?.runnerDetails ?? []) bySelection.set(String(detail.selectionId), detail);
    const runners: PropRunner[] = (market.runners ?? []).map((runner: any) => {
      const detail = bySelection.get(String(runner.selectionId));
      return {
        runnerName: String(runner.runnerName ?? ''),
        handicap: linePoint(detail?.handicap) ?? linePoint(runner.handicap),
        resultType: runner.result?.type ?? null,
        odds: detail?.winRunnerOdds?.americanDisplayOdds?.americanOdds ?? null,
        runnerStatus: detail?.runnerStatus ?? runner.runnerStatus ?? null,
      };
    });
    const rows = propOutcomes(classified, runners);
    if (!rows.length) continue;
    const list = grouped.get(classified.key) ?? [];
    list.push(...rows);
    grouped.set(classified.key, list);
  }
  const now = new Date().toISOString();
  return eventShell(eventId, event, [...grouped.entries()].map(([key, outcomes]) => ({ key, last_update: now, outcomes })));
}

/** Read either a slate URL or an events URL from The Odds API shape and answer from FanDuel. */
export async function fanduelFetch(url: string): Promise<unknown> {
  const parsed = new URL(url);
  const sportKey = /\/sports\/([^/]+)/.exec(parsed.pathname)?.[1];
  if (!sportKey) throw new Error(`FanDuel could not read the sport from ${parsed.pathname}.`);
  if (parsed.pathname.includes('/events/')) {
    const raw = /\/events\/([^/]+)/.exec(parsed.pathname)?.[1];
    if (!raw) throw new Error('FanDuel could not read the event.');
    const eventId = bookEventId(raw, 'fd');
    if (!eventId) return [];
    const wanted = new Set((parsed.searchParams.get('markets') ?? '').split(',').filter(Boolean));
    return fanduelProps(eventId, wanted);
  }
  const from = parsed.searchParams.get('commenceTimeFrom') ?? '';
  const to = parsed.searchParams.get('commenceTimeTo') ?? '';
  return fanduelSlate(sportKey, from, to);
}