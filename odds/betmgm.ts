// BetMGM Illinois sportsbook JSON, normalized into the event shape the boards already read.
// The access id is public client config. It is loaded at runtime and is not committed.
// Node fetch is blocked on the fixtures host from this machine, so those calls use curl HTTP/1.1.
// Do not print the command or the access id. A non-200 stops. There is no paid fallback.
import { execFile } from 'node:child_process';
import { bookEventId, decodedEventId, placeholderEvent } from './direct.js';
import { pickBalanced, teamResolver, type LineQuote } from './fanduel.js';
import { americanPrice, BookError, fetchJson, inWindow, mapPool, textValue, BROWSER } from './http.js';
import { bookEvent, outcome, type Market, type Outcome } from './shape.js';

const CONFIG = 'https://www.il.betmgm.com/en/api/clientconfig?browserUrl=http%3A%2F%2Fwww.il.betmgm.com%2Fen%2Fsports';

type Param = { key?: string; value?: string };

export type BetMgmOption = {
  name?: { value?: string } | string;
  status?: string;
  price?: { americanOdds?: number };
};

export type BetMgmMarket = {
  name?: { value?: string } | string;
  status?: string;
  parameters?: Param[];
  options?: BetMgmOption[];
};

export type BetMgmFixture = {
  id?: string;
  name?: { value?: string } | string;
  startDate?: string;
  fixtureType?: string;
  stage?: string;
  isOpenForBetting?: boolean;
  participants?: { name?: { value?: string } | string; properties?: { type?: string } }[];
  optionMarkets?: BetMgmMarket[];
  competition?: { id?: number | string; name?: { value?: string } | string };
  region?: { name?: { value?: string } | string };
};

type SportRef = { sportId: string; competitionId?: string; name?: string; region?: string; soccer?: boolean };

const SPORTS: Record<string, SportRef> = {
  americanfootball_nfl: { sportId: '11', competitionId: '103489' },
  americanfootball_ncaaf: { sportId: '11', competitionId: '103495' },
  basketball_nba: { sportId: '7', competitionId: '6004' },
  icehockey_nhl: { sportId: '12', competitionId: '34' },
  baseball_mlb: { sportId: '23', name: 'MLB' },
  soccer_epl: { sportId: '4', name: 'Premier League', region: 'England', soccer: true },
  soccer_uefa_champs_league: { sportId: '4', name: 'UEFA Champions League', region: 'Europe', soccer: true },
  soccer_spain_la_liga: { sportId: '4', name: 'LaLiga', region: 'Spain', soccer: true },
  soccer_italy_serie_a: { sportId: '4', name: 'Serie A', region: 'Italy', soccer: true },
  soccer_germany_bundesliga: { sportId: '4', name: 'Bundesliga', region: 'Germany', soccer: true },
  soccer_france_ligue_one: { sportId: '4', name: 'Ligue 1', region: 'France', soccer: true },
};

const HAPPENING: Record<string, string> = {
  PassingYards: 'player_pass_yds',
  ReceivingYards: 'player_reception_yds',
  RushingYards: 'player_rush_yds',
  TouchdownPass: 'player_pass_tds',
  RushingAttempt: 'player_rush_attempts',
  Reception: 'player_receptions',
  PassCompleted: 'player_pass_completions',
  Point: 'player_points',
  Rebound: 'player_rebounds',
  Assist: 'player_assists',
  ThreePoint: 'player_threes',
  ThreePointer: 'player_threes',
  Block: 'player_blocks',
  Steal: 'player_steals',
  ShotOnGoal: 'player_shots_on_goal',
  Save: 'player_total_saves',
  PowerPlayPoint: 'player_power_play_points',
  PowerPlayPoints: 'player_power_play_points',
  Shot: 'player_shots',
  ShotOnTarget: 'player_shots_on_target',
  Card: 'player_to_receive_card',
  Booking: 'player_to_receive_card',
};

let session: { access: string; base: string } | null = null;
let sawSuccess = false;
let refreshed = false;
const sportCache = new Map<string, Promise<BetMgmFixture[]>>();
const viewCache = new Map<string, Promise<BetMgmFixture | null>>();

