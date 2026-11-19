// FanDuel's internal sportsbook API, normalized into the shape the boards read from The Odds API.
// Turn it on with ODDS_SOURCE=fanduel. It needs no Odds API key and spends no credits.
// Games come from the content-managed page. Player props come from the facet search for that event.
import { clubKey, nameKey, aliasTarget } from '../espn/evidence.js';
import { oddsStamp } from '../slate/window.js';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const API_KEY = 'FhMFpcPWXMeyZxOx';
const REGION = 'IL';
const TIMEOUT = 30_000;
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
    headers: { 'content-type': 'application/json', 'x-application': API_KEY },
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
  odds?: number | null;
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
    const odds = Number(runner.odds);
    if (!Number.isFinite(odds)) continue;
    const price = Math.round(odds);
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
    const odds = Number(detail?.winRunnerOdds?.americanDisplayOdds?.americanOdds);
    const status = detail?.runnerStatus ?? runner.runnerStatus;
    if (status && status !== 'ACTIVE') continue;
    if (!Number.isFinite(odds)) continue;
    const parsed = parseSoccerRunner(String(runner.runnerName ?? ''));
    if (!parsed || !Number.isFinite(parsed.point)) continue;
    rows.push({ label: parsed.label, price: Math.round(odds), point: parsed.point });
  }
  return rows;
}

function pickBalanced(markets: any[], prices: Map<string, any>) {
  let best: { label: string; price: number; point: number }[] | null = null;
  let bestScore = Infinity;
  for (const market of markets) {
    const quotes = soccerQuotes(market, prices.get(market.marketId));
    if (quotes.length < 2) continue;
    const score = Math.min(...quotes.map((quote) => Math.abs(americanImplied(quote.price) - 0.5)));
    if (score >= bestScore) continue;
    best = quotes;
    bestScore = score;
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

  const soccerLines = sport.match === 'club'
    ? await loadSoccerLines(games.map((game) => String(game.event.eventId)))
    : new Map<string, { spreads: any[]; totals: any[] }>();
  for (const bucket of soccerLines.values()) {
    for (const market of [...bucket.spreads, ...bucket.totals]) wanted.add(market.marketId);
  }

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
    const extra = soccerLines.get(String(event.eventId));
    const spreadQuotes = game.spreads
      ? (await marketOutcomes(game.spreads, prices.get(game.spreads.marketId), resolve))
          .map((outcome: any) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : await Promise.all(pickBalanced(extra?.spreads ?? [], prices).map(async (quote) => ({
          name: await resolve(quote.label),
          price: quote.price,
          point: quote.point,
        })));
    const totals = game.totals
      ? (await marketOutcomes(game.totals, prices.get(game.totals.marketId), resolve))
          .map((outcome: any) => ({ name: outcome.name, price: outcome.price, point: outcome.point }))
      : pickBalanced(extra?.totals ?? [], prices).map((quote) => ({
          name: quote.label,
          price: quote.price,
          point: quote.point,
        }));
    return {
      id: String(event.eventId),
      sport_key: sportKey,
      sport_title: event.name,
      home_team: home || sidesFromName(String(event.name ?? '')).home,
      away_team: away || sidesFromName(String(event.name ?? '')).away,
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
  }));
  return built;
}

function sidesFromName(name: string) {
  const at = name.split(' @ ');
  if (at.length === 2) return { away: at[0]!.trim(), home: at[1]!.trim() };
  const vs = name.split(' v ');
  if (vs.length === 2) return { away: vs[0]!.trim(), home: vs[1]!.trim() };
  return { away: 'Away', home: 'Home' };
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
  if (!wanted.size) return eventShell(eventId, event, []);
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
  if (!selected.length) return eventShell(eventId, event, []);

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
export async function fanduelFetch(url: string): Promise<any> {
  const parsed = new URL(url);
  const sportKey = /\/sports\/([^/]+)/.exec(parsed.pathname)?.[1];
  if (!sportKey) throw new Error(`FanDuel could not read the sport from ${parsed.pathname}.`);
  if (parsed.pathname.includes('/events/')) {
    const eventId = /\/events\/([^/]+)/.exec(parsed.pathname)?.[1];
    if (!eventId) throw new Error('FanDuel could not read the event.');
    const wanted = new Set((parsed.searchParams.get('markets') ?? '').split(',').filter(Boolean));
    return fanduelProps(eventId, wanted);
  }
  const from = parsed.searchParams.get('commenceTimeFrom') ?? '';
  const to = parsed.searchParams.get('commenceTimeTo') ?? '';
  return fanduelSlate(sportKey, from, to);
}