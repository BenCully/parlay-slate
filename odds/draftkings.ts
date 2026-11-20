// DraftKings Illinois sportsbook JSON, normalized into the event shape the boards already read.
// No login and no client id. Node fetch with a browser User-Agent. A 403 stops. There is no paid fallback.
import { bookEventId, decodedEventId } from './direct.js';
import { teamResolver } from './fanduel.js';
import { americanPrice, fetchJson, inWindow, trimStamp, BROWSER } from './http.js';
import { balancedSpreads, balancedTotals } from './lines.js';
import { bookEvent, outcome, type Market, type Outcome } from './shape.js';

const ORIGIN = 'https://sportsbook.draftkings.com';
const SITE = 'https://sportsbook-nash.draftkings.com/sites/US-IL-SB/api/sportscontent';

type Sub = { id: string; kind: 'game' | 'moneyline' | 'spread' | 'total' };

type League = {
  leagueId: string;
  subs: Sub[];
  empty?: boolean;
};

const LEAGUES: Record<string, League> = {
  americanfootball_nfl: { leagueId: '88808', subs: [{ id: '4518', kind: 'game' }] },
  americanfootball_ncaaf: { leagueId: '87637', subs: [{ id: '4518', kind: 'game' }] },
  basketball_nba: { leagueId: '42648', subs: [{ id: '4511', kind: 'game' }] },
  icehockey_nhl: { leagueId: '42133', subs: [{ id: '4525', kind: 'game' }] },
  baseball_mlb: { leagueId: '84240', subs: [], empty: true },
  soccer_epl: { leagueId: '40253', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
  soccer_uefa_champs_league: { leagueId: '40685', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
  soccer_spain_la_liga: { leagueId: '40031', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
  soccer_italy_serie_a: { leagueId: '40030', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
  soccer_germany_bundesliga: { leagueId: '40481', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
  soccer_france_ligue_one: { leagueId: '40032', subs: [{ id: '4514', kind: 'moneyline' }, { id: '13170', kind: 'spread' }, { id: '13171', kind: 'total' }] },
};

const PROP_NAMES: { pattern: RegExp; key: string; anytime?: boolean }[] = [
  { pattern: /pass yards o\/u/i, key: 'player_pass_yds' },
  { pattern: /rush yards o\/u/i, key: 'player_rush_yds' },
  { pattern: /receiving yards o\/u/i, key: 'player_reception_yds' },
  { pattern: /receptions o\/u/i, key: 'player_receptions' },
  { pattern: /pass tds o\/u/i, key: 'player_pass_tds' },
  { pattern: /pass completions o\/u/i, key: 'player_pass_completions' },
  { pattern: /rush attempts o\/u/i, key: 'player_rush_attempts' },
  { pattern: /kicking pts o\/u/i, key: 'player_kicking_points' },
  { pattern: /field goals? o\/u/i, key: 'player_field_goals' },
  { pattern: /^td scorer$/i, key: 'player_anytime_td', anytime: true },
  { pattern: /^points o\/u$/i, key: 'player_points' },
  { pattern: /^rebounds o\/u$/i, key: 'player_rebounds' },
  { pattern: /^assists o\/u$/i, key: 'player_assists' },
  { pattern: /^threes o\/u$/i, key: 'player_threes' },
  { pattern: /^blocks o\/u$/i, key: 'player_blocks' },
  { pattern: /^steals o\/u$/i, key: 'player_steals' },
  { pattern: /shots on goal o\/u/i, key: 'player_shots_on_goal' },
  { pattern: /^points o\/u$/i, key: 'player_points' },
  { pattern: /^assists o\/u$/i, key: 'player_assists' },
  { pattern: /^saves o\/u$/i, key: 'player_total_saves' },
  { pattern: /^power play points o\/u$/i, key: 'player_power_play_points' },
  { pattern: /anytime goalscorer/i, key: 'player_goal_scorer_anytime', anytime: true },
  { pattern: /^goalscorer$/i, key: 'player_goal_scorer_anytime', anytime: true },
  { pattern: /player shots on target$/i, key: 'player_shots_on_target' },
  { pattern: /player shots$/i, key: 'player_shots' },
  { pattern: /player assists$/i, key: 'player_assists' },
  { pattern: /to receive a card$/i, key: 'player_to_receive_card' },
];

type DkEvent = {
  id?: string;
  name?: string;
  startEventDate?: string;
  participants?: { name?: string; venueRole?: string }[];
};

type DkMarket = {
  id?: string;
  eventId?: string;
  name?: string;
  marketType?: { name?: string };
};

type DkSelection = {
  marketId?: string;
  label?: string;
  displayOdds?: { american?: string };
  outcomeType?: string | null;
  points?: number | null;
  status?: string;
  tags?: string[];
};

export type DraftKingsBody = {
  events?: DkEvent[];
  markets?: DkMarket[];
  selections?: DkSelection[];
  subcategories?: { id?: string | number; name?: string }[];
};

const cache = new Map<string, Promise<DraftKingsBody>>();

export function resetDraftKings() {
  cache.clear();
}

export function draftKingsCacheSize() {
  return cache.size;
}

function headers() {
  return {
    'User-Agent': BROWSER,
    Accept: 'application/json',
    Origin: ORIGIN,
    Referer: `${ORIGIN}/`,
  };
}

function marketsUrl(leagueId: string, subId: string) {
  const eventsQuery = `$filter=leagueId eq '${leagueId}' AND clientMetadata/Subcategories/any(s: s/Id eq '${subId}')`;
  const marketsQuery = `$filter=clientMetadata/subCategoryId eq '${subId}' AND tags/all(t: t ne 'SportcastBetBuilder')`;
  const params = new URLSearchParams({
    isBatchable: 'false',
    templateVars: leagueId,
    eventsQuery,
    marketsQuery,
    include: 'Events',
    entity: 'events',
  });
  return `${SITE}/controldata/league/leagueSubcategory/v1/markets?${params}`;
}

function load(url: string) {
  const hit = cache.get(url);
  if (hit) return hit;
  const pending = fetchJson(url, headers(), 'DraftKings').then((body) => body as DraftKingsBody);
  cache.set(url, pending);
  pending.catch(() => cache.delete(url));
  return pending;
}

function skippedName(name: string) {
  return /alternate|quarter|half|period|\b1q\b|\b1h\b/i.test(name);
}

function openSelection(selection: DkSelection) {
  const status = String(selection.status ?? '').toLowerCase();
  if (status && status !== 'visible' && status !== 'active') return false;
  return !(selection.tags ?? []).some((tag) => /suspend/i.test(String(tag)));
}

function sides(event: DkEvent, resolve: (name: string) => string) {
  let home = '';
  let away = '';
  for (const participant of event.participants ?? []) {
    const name = resolve(String(participant.name ?? ''));
    if (participant.venueRole === 'Home') home = name;
    if (participant.venueRole === 'Away') away = name;
  }
  return { home, away };
}

function priceOf(selection: DkSelection) {
  return americanPrice(selection.displayOdds?.american);
}

/** Game lines and, when the body is a prop subcategory, player markets. */
export function normalizeDraftKings(body: DraftKingsBody, options: {
  from: string;
  to: string;
  resolve: (name: string) => string;
  wanted?: Set<string>;
  eventId?: string;
  props?: boolean;
}): ReturnType<typeof bookEvent>[] {
  const events = new Map<string, DkEvent>();
  for (const event of body.events ?? []) {
    if (!event.id) continue;
    events.set(String(event.id), event);
  }
  const markets = new Map<string, DkMarket>();
  for (const market of body.markets ?? []) {
    if (!market.id) continue;
    markets.set(String(market.id), market);
  }
  const byMarket = new Map<string, DkSelection[]>();
  for (const selection of body.selections ?? []) {
    if (!selection.marketId || !openSelection(selection)) continue;
    const list = byMarket.get(String(selection.marketId)) ?? [];
    list.push(selection);
    byMarket.set(String(selection.marketId), list);
  }

  const built = new Map<string, { event: DkEvent; h2h: Outcome[]; spreads: Outcome[]; totals: Outcome[]; props: Map<string, Outcome[]> }>();
  const ensure = (event: DkEvent) => {
    const id = String(event.id);
    const row = built.get(id) ?? {
      event,
      h2h: [] as Outcome[],
      spreads: [] as Outcome[],
      totals: [] as Outcome[],
      props: new Map<string, Outcome[]>(),
    };
    built.set(id, row);
    return row;
  };

  for (const [marketId, market] of markets) {
    const event = events.get(String(market.eventId ?? ''));
    if (!event?.startEventDate) continue;
    if (options.eventId && String(event.id) !== options.eventId) continue;
    if (!options.props && !inWindow(trimStamp(event.startEventDate), options.from, options.to)) continue;
    const typeName = String(market.marketType?.name ?? market.name ?? '');
    const marketName = String(market.name ?? '');
    if (skippedName(typeName) || skippedName(marketName)) continue;
    const selections = byMarket.get(marketId) ?? [];
    if (!selections.length) continue;
    const row = ensure(event);
    if (options.props) {
      pushProps(row.props, marketName, typeName, selections, options.wanted);
      continue;
    }
    const named = sides(event, options.resolve);
    if (/moneyline/i.test(typeName)) {
      row.h2h.push(...moneyline(selections, named.home, named.away, options.resolve));
    } else if (/spread|puck line/i.test(typeName)) {
      row.spreads.push(...spread(selections, options.resolve));
    } else if (/total/i.test(typeName)) {
      row.totals.push(...total(selections));
    }
  }

  const slate = [];
  for (const [id, row] of built) {
    if (!row.event.startEventDate) continue;
    const named = sides(row.event, options.resolve);
    if (!options.props && !named.home) continue;
    const home = named.home || 'Home';
    const away = named.away || 'Away';
    const marketsOut: Market[] = options.props
      ? [...row.props.entries()].map(([key, outcomes]) => ({ key, outcomes }))
      : [
          { key: 'h2h', outcomes: row.h2h },
          { key: 'spreads', outcomes: row.spreads },
          { key: 'totals', outcomes: row.totals },
        ];
    if (!marketsOut.some((market) => market.outcomes.length)) continue;
    slate.push(bookEvent(id, trimStamp(row.event.startEventDate), home, away, 'draftkings', marketsOut));
  }
  return slate;
}

function moneyline(selections: DkSelection[], home: string, away: string, resolve: (name: string) => string) {
  const rows: Outcome[] = [];
  for (const selection of selections) {
    const price = priceOf(selection);
    if (price == null) continue;
    const type = String(selection.outcomeType ?? '');
    if (type === 'Tie' || /^draw$/i.test(String(selection.label ?? ''))) {
      rows.push(outcome('Draw', price));
      continue;
    }
    const name = type === 'Home' ? home : type === 'Away' ? away : resolve(String(selection.label ?? ''));
    if (!name) continue;
    rows.push(outcome(name, price));
  }
  return rows;
}

function spread(selections: DkSelection[], resolve: (name: string) => string) {
  const rows = [];
  for (const selection of selections) {
    const price = priceOf(selection);
    const point = Number(selection.points);
    if (price == null || !Number.isFinite(point)) continue;
    const label = String(selection.label ?? '').trim();
    if (!label) continue;
    rows.push({ name: resolve(label), price, point });
  }
  if (rows.length === 2 && new Set(rows.map((row) => Math.abs(row.point))).size === 1) {
    return rows.map((row) => outcome(row.name, row.price, row.point));
  }
  return balancedSpreads(rows).map((quote) => outcome(quote.label, quote.price, quote.point));
}

function total(selections: DkSelection[]) {
  const rows: { side: 'Over' | 'Under'; price: number; point: number }[] = [];
  for (const selection of selections) {
    const price = priceOf(selection);
    const point = Number(selection.points);
    const type = String(selection.outcomeType ?? selection.label ?? '');
    if (price == null || !Number.isFinite(point)) continue;
    if (/^over$/i.test(type)) rows.push({ side: 'Over', price, point });
    if (/^under$/i.test(type)) rows.push({ side: 'Under', price, point });
  }
  if (rows.length === 2 && rows[0] && rows[1] && rows[0].point === rows[1].point) {
    return rows.map((row) => outcome(row.side, row.price, row.point));
  }
  return balancedTotals(rows).map((quote) => outcome(quote.label, quote.price, quote.point));
}

function playerName(marketName: string) {
  return marketName
    .replace(/\s+(passing yards o\/u|rushing yards o\/u|receiving yards o\/u|receptions o\/u|passing tds o\/u|pass tds o\/u|passing touchdowns o\/u|passing completions o\/u|rushing attempts o\/u|rush attempts o\/u|kicking points o\/u|kicking pts o\/u|field goals o\/u|points o\/u|rebounds o\/u|assists o\/u|threes o\/u|blocks o\/u|steals o\/u|shots on goal o\/u|saves o\/u|power play points o\/u)$/i, '')
    .trim();
}

function pushProps(grouped: Map<string, Outcome[]>, marketName: string, typeName: string, selections: DkSelection[], wanted?: Set<string>) {
  if (/milestone/i.test(typeName)) return;
  const anytime = /anytime (touchdown scorer|goalscorer)/i.test(typeName);
  if (anytime) {
    const key = /goal/i.test(typeName) ? 'player_goal_scorer_anytime' : 'player_anytime_td';
    if (wanted && !wanted.has(key)) return;
    const list = grouped.get(key) ?? [];
    for (const selection of selections) {
      if (selection.outcomeType !== 'ToScoreAnyTime') continue;
      const price = priceOf(selection);
      const player = String(selection.label ?? '').trim();
      if (price == null || !player) continue;
      list.push(outcome('Yes', price, null, player));
    }
    if (list.length) grouped.set(key, list);
    return;
  }
  const key = propKey(typeName, marketName);
  if (!key || (wanted && !wanted.has(key))) return;
  const player = playerName(marketName);
  if (!player) return;
  const rows: { side: 'Over' | 'Under'; price: number; point: number }[] = [];
  for (const selection of selections) {
    if (selection.outcomeType !== 'Over' && selection.outcomeType !== 'Under') continue;
    const price = priceOf(selection);
    const point = Number(selection.points);
    if (price == null || !Number.isFinite(point)) continue;
    rows.push({ side: selection.outcomeType === 'Over' ? 'Over' : 'Under', price, point });
  }
  const chosen = balancedTotals(rows);
  if (!chosen.length) return;
  const list = grouped.get(key) ?? [];
  for (const quote of chosen) list.push(outcome(quote.label, quote.price, quote.point, player));
  grouped.set(key, list);
}

function propKey(typeName: string, marketName: string) {
  const text = `${typeName} ${marketName}`;
  if (/passing yards o\/u/i.test(text)) return 'player_pass_yds';
  if (/rushing yards o\/u/i.test(text)) return 'player_rush_yds';
  if (/receiving yards o\/u|reception yards o\/u/i.test(text)) return 'player_reception_yds';
  if (/receptions o\/u/i.test(text)) return 'player_receptions';
  if (/pass(ing)? (tds|touchdowns) o\/u/i.test(text)) return 'player_pass_tds';
  if (/pass(ing)? completions o\/u/i.test(text)) return 'player_pass_completions';
  if (/rush(ing)? attempts o\/u/i.test(text)) return 'player_rush_attempts';
  if (/kicking (pts|points) o\/u/i.test(text)) return 'player_kicking_points';
  if (/field goals o\/u/i.test(text)) return 'player_field_goals';
  if (/\bpoints o\/u/i.test(text)) return 'player_points';
  if (/rebounds o\/u/i.test(text)) return 'player_rebounds';
  if (/assists o\/u/i.test(text)) return 'player_assists';
  if (/threes o\/u/i.test(text)) return 'player_threes';
  if (/blocks o\/u/i.test(text)) return 'player_blocks';
  if (/steals o\/u/i.test(text)) return 'player_steals';
  if (/shots on goal o\/u/i.test(text)) return 'player_shots_on_goal';
  if (/saves o\/u/i.test(text)) return 'player_total_saves';
  if (/power play points o\/u/i.test(text)) return 'player_power_play_points';
  if (/shots on target/i.test(text)) return 'player_shots_on_target';
  if (/player shots/i.test(text) || /shots o\/u/i.test(text)) return 'player_shots';
  if (/card/i.test(text)) return 'player_to_receive_card';
  return '';
}

function sportOf(url: string) {
  return /\/sports\/([^/]+)/.exec(new URL(url).pathname)?.[1] ?? '';
}

function propSubs(body: DraftKingsBody) {
  const found: { id: string; key: string }[] = [];
  for (const sub of body.subcategories ?? []) {
    const name = String(sub.name ?? '').trim();
    if (!name || skippedName(name)) continue;
    const match = PROP_NAMES.find((row) => row.pattern.test(name));
    if (!match || sub.id == null) continue;
    found.push({ id: String(sub.id), key: match.key });
  }
  return found;
}

async function slate(sportKey: string, from: string, to: string) {
  const league = LEAGUES[sportKey];
  if (!league) throw new Error(`DraftKings has no odds for ${sportKey}.`);
  if (league.empty) return [];
  const resolve = await teamResolver(sportKey);
  const bodies = await Promise.all(league.subs.map((sub) => load(marketsUrl(league.leagueId, sub.id))));
  const merged: DraftKingsBody = { events: [], markets: [], selections: [] };
  for (const body of bodies) {
    merged.events?.push(...(body.events ?? []));
    merged.markets?.push(...(body.markets ?? []));
    merged.selections?.push(...(body.selections ?? []));
  }
  return normalizeDraftKings(merged, { from, to, resolve });
}

async function props(sportKey: string, eventId: string, wanted: Set<string>) {
  const league = LEAGUES[sportKey];
  if (!league || league.empty || !wanted.size) {
    return bookEvent(eventId, new Date().toISOString(), 'Home', 'Away', 'draftkings', []);
  }
  const leagueBody = await load(`${SITE}/v1/leagues/${league.leagueId}`);
  const subs = propSubs(leagueBody).filter((sub) => wanted.has(sub.key));
  const resolve = await teamResolver(sportKey);
  const bodies = await Promise.all(subs.map((sub) => load(marketsUrl(league.leagueId, sub.id))));
  const merged: DraftKingsBody = { events: [], markets: [], selections: [] };
  for (const body of bodies) {
    merged.events?.push(...(body.events ?? []));
    merged.markets?.push(...(body.markets ?? []));
    merged.selections?.push(...(body.selections ?? []));
  }
  const found = normalizeDraftKings(merged, { from: '', to: '', resolve, wanted, eventId, props: true });
  return found[0] ?? bookEvent(eventId, new Date().toISOString(), 'Home', 'Away', 'draftkings', []);
}

/** Read a slate URL or an events URL and answer from DraftKings. */
export async function draftkingsFetch(url: string): Promise<unknown> {
  const parsed = new URL(url);
  const sportKey = sportOf(url);
  if (!sportKey) throw new Error('DraftKings could not read the sport.');
  if (parsed.pathname.includes('/events/')) {
    const raw = /\/events\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '';
    if (!raw) throw new Error('DraftKings could not read the event.');
    const eventId = decodedEventId(raw);
    const segment = bookEventId(raw, 'dk');
    if (!segment) return bookEvent(eventId, new Date().toISOString(), 'Home', 'Away', 'draftkings', []);
    const wanted = new Set((parsed.searchParams.get('markets') ?? '').split(',').filter(Boolean));
    return props(sportKey, segment, wanted);
  }
  return slate(sportKey, parsed.searchParams.get('commenceTimeFrom') ?? '', parsed.searchParams.get('commenceTimeTo') ?? '');
}