export function resetBetMgm() {
  sportCache.clear();
  viewCache.clear();
  session = null;
  sawSuccess = false;
  refreshed = false;
}

export function betMgmCacheSize() {
  return sportCache.size + viewCache.size;
}

/** One resolved sport list, so a test can prove `resetBetMgm` drops it. Also arms the session flags. */
export function holdBetMgmSport(sportId: string, fixtures: BetMgmFixture[]) {
  sportCache.set(sportId, Promise.resolve(fixtures));
  viewCache.set(`${sportId}:view`, Promise.resolve(null));
  session = { access: 'test-access', base: 'https://example.invalid' };
  sawSuccess = true;
  refreshed = true;
}

export function betMgmSessionOpen() {
  return session != null;
}

/** A new fixture. Spreads stay off the object `sportCache` is holding. */
export function attachSpreads(fixture: BetMgmFixture, spreads: BetMgmMarket[]): BetMgmFixture {
  return { ...fixture, optionMarkets: [...(fixture.optionMarkets ?? []), ...spreads] };
}

function configHeaders() {
  return {
    'User-Agent': BROWSER,
    Accept: 'application/json',
    'x-bwin-browser-url': 'http%3A%2F%2Fwww.il.betmgm.com%2Fen%2Fsports',
    'x-from-product': 'host-app',
    'x-bwin-sports-api': 'prod',
  };
}

