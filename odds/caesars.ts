// Caesars Illinois sportsbook JSON, normalized into the event shape the boards already read.
// No login. The device id is generated for this process and is not a secret.
// A 403 stops. Do not scrape a WAF token.
import { randomUUID } from 'node:crypto';
import { bookEventId, decodedEventId, placeholderEvent } from './direct.js';
import { pickBalanced, teamResolver, type LineQuote } from './fanduel.js';
import { americanPrice, BookError, fetchJson, inWindow, BROWSER } from './http.js';
import { bookEvent, outcome, type Market, type Outcome } from './shape.js';

const BASE = 'https://api.americanwagering.com/regions/us/locations/il/brands/czr/sb';
const DATA_PATH = /^\/[\w\-/.]+$/;

/** A Caesars tab path stays on this host and under the Illinois prefix. */
export function caesarsDataUrl(dataPath: string): string {
  if (!DATA_PATH.test(dataPath) || dataPath.includes('..')) throw new BookError('Caesars', null, false);
  const base = new URL(BASE.endsWith('/') ? BASE : `${BASE}/`);
  const url = new URL(dataPath.replace(/^\//, ''), base);
  if (url.host !== base.host || !url.pathname.startsWith(base.pathname)) throw new BookError('Caesars', null, false);
  return url.toString();
}

const competitionReads = new Map<Competition, Promise<unknown>>();

/** Drop the per-run competition pages. `resetBookReads` calls this. */
export function resetCaesars() {
  competitionReads.clear();
}

type Competition = {
  sportId: string;
  id: string;
  names: string[];
  soccer?: boolean;
  empty?: boolean;
};

const COMPETITIONS: Record<string, Competition> = {
  americanfootball_nfl: { sportId: 'americanfootball', id: '007d7c61-07a7-4e18-bb40-15104b6eac92', names: ['NFL'] },
  americanfootball_ncaaf: { sportId: 'americanfootball', id: 'b7eda1b3-0170-4510-9616-1bce561d7aa7', names: ['NCAAF', 'College Football'] },
  basketball_nba: { sportId: 'basketball', id: '5806c896-4eec-4de1-874f-afed93114b8c', names: ['NBA'] },
  icehockey_nhl: { sportId: 'icehockey', id: 'b7b715a9-c7e8-4c47-af0a-77385b525e09', names: ['NHL'] },
  baseball_mlb: { sportId: 'baseball', id: '04f90892-3afa-4e84-acce-5b89f151063d', names: ['MLB'], empty: true },
  soccer_epl: { sportId: 'football', id: '00200de2-37f3-4339-9e3d-9bf8cb5eb34b', names: ['England Premier League'], soccer: true },
  soccer_uefa_champs_league: { sportId: 'football', id: '9749ba20-1aa4-4f10-8014-af726d2c6fc5', names: ['UEFA Champions League'], soccer: true },
  soccer_spain_la_liga: { sportId: 'football', id: '3b0cbb27-7923-47a9-8117-bcec252162d2', names: ['Spanish La Liga Primera'], soccer: true },
  soccer_italy_serie_a: { sportId: 'football', id: 'e36a8c54-4451-418e-9842-118d8523a421', names: ['Italian Serie A'], soccer: true },
  soccer_germany_bundesliga: { sportId: 'football', id: '5cda9342-5f65-4483-af53-4a7b786832e2', names: ['German Bundesliga'], soccer: true },
  soccer_france_ligue_one: { sportId: 'football', id: 'c06e1f2d-c704-47f7-9949-63c536db2b7d', names: ['French Ligue 1'], soccer: true },
  motorsport_f1: { sportId: 'motorsport', id: '79b3567a-c9b7-4ba8-ac72-4b4580357bda', names: ['Formula 1'], empty: true },
};

const STATS: { pattern: RegExp; key: string }[] = [
  { pattern: /total passing yards/i, key: 'player_pass_yds' },
  { pattern: /total passing touchdowns/i, key: 'player_pass_tds' },
  { pattern: /total passing completions/i, key: 'player_pass_completions' },
  { pattern: /total receiving yards/i, key: 'player_reception_yds' },
  { pattern: /total rushing yards/i, key: 'player_rush_yds' },
  { pattern: /total receptions/i, key: 'player_receptions' },
  { pattern: /total rushing attempts/i, key: 'player_rush_attempts' },
  { pattern: /total field goals/i, key: 'player_field_goals' },
  { pattern: /total kicking points/i, key: 'player_kicking_points' },
  { pattern: /total points/i, key: 'player_points' },
  { pattern: /total rebounds/i, key: 'player_rebounds' },
  { pattern: /total assists/i, key: 'player_assists' },
  { pattern: /total threes|total 3-point/i, key: 'player_threes' },
  { pattern: /total blocks/i, key: 'player_blocks' },
  { pattern: /total steals/i, key: 'player_steals' },
  { pattern: /total shots on goal/i, key: 'player_shots_on_goal' },
  { pattern: /total saves/i, key: 'player_total_saves' },
  { pattern: /total power play points/i, key: 'player_power_play_points' },
  { pattern: /total shots on target/i, key: 'player_shots_on_target' },
  { pattern: /total shots/i, key: 'player_shots' },
  { pattern: /to receive a card|total cards/i, key: 'player_to_receive_card' },
];

export type CaesarsSelection = {
  name?: string;
  type?: string;
  active?: boolean;
  price?: { a?: number };
};

export type CaesarsMarket = {
  name?: string;
  gtpMarketClass?: string;
  line?: number | null;
  metadata?: { period?: string | null };
  selections?: CaesarsSelection[];
};

export type CaesarsEvent = {
  id?: string;
  name?: string;
  startTime?: string;
  active?: boolean;
  started?: boolean;
  keyMarketGroups?: { markets?: CaesarsMarket[] }[];
  tabs?: { displayName?: string; dataPath?: string }[];
};

let deviceId = '';

function headers() {
  if (!deviceId) deviceId = randomUUID();
  return {
    'User-Agent': BROWSER,
    Accept: 'application/json',
    Origin: 'https://sportsbook.caesars.com',
    Referer: 'https://sportsbook.caesars.com/',
    'x-platform': 'rn-web',
    'x-platform-type': 'W',
    'x-app-version': '10.7.7',
    'x-unique-device-id': deviceId,
  };
}

export function stripPipes(name: string) {
  return name.replace(/\|/g, '').replace(/\s+/g, ' ').trim();
}

function skipPeriod(period: string | null | undefined, name: string) {
  const periodText = String(period ?? '').toLowerCase();
  if (periodText && !/^(match_inc_ot|full_time)$/.test(periodText) && /quarter|half|period/.test(periodText)) return true;
  return /quarter|1st half|2nd half|\bhalf\b|\bperiod\b/i.test(name);
}

function marketsOf(event: CaesarsEvent) {
  return (event.keyMarketGroups ?? []).flatMap((group) => group.markets ?? []);
}

function teamNames(event: CaesarsEvent, resolve: (name: string) => string) {
  let home = '';
  let away = '';
  for (const market of marketsOf(event)) {
    for (const selection of market.selections ?? []) {
      if (selection.active === false || selection.type === 'generic') continue;
      const name = resolve(stripPipes(String(selection.name ?? '')));
      if (!name || /^(over|under|draw)$/i.test(name)) continue;
      if (selection.type === 'home' && !home) home = name;
      if (selection.type === 'away' && !away) away = name;
    }
  }
  return { home, away };
}

function priceOf(selection: CaesarsSelection) {
  if (selection.active === false) return null;
  return americanPrice(selection.price?.a);
}

/** Slate or prop markets from Caesars events. A futures card with no home and away is dropped. */
export function normalizeCaesars(events: CaesarsEvent[], options: {
  from: string;
  to: string;
  resolve: (name: string) => string;
  mode: 'slate' | 'props';
  wanted?: Set<string>;
}) {
  const slate = [];
  for (const event of events) {
    if (!event.id || !event.startTime) continue;
    if (event.active === false || event.started === true) continue;
    if (options.mode === 'slate' && !inWindow(event.startTime, options.from, options.to)) continue;
    const { home, away } = teamNames(event, options.resolve);
    if (!home || !away) continue;
    const markets = options.mode === 'props'
      ? propMarkets(event, options.wanted)
      : gameMarkets(event, home, away, options.resolve);
    if (!markets.some((market) => market.outcomes.length)) continue;
    slate.push(bookEvent(String(event.id), event.startTime, home, away, 'williamhill_us', markets));
  }
  return slate;
}

function gameMarkets(event: CaesarsEvent, home: string, away: string, resolve: (name: string) => string): Market[] {
  const h2h: Outcome[] = [];
  const spreads: LineQuote[][] = [];
  const totals: LineQuote[][] = [];
  for (const market of marketsOf(event)) {
    const name = stripPipes(String(market.name ?? ''));
    if (skipPeriod(market.metadata?.period, name)) continue;
    const selections = (market.selections ?? []).filter((selection) => selection.type !== 'generic' && selection.active !== false);
    if (!selections.length) continue;
    const klass = String(market.gtpMarketClass ?? '');
    if (klass === 'HEAD_TO_HEAD' || klass === 'WIN_DRAW_WIN') {
      for (const selection of selections) {
        const price = priceOf(selection);
        if (price == null) continue;
        if (selection.type === 'draw') h2h.push(outcome('Draw', price));
        else if (selection.type === 'home') h2h.push(outcome(home, price));
        else if (selection.type === 'away') h2h.push(outcome(away, price));
        else h2h.push(outcome(resolve(stripPipes(String(selection.name ?? ''))), price));
      }
      continue;
    }
    if (klass === 'HANDICAP') {
      const line = Number(market.line);
      if (!Number.isFinite(line)) continue;
      if (selections.some((selection) => selection.type === 'draw')) continue;
      const pair: LineQuote[] = [];
      for (const selection of selections) {
        const price = priceOf(selection);
        if (price == null) continue;
        if (selection.type === 'home') pair.push({ label: home, price, point: line });
        if (selection.type === 'away') pair.push({ label: away, price, point: -line });
      }
      if (pair.length >= 2) spreads.push(pair);
      continue;
    }
    if (klass === 'OVER_UNDER') {
      if (playerFromTotal(name)) continue;
      const line = Number(market.line);
      if (!Number.isFinite(line)) continue;
      const pair: LineQuote[] = [];
      for (const selection of selections) {
        const price = priceOf(selection);
        if (price == null) continue;
        if (selection.type === 'over') pair.push({ label: 'Over', price, point: line });
        if (selection.type === 'under') pair.push({ label: 'Under', price, point: line });
      }
      if (pair.length >= 2) totals.push(pair);
    }
  }
  return [
    { key: 'h2h', outcomes: h2h },
    { key: 'spreads', outcomes: pickBalanced(spreads).map((quote) => outcome(quote.label, quote.price, quote.point)) },
    { key: 'totals', outcomes: pickBalanced(totals).map((quote) => outcome(quote.label, quote.price, quote.point)) },
  ];
}

function bannedProp(name: string) {
  return /1st quarter|\bhalf\b|passing\+rushing|longest|interceptions|passing attempts/i.test(name);
}

function playerFromTotal(name: string) {
  if (!/\btotal\b/i.test(name)) return '';
  const player = name.replace(/\s+total\s+.+$/i, '').replace(/\s+-\s+.*$/, '').trim();
  if (!player || /^total\b/i.test(player)) return '';
  return player;
}

function propMarkets(event: CaesarsEvent, wanted?: Set<string>): Market[] {
  const grouped = new Map<string, Outcome[]>();
  for (const market of marketsOf(event)) {
    const name = stripPipes(String(market.name ?? ''));
    if (!name || bannedProp(name) || skipPeriod(market.metadata?.period, name)) continue;
    const selections = (market.selections ?? []).filter((selection) => selection.active !== false && selection.type !== 'generic');
    if (!selections.length) continue;
    const klass = String(market.gtpMarketClass ?? '');
    if (klass === 'SCORER' && /player to score a touchdown|anytime goalscorer|anytime touchdown/i.test(name)) {
      const key = /goal/i.test(name) ? 'player_goal_scorer_anytime' : 'player_anytime_td';
      if (wanted && !wanted.has(key)) continue;
      const list = grouped.get(key) ?? [];
      for (const selection of selections) {
        const price = priceOf(selection);
        const player = stripPipes(String(selection.name ?? ''));
        if (price == null || !player) continue;
        list.push(outcome('Yes', price, null, player));
      }
      if (list.length) grouped.set(key, list);
      continue;
    }
    if (klass !== 'OVER_UNDER') continue;
    if (!/\btotal\b/i.test(name)) continue;
    const over = selections.filter((selection) => selection.type === 'over');
    const under = selections.filter((selection) => selection.type === 'under');
    if (!over.length || !under.length) continue;
    const stat = STATS.find((row) => row.pattern.test(name));
    if (!stat || (wanted && !wanted.has(stat.key))) continue;
    const player = playerFromTotal(name);
    if (!player) continue;
    const line = Number(market.line);
    const overPrice = priceOf(over[0] ?? {});
    const underPrice = priceOf(under[0] ?? {});
    if (!Number.isFinite(line) || overPrice == null || underPrice == null) continue;
    const list = grouped.get(stat.key) ?? [];
    list.push(outcome('Over', overPrice, line, player), outcome('Under', underPrice, line, player));
    grouped.set(stat.key, list);
  }
  return [...grouped.entries()].map(([key, outcomes]) => ({ key, outcomes }));
}

async function get(path: string) {
  return fetchJson(caesarsDataUrl(path), headers(), 'Caesars');
}

function eventsOf(body: unknown): CaesarsEvent[] {
  if (!body || typeof body !== 'object') return [];
  const row = body as {
    competitions?: { events?: CaesarsEvent[] }[];
    events?: CaesarsEvent[];
    keyMarketGroups?: CaesarsEvent['keyMarketGroups'];
    id?: string;
    event?: CaesarsEvent;
  };
  if (Array.isArray(row.competitions)) return row.competitions.flatMap((competition) => competition.events ?? []);
  if (row.event && (row.event.id || row.event.keyMarketGroups)) return [row.event];
  if (Array.isArray(row.events)) return row.events;
  if (row.keyMarketGroups && row.id) return [row as CaesarsEvent];
  return [];
}

function secondaryTabs(body: unknown) {
  if (!body || typeof body !== 'object') return [];
  const tabs = (body as { secondaryTabs?: { displayName?: string; dataPath?: string }[] }).secondaryTabs ?? [];
  return tabs.filter((tab) => tab.displayName && tab.dataPath);
}

async function menuId(competition: Competition) {
  const menu = await get('/v3/sports-menu');
  if (!Array.isArray(menu)) return '';
  const names = new Set(competition.names.map((name) => name.toLowerCase()));
  for (const sport of menu as { sportId?: string; competitions?: { id?: string; name?: string }[] }[]) {
    if (sport.sportId !== competition.sportId) continue;
    for (const row of sport.competitions ?? []) {
      if (row.id && names.has(String(row.name ?? '').toLowerCase())) return row.id;
    }
  }
  return '';
}

async function readCompetition(competition: Competition) {
  const path = `/v4/sports/${competition.sportId}/competitions/${competition.id}/tabs`;
  try {
    return await get(path);
  } catch (error) {
    if (!(error instanceof BookError) || error.status !== 404) throw error;
    const id = await menuId(competition);
    if (!id || id === competition.id) throw error;
    competition.id = id;
    return get(`/v4/sports/${competition.sportId}/competitions/${id}/tabs`);
  }
}

async function loadCompetition(competition: Competition) {
  const cached = competitionReads.get(competition);
  if (cached) return cached;
  const pending = readCompetition(competition).catch((error: unknown) => {
    competitionReads.delete(competition);
    throw error;
  });
  competitionReads.set(competition, pending);
  return pending;
}

function mergeEvents(groups: CaesarsEvent[][]) {
  const byId = new Map<string, CaesarsEvent>();
  for (const events of groups) {
    for (const event of events) {
      if (!event.id) continue;
      const current = byId.get(event.id);
      if (!current) {
        byId.set(event.id, event);
        continue;
      }
      current.keyMarketGroups = [...(current.keyMarketGroups ?? []), ...(event.keyMarketGroups ?? [])];
    }
  }
  return [...byId.values()];
}

async function slate(sportKey: string, from: string, to: string) {
  const competition = COMPETITIONS[sportKey];
  if (!competition) throw new Error(`Caesars has no odds for ${sportKey}.`);
  if (competition.empty) return [];
  const body = await loadCompetition(competition);
  const groups = [eventsOf(body)];
  const extra = secondaryTabs(body).filter((tab) => competition.soccer && /^(spread|total goals)$/i.test(tab.displayName ?? ''));
  for (const tab of extra) {
    if (!tab.dataPath) continue;
    groups.push(eventsOf(await get(tab.dataPath)));
  }
  const resolve = await teamResolver(sportKey);
  return normalizeCaesars(mergeEvents(groups), { from, to, resolve, mode: 'slate' });
}

function propTab(name: string) {
  if (/half|quarter|period|alternate|future/i.test(name)) return false;
  return /td scorer|passing|receiving|rushing|kicking|goalscorer|shot|assist|card|point|rebound|three|block|steal|save/i.test(name);
}

async function props(sportKey: string, eventId: string, wanted: Set<string>) {
  const competition = COMPETITIONS[sportKey];
  if (!competition || competition.empty || !wanted.size) {
    return placeholderEvent(eventId, 'williamhill_us');
  }
  const eventBody = await get(`/v4/events/${eventId}`);
  const event = eventsOf(eventBody)[0] ?? (eventBody as CaesarsEvent);
  const tabs = ((eventBody as CaesarsEvent).tabs ?? event.tabs ?? []).filter((tab) => propTab(tab.displayName ?? '') && tab.dataPath);
  const groups = [event];
  for (const tab of tabs) {
    try {
      if (!tab.dataPath) continue;
      groups.push(...eventsOf(await get(tab.dataPath)));
    } catch (error) {
      if (error instanceof BookError && error.status === 404) continue;
      throw error;
    }
  }
  if (competition.soccer) {
    const board = await loadCompetition(competition);
    const goalTabs = secondaryTabs(board).filter((tab) => /goalscorer|player shots$|player shots on target|assist|card/i.test(tab.displayName ?? ''));
    for (const tab of goalTabs) {
      if (!tab.dataPath) continue;
      const found = eventsOf(await get(tab.dataPath)).filter((row) => row.id === eventId);
      groups.push(...found);
    }
  }
  const resolve = await teamResolver(sportKey);
  const normalized = normalizeCaesars(mergeEvents([groups]), { from: '', to: '', resolve, mode: 'props', wanted });
  return normalized[0] ?? placeholderEvent(eventId, 'williamhill_us', event.startTime);
}

/** Read a slate URL or an events URL and answer from Caesars. */
export async function caesarsFetch(url: string): Promise<unknown> {
  const parsed = new URL(url);
  const sportKey = /\/sports\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '';
  if (!sportKey) throw new Error('Caesars could not read the sport.');
  if (parsed.pathname.includes('/events/')) {
    const raw = /\/events\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '';
    if (!raw) throw new Error('Caesars could not read the event.');
    const eventId = decodedEventId(raw);
    const segment = bookEventId(raw, 'czr');
    if (!segment) return placeholderEvent(eventId, 'williamhill_us');
    const wanted = new Set((parsed.searchParams.get('markets') ?? '').split(',').filter(Boolean));
    return props(sportKey, segment, wanted);
  }
  return slate(sportKey, parsed.searchParams.get('commenceTimeFrom') ?? '', parsed.searchParams.get('commenceTimeTo') ?? '');
}