function curlConfig(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BookError('BetMGM', null, false);
  }
  if (parsed.protocol !== 'https:' || /[\r\n"]/.test(url)) throw new BookError('BetMGM', null, false);
  return `url = "${url}"\n`;
}

function runCurl(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('curl', args, { maxBuffer: 64 * 1024 * 1024, timeout: 35_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}

async function curlJson(url: string): Promise<unknown> {
  let stdout = '';
  try {
    stdout = await runCurl([
      '--http1.1', '-sS', '-w', '\n%{http_code}',
      '-H', `User-Agent: ${BROWSER}`,
      '-H', 'Accept: application/json',
      '--max-time', '30',
      '-K', '-',
    ], curlConfig(url));
  } catch (error) {
    if (error instanceof BookError) throw error;
    throw new BookError('BetMGM', null, false);
  }
  const lines = stdout.trimEnd().split('\n');
  const status = Number(lines.at(-1));
  const answered = Number.isFinite(status);
  if (!answered || status < 200 || status >= 300) throw new BookError('BetMGM', answered ? status : null, answered);
  try {
    return JSON.parse(lines.slice(0, -1).join('\n')) as unknown;
  } catch {
    throw new BookError('BetMGM', status, true);
  }
}

async function curlRetry(url: string) {
  try {
    return await curlJson(url);
  } catch (error) {
    if (error instanceof BookError && !error.answered) return curlJson(url);
    throw error;
  }
}

async function clientConfig(force = false) {
  if (session && !force) return session;
  const body = await fetchJson(CONFIG, configHeaders(), 'BetMGM') as {
    msConnection?: { publicAccessId?: string; cdsApiUrl?: string };
  };
  const access = body.msConnection?.publicAccessId;
  const base = body.msConnection?.cdsApiUrl?.replace(/\/$/, '');
  if (!access || !base) throw new BookError('BetMGM', null, true);
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new BookError('BetMGM', null, true);
  }
  if (parsed.protocol !== 'https:') throw new BookError('BetMGM', null, true);
  session = { access, base };
  return session;
}

async function betmgmGet(path: string, query: URLSearchParams) {
  const run = async (force: boolean) => {
    const current = await clientConfig(force);
    const params = new URLSearchParams(query);
    params.set('x-bwin-accessid', current.access);
    return curlRetry(`${current.base}${path}?${params}`);
  };
  try {
    const body = await run(false);
    sawSuccess = true;
    return body;
  } catch (error) {
    const denied = error instanceof BookError && (error.status === 401 || error.status === 403);
    if (denied && sawSuccess && !refreshed) {
      refreshed = true;
      session = null;
      const body = await run(true);
      sawSuccess = true;
      return body;
    }
    throw error;
  }
}

function fixtureQuery(sportId: string) {
  return new URLSearchParams({
    lang: 'en-us',
    country: 'US',
    userCountry: 'US',
    subdivision: 'US-Illinois',
    state: 'Latest',
    offerMapping: 'Filtered',
    offerCategories: 'Gridable',
    fixtureCategories: 'Gridable',
    sportIds: sportId,
    isPriceBoost: 'false',
    statisticsModes: 'None',
    scoreboardMode: 'Full',
  });
}

async function loadSport(sportId: string) {
  const hit = sportCache.get(sportId);
  if (hit) return hit;
  const pending = betmgmGet('/bettingoffer/fixtures', fixtureQuery(sportId)).then((body) => {
    const row = body as { fixtures?: BetMgmFixture[] };
    return row.fixtures ?? [];
  });
  sportCache.set(sportId, pending);
  pending.catch(() => sportCache.delete(sportId));
  return pending;
}

async function loadView(id: string) {
  const hit = viewCache.get(id);
  if (hit) return hit;
  const query = new URLSearchParams({
    lang: 'en-us',
    country: 'US',
    userCountry: 'US',
    subdivision: 'US-Illinois',
    fixtureIds: id,
    state: 'Latest',
    offerMapping: 'All',
  });
  const pending = betmgmGet('/bettingoffer/fixture-view', query).then((body) => {
    const row = body as { fixture?: BetMgmFixture; fixtures?: BetMgmFixture[] };
    return row.fixture ?? row.fixtures?.[0] ?? null;
  });
  viewCache.set(id, pending);
  pending.catch(() => viewCache.delete(id));
  return pending;
}

function fields(market: BetMgmMarket) {
  const out: Record<string, string> = {};
  for (const param of market.parameters ?? []) {
    if (param.key) out[param.key] = String(param.value ?? '');
  }
  return out;
}

function openMarket(market: BetMgmMarket) {
  return !market.status || market.status === 'Visible';
}

function openOption(option: BetMgmOption) {
  return !option.status || option.status === 'Visible';
}

function marketName(market: BetMgmMarket) {
  return textValue(market.name);
}

function optionName(option: BetMgmOption) {
  return textValue(option.name);
}

function isListedGame(fixture: BetMgmFixture) {
  const type = fixture.fixtureType;
  return !type || type === 'PairGame' || type === 'Standard';
}

function teams(fixture: BetMgmFixture, resolve: (name: string) => string) {
  let home = '';
  let away = '';
  for (const person of fixture.participants ?? []) {
    const name = resolve(textValue(person.name));
    if (person.properties?.type === 'HomeTeam') home = name;
    if (person.properties?.type === 'AwayTeam') away = name;
  }
  return { home, away };
}

function spreadPoint(name: string) {
  const paren = /\(([+-]?\d+(?:\.\d+)?)\)\s*$/.exec(name);
  if (paren?.[1]) return Number(paren[1]);
  const trailing = /\s([+-]\d+(?:\.\d+)?)\s*$/.exec(name);
  if (trailing?.[1]) return Number(trailing[1]);
  return null;
}

function periodOk(period: string, soccer: boolean) {
  return soccer ? period === 'RegularTime' : period === 'FullTime';
}

/** Grid and fixture-view markets for one book of fixtures. */
export function normalizeBetMgm(fixtures: BetMgmFixture[], options: {
  from: string;
  to: string;
  resolve: (name: string) => string;
  soccer: boolean;
  mode: 'slate' | 'props';
  wanted?: Set<string>;
  /** When set, fixtures outside that competition are dropped. */
  sportKey?: string;
}) {
  const sport = options.sportKey ? SPORTS[options.sportKey] : undefined;
  const slate = [];
  for (const fixture of fixtures) {
    if (sport && !matches(fixture, sport)) continue;
    if (!fixture.id || !fixture.startDate) continue;
    if (!isListedGame(fixture)) continue;
    if (fixture.stage && fixture.stage !== 'PreMatch') continue;
    if (fixture.isOpenForBetting === false) continue;
    if (options.mode === 'slate' && !inWindow(fixture.startDate, options.from, options.to)) continue;
    const named = teams(fixture, options.resolve);
    const markets = options.mode === 'props'
      ? propMarkets(fixture, options.soccer, options.wanted)
      : gameMarkets(fixture, named.home, named.away, options.resolve, options.soccer);
    if (!markets.some((market) => market.outcomes.length)) continue;
    const home = named.home || (options.mode === 'props' ? 'Home' : '');
    const away = named.away || (options.mode === 'props' ? 'Away' : '');
    if (!home || !away) continue;
    slate.push(bookEvent(String(fixture.id), fixture.startDate, home, away, 'betmgm', markets));
  }
  return slate;
}

function pushNamedLine(
  label: string,
  options: BetMgmOption[],
  h2h: Outcome[],
  spreads: LineQuote[][],
  totals: LineQuote[][],
  resolve: (name: string) => string,
) {
  if (/^money\s*line$/i.test(label)) {
    for (const option of options) {
      const price = americanPrice(option.price?.americanOdds);
      const name = optionName(option);
      if (price == null || !name || /^(draw|tie)$/i.test(name)) continue;
      h2h.push(outcome(resolve(name), price));
    }
    return;
  }
  if (/^(spread|puck line)$/i.test(label)) {
    const pair: LineQuote[] = [];
    for (const option of options) {
      const price = americanPrice(option.price?.americanOdds);
      const name = optionName(option);
      const point = spreadPoint(name);
      if (price == null || point == null) continue;
      const team = name.replace(/\s+\(([+-]?\d+(?:\.\d+)?)\)\s*$/, '').replace(/\s+[+-]\d+(?:\.\d+)?\s*$/, '').trim();
      if (!team) continue;
      pair.push({ label: resolve(team), price, point });
    }
    if (pair.length >= 2) spreads.push(pair);
    return;
  }
  if ((/^totals?\b/i.test(label) || /^total goals$/i.test(label)) && !/period|quarter|half/i.test(label)) {
    const pair: LineQuote[] = [];
    for (const option of options) {
      const name = optionName(option);
      const side = /^(over|under)\b/i.exec(name)?.[1];
      const price = americanPrice(option.price?.americanOdds);
      const point = Number(/^(?:Over|Under)\s+([+-]?\d+(?:\.\d+)?)/i.exec(name)?.[1]);
      if (!side || price == null || !Number.isFinite(point)) continue;
      pair.push({ label: side.toLowerCase() === 'over' ? 'Over' : 'Under', price, point });
    }
    if (pair.length >= 2) totals.push(pair);
  }
}

function gameMarkets(fixture: BetMgmFixture, home: string, away: string, resolve: (name: string) => string, soccer: boolean): Market[] {
  const h2h: Outcome[] = [];
  const spreads: LineQuote[][] = [];
  const totals: LineQuote[][] = [];
  for (const market of fixture.optionMarkets ?? []) {
    if (!openMarket(market)) continue;
    const info = fields(market);
    const options = (market.options ?? []).filter(openOption);
    if (!info.MarketType) {
      pushNamedLine(marketName(market), options, h2h, spreads, totals, resolve);
      continue;
    }
    if (!periodOk(info.Period ?? '', soccer)) continue;
    if (info.MarketType === 'Handicap') continue;
    if (options.some((option) => /handicap tie/i.test(optionName(option)))) continue;
    if (info.MarketType === '3way') {
      if (info.MarketSubType || info.RangeValue) continue;
      for (const option of options) {
        const price = americanPrice(option.price?.americanOdds);
        const name = optionName(option);
        if (price == null || !name) continue;
        if (/^(draw|tie)$/i.test(name)) h2h.push(outcome('Draw', price));
        else h2h.push(outcome(resolve(name), price));
      }
      continue;
    }
    if (info.MarketType === '2way' && !soccer) {
      if (!/money\s*line/i.test(marketName(market))) continue;
      for (const option of options) {
        const price = americanPrice(option.price?.americanOdds);
        const name = optionName(option);
        if (price == null || !name) continue;
        h2h.push(outcome(resolve(name), price));
      }
      continue;
    }
    if (info.MarketType === '2wayHandicap') {
      if (/\s-\s/.test(marketName(market))) continue;
      const pair: LineQuote[] = [];
      for (const option of options) {
        const price = americanPrice(option.price?.americanOdds);
        const name = optionName(option);
        const point = spreadPoint(name);
        if (price == null || point == null) continue;
        const team = name.replace(/\s+\(([+-]?\d+(?:\.\d+)?)\)\s*$/, '').replace(/\s+[+-]\d+(?:\.\d+)?\s*$/, '').trim();
        if (!team) continue;
        pair.push({ label: resolve(team), price, point });
      }
      if (pair.length >= 2) spreads.push(pair);
      continue;
    }
    if (info.MarketType === 'Over/Under') {
      if (/\s-\s|team total|player/i.test(marketName(market))) continue;
      const pair: LineQuote[] = [];
      for (const option of options) {
        const name = optionName(option);
        const side = /^(over|under)\b/i.exec(name)?.[1];
        if (!side) continue;
        const price = americanPrice(option.price?.americanOdds);
        const point = info.DecimalValue != null && info.DecimalValue !== '' && Number.isFinite(Number(info.DecimalValue))
          ? Number(info.DecimalValue)
          : Number(/^(?:Over|Under)\s+([+-]?\d+(?:\.\d+)?)/i.exec(name)?.[1]);
        if (price == null || !Number.isFinite(point)) continue;
        pair.push({ label: side.toLowerCase() === 'over' ? 'Over' : 'Under', price, point });
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

function playerOf(name: string) {
  const parts = name.split(/\s+-\s+|:\s+/);
  if (parts.length < 2) return '';
  const player = parts[0]?.trim() ?? '';
  if (!player || /D\/ST/i.test(name)) return '';
  return player;
}

function anytimeKey(name: string, happening: string) {
  if (/D\/ST/i.test(name) || /\b[23]\+/.test(name) || /first/i.test(name) || /^total\b/i.test(name)) return '';
  if (happening === 'Touchdown' && /1\+|to score/i.test(name)) return 'player_anytime_td';
  if (/anytime goal|to score$/i.test(name) && !/shot/i.test(name)) return 'player_goal_scorer_anytime';
  return '';
}

function propMarkets(fixture: BetMgmFixture, soccer: boolean, wanted?: Set<string>): Market[] {
  const grouped = new Map<string, Outcome[]>();
  const ladders = new Map<string, { player: string; pairs: LineQuote[][] }>();
  for (const market of fixture.optionMarkets ?? []) {
    if (!openMarket(market)) continue;
    const info = fields(market);
    if (!periodOk(info.Period ?? '', soccer)) continue;
    const name = marketName(market);
    const options = (market.options ?? []).filter(openOption);
    const yesOptions = options.filter((option) => /^yes\b/i.test(optionName(option)));
    const over = options.filter((option) => /^over\b/i.test(optionName(option)));
    const under = options.filter((option) => /^under\b/i.test(optionName(option)));
    if (yesOptions.length === 1 && !over.length && !under.length) {
      const key = anytimeKey(name, info.Happening ?? '');
      if (!key || (wanted && !wanted.has(key))) continue;
      const price = americanPrice(yesOptions[0]?.price?.americanOdds);
      const player = name.replace(/\s+to score\s+.*/i, '').trim();
      if (price == null || !player) continue;
      const list = grouped.get(key) ?? [];
      list.push(outcome('Yes', price, null, player));
      grouped.set(key, list);
      continue;
    }
    if (info.MarketType !== 'Over/Under' || !over.length || !under.length) continue;
    if (yesOptions.length && !under.length) continue;
    const key = HAPPENING[info.Happening ?? ''];
    const player = playerOf(name);
    if (!key || !player || (wanted && !wanted.has(key))) continue;
    const pair: LineQuote[] = [];
    for (const option of [...over, ...under]) {
      const label = /^over\b/i.test(optionName(option)) ? 'Over' : 'Under';
      const price = americanPrice(option.price?.americanOdds);
      const point = Number(/^(?:Over|Under)\s+([+-]?\d+(?:\.\d+)?)/i.exec(optionName(option))?.[1]);
      if (price == null || !Number.isFinite(point)) continue;
      pair.push({ label, price, point });
    }
    if (pair.length < 2) continue;
    const bucket = ladders.get(`${key}\n${player}`) ?? { player, pairs: [] };
    bucket.pairs.push(pair);
    ladders.set(`${key}\n${player}`, bucket);
  }
  for (const [id, bucket] of ladders) {
    const key = id.split('\n')[0] ?? '';
    const chosen = pickBalanced(bucket.pairs);
    if (!chosen.length) continue;
    const list = grouped.get(key) ?? [];
    for (const quote of chosen) list.push(outcome(quote.label, quote.price, quote.point, bucket.player));
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([key, outcomes]) => ({ key, outcomes }));
}

function matches(fixture: BetMgmFixture, sport: SportRef) {
  if (!isListedGame(fixture)) return false;
  if (sport.soccer) {
    return textValue(fixture.competition?.name) === sport.name && textValue(fixture.region?.name) === sport.region;
  }
  if (sport.competitionId) return String(fixture.competition?.id ?? '') === sport.competitionId;
  if (sport.name) return textValue(fixture.competition?.name) === sport.name;
  return false;
}

async function slate(sportKey: string, from: string, to: string) {
  const sport = SPORTS[sportKey];
  if (!sport) throw new Error(`BetMGM has no odds for ${sportKey}.`);
  const fixtures = (await loadSport(sport.sportId)).filter((fixture) => matches(fixture, sport));
  if (sport.soccer && fixtures.length) {
    await mapPool(fixtures, 3, async (fixture) => {
      if (!fixture.id) return;
      const view = await loadView(String(fixture.id));
      const spreads = (view?.optionMarkets ?? []).filter((market) => {
        const info = fields(market);
        return info.MarketType === '2wayHandicap' && info.Period === 'RegularTime';
      });
      const index = fixtures.indexOf(fixture);
      if (index >= 0) fixtures[index] = attachSpreads(fixture, spreads);
    });
  }
  const resolve = await teamResolver(sportKey);
  return normalizeBetMgm(fixtures, { from, to, resolve, soccer: Boolean(sport.soccer), mode: 'slate' });
}

async function props(sportKey: string, eventId: string, wanted: Set<string>) {
  const sport = SPORTS[sportKey];
  if (!sport || !wanted.size) return placeholderEvent(eventId, 'betmgm');
  const view = await loadView(eventId);
  if (!view) return placeholderEvent(eventId, 'betmgm');
  const resolve = await teamResolver(sportKey);
  const normalized = normalizeBetMgm([view], {
    from: '',
    to: '',
    resolve,
    soccer: Boolean(sport.soccer),
    mode: 'props',
    wanted,
  });
  return normalized[0] ?? placeholderEvent(eventId, 'betmgm', view.startDate);
}

/** Read a slate URL or an events URL and answer from BetMGM. */
export async function betmgmFetch(url: string): Promise<unknown> {
  const parsed = new URL(url);
  const sportKey = /\/sports\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '';
  if (!sportKey || sportKey === 'motorsport_f1') return [];
  if (parsed.pathname.includes('/events/')) {
    const raw = /\/events\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '';
    if (!raw) throw new Error('BetMGM could not read the event.');
    const eventId = decodedEventId(raw);
    const segment = bookEventId(raw, 'mgm');
    if (!segment) return placeholderEvent(eventId, 'betmgm');
    const wanted = new Set((parsed.searchParams.get('markets') ?? '').split(',').filter(Boolean));
    return props(sportKey, segment, wanted);
  }
  return slate(sportKey, parsed.searchParams.get('commenceTimeFrom') ?? '', parsed.searchParams.get('commenceTimeTo') ?? '');
}
