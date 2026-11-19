// Disk cache for odds responses. The key is the request path with apiKey removed.
// The Odds API keeps that hash as the file name. FanDuel adds a fanduel- prefix so it does not replace a paid save.
// A hit does not call the network and does not spend a credit.
// A slate whose kickoff window moved still counts as a hit until ODDS_CACHE_HOURS.
// An empty slate loses that lookup while a non-empty sibling is still fresh.
// The empty file is used when it is the only fresh one. An exact request hash still wins.
// odds=YYYY-MM-DD reads that Eastern day's saves even after the lifetime, and does not fetch.
// ODDS_CACHE_HOURS, ODDS_CACHE, and ODDS_CACHE_DIR come from .env.settings.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { appendQuota, quotaEntry } from './quota.js';
import { easternDay } from '../slate/window.js';
import { fanduelFetch } from './fanduel.js';

const DEFAULT_HOURS = 24 * 7;

/** Which price source filled the record: the Odds API or FanDuel. */
export function oddsSource() {
  return process.env.ODDS_SOURCE === 'fanduel' ? 'fanduel' : 'the-odds-api';
}

type CacheRecord = {
  savedAt: string;
  remaining: number | null;
  body: unknown;
  request: string;
  source?: string;
};

export type OddsOutcome = {
  name: string;
  price: number;
  point?: number;
  description?: string;
};

export type OddsMarket = {
  key: string;
  outcomes: OddsOutcome[];
};

export type OddsBook = {
  key: string;
  title?: string;
  markets: OddsMarket[];
};

/** One Odds API event. A slate response is an array of these. A prop response is one of them. */
export type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBook[];
};

export type OddsResponse = {
  body: OddsEvent[] | OddsEvent | null;
  remaining: number | null;
  cached: boolean;
  savedAt: string;
  /** True when a live fetch was skipped to stay above ODDS_CREDIT_FLOOR. */
  skipped?: boolean;
};

const unexpected = 'Odds API returned an unexpected payload.';

function textOf(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value : '';
}

function parseOutcome(value: unknown): OddsOutcome {
  if (!value || typeof value !== 'object') throw new Error(unexpected);
  const row = value as Record<string, unknown>;
  const name = textOf(row.name);
  if (!name || typeof row.price !== 'number' || !Number.isFinite(row.price)) throw new Error(unexpected);
  const outcome: OddsOutcome = { name, price: row.price };
  if (row.point != null) {
    if (typeof row.point !== 'number' || !Number.isFinite(row.point)) throw new Error(unexpected);
    outcome.point = row.point;
  }
  if (row.description != null) {
    if (typeof row.description !== 'string') throw new Error(unexpected);
    outcome.description = row.description;
  }
  return outcome;
}

function parseBook(value: unknown): OddsBook {
  if (!value || typeof value !== 'object') throw new Error(unexpected);
  const row = value as Record<string, unknown>;
  const key = textOf(row.key);
  if (!key) throw new Error(unexpected);
  if (row.markets != null && !Array.isArray(row.markets)) throw new Error(unexpected);
  const markets = (Array.isArray(row.markets) ? row.markets : []).map((market) => {
    if (!market || typeof market !== 'object') throw new Error(unexpected);
    const item = market as Record<string, unknown>;
    const marketKey = textOf(item.key);
    if (!marketKey || !Array.isArray(item.outcomes)) throw new Error(unexpected);
    return { key: marketKey, outcomes: item.outcomes.map(parseOutcome) };
  });
  const title = textOf(row.title);
  return { key, ...(title ? { title } : {}), markets };
}

function parseEvent(value: unknown): OddsEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(unexpected);
  const row = value as Record<string, unknown>;
  const id = textOf(row.id);
  const commence_time = textOf(row.commence_time);
  const home_team = textOf(row.home_team);
  const away_team = textOf(row.away_team);
  if (!id || !commence_time || !home_team || !away_team) throw new Error(unexpected);
  if (row.bookmakers != null && !Array.isArray(row.bookmakers)) throw new Error(unexpected);
  const bookmakers = Array.isArray(row.bookmakers) ? row.bookmakers.map(parseBook) : [];
  return { id, commence_time, home_team, away_team, bookmakers };
}

/** A slate is an array of events. A prop response is one event. Anything else throws. */
export function parseOddsBody(body: unknown): OddsEvent[] | OddsEvent {
  if (Array.isArray(body)) return body.map(parseEvent);
  return parseEvent(body);
}

export type SavedOddsSlate = {
  sport: string;
  games: number;
  savedAt: string;
  from: string;
  to: string;
};

export type SavedOddsDay = {
  day: string;
  source: string;
  slates: SavedOddsSlate[];
  props: number;
};

let replayDay: string | null = null;
let catalog: Promise<CacheRecord[]> | null = null;
let catalogDir: string | null = null;

/** Use odds saved on this America/New_York day. A miss throws instead of calling the network. */
export function setOddsReplay(day: string | null) {
  replayDay = day;
}

export function oddsReplayDay() {
  return replayDay;
}

function cacheDir() {
  return process.env.ODDS_CACHE_DIR || fileURLToPath(new URL('../odds-cache/', import.meta.url));
}

function cacheBypass() {
  return process.argv.includes('--fresh') || process.env.ODDS_CACHE === '0';
}

function maxAgeMs() {
  const raw = process.env.ODDS_CACHE_HOURS;
  if (raw == null || raw === '') return DEFAULT_HOURS * 3_600_000;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) return DEFAULT_HOURS * 3_600_000;
  return hours * 3_600_000;
}

/** Live prop requests stop once the last Odds API header is under this. Cached reads still run. 0 disables the stop. */
export function oddsCreditFloor() {
  const raw = process.env.ODDS_CREDIT_FLOOR;
  if (raw == null || raw.trim() === '') return 30;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 30;
  return Math.floor(value);
}

export function ageLabel(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function oddsRequestKey(url: string) {
  const parsed = new URL(url);
  for (const name of [...parsed.searchParams.keys()]) {
    if (/api.?key/i.test(name)) parsed.searchParams.delete(name);
  }
  parsed.searchParams.sort();
  const request = `${parsed.pathname}?${parsed.searchParams.toString()}`;
  const hash = createHash('sha256').update(request).digest('hex').slice(0, 20);
  return { request, hash };
}

/** Odds API files keep the legacy hash. Any other source is prefixed so the two do not share a file. */
export function oddsCacheName(hash: string, source = oddsSource()) {
  return source === 'the-odds-api' ? `${hash}.json` : `${source}-${hash}.json`;
}

/** Same sport and markets, ignoring the kickoff window. That window shifts every run. */
export function oddsSlateFamily(request: string) {
  const parsed = new URL(request, 'https://api.the-odds-api.com');
  parsed.searchParams.delete('commenceTimeFrom');
  parsed.searchParams.delete('commenceTimeTo');
  parsed.searchParams.sort();
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

async function readHit(file: string, source: string): Promise<CacheRecord | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  let record: CacheRecord;
  try {
    record = JSON.parse(raw) as CacheRecord;
  } catch {
    return null;
  }
  const saved = Date.parse(record?.savedAt ?? '');
  if (!Number.isFinite(saved) || Date.now() - saved > maxAgeMs()) return null;
  if (record.body == null) return null;
  if (recordedSource(record) !== source) return null;
  return record;
}

/** Saves written before the source field are Odds API responses. */
function recordedSource(record: CacheRecord) {
  return record.source ?? 'the-odds-api';
}

function sportOf(request: string) {
  return /\/sports\/([^/]+)/.exec(request.split('?')[0] ?? '')?.[1] ?? 'that request';
}

function requestLabel(request: string) {
  return request.includes('/events/') ? `${sportOf(request)} props` : sportOf(request);
}

function sameSavedRequest(saved: string, want: string) {
  if (saved.includes('/events/') || want.includes('/events/')) return saved === want;
  return oddsSlateFamily(saved) === oddsSlateFamily(want);
}

async function readCatalog() {
  const dir = cacheDir();
  if (!catalog || catalogDir !== dir) {
    catalogDir = dir;
    catalog = readAll();
  }
  return catalog;
}

async function readAll(): Promise<CacheRecord[]> {
  let names: string[];
  try {
    names = await readdir(cacheDir());
  } catch {
    return [];
  }
  const records: CacheRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    let record: CacheRecord;
    try {
      record = JSON.parse(await readFile(`${cacheDir()}/${name}`, 'utf8')) as CacheRecord;
    } catch {
      continue;
    }
    if (!record?.request || record.body == null || !Number.isFinite(Date.parse(record.savedAt ?? ''))) continue;
    records.push(record);
  }
  return records;
}

async function readReplay(request: string, source: string): Promise<CacheRecord | null> {
  if (!replayDay) return null;
  let best: CacheRecord | null = null;
  let bestSaved = -Infinity;
  for (const record of await readCatalog()) {
    if (easternDay(record.savedAt) !== replayDay) continue;
    if (recordedSource(record) !== source) continue;
    if (!sameSavedRequest(record.request, request)) continue;
    const saved = Date.parse(record.savedAt);
    if (saved <= bestSaved) continue;
    best = record;
    bestSaved = saved;
  }
  return best;
}

function windowOf(request: string) {
  const parsed = new URL(request, 'https://api.the-odds-api.com');
  return {
    from: parsed.searchParams.get('commenceTimeFrom') ?? '',
    to: parsed.searchParams.get('commenceTimeTo') ?? '',
  };
}

/** Eastern days that have saved odds, newest day first. One entry per source. Does not call the network. */
export async function listSavedOdds(): Promise<SavedOddsDay[]> {
  const byDay = new Map<string, { slates: Map<string, SavedOddsSlate>; props: Set<string> }>();
  for (const record of await readCatalog()) {
    const day = easternDay(record.savedAt);
    if (!day) continue;
    const source = recordedSource(record);
    const bucketKey = `${day}\n${source}`;
    const bucket = byDay.get(bucketKey) ?? { slates: new Map(), props: new Set() };
    if (record.request.includes('/events/')) {
      bucket.props.add(record.request.split('?')[0] ?? record.request);
    } else {
      const family = oddsSlateFamily(record.request);
      const current = bucket.slates.get(family);
      if (!current || Date.parse(record.savedAt) > Date.parse(current.savedAt)) {
        const window = windowOf(record.request);
        bucket.slates.set(family, {
          sport: sportOf(record.request),
          games: Array.isArray(record.body) ? record.body.length : 0,
          savedAt: record.savedAt,
          from: window.from,
          to: window.to,
        });
      }
    }
    byDay.set(bucketKey, bucket);
  }
  return [...byDay.entries()]
    .sort((a, b) => {
      const [dayA, sourceA] = a[0].split('\n');
      const [dayB, sourceB] = b[0].split('\n');
      const byDayOrder = (dayB ?? '').localeCompare(dayA ?? '');
      if (byDayOrder !== 0) return byDayOrder;
      if (sourceA === sourceB) return 0;
      if (sourceA === 'the-odds-api') return -1;
      if (sourceB === 'the-odds-api') return 1;
      return (sourceA ?? '').localeCompare(sourceB ?? '');
    })
    .map(([key, bucket]) => {
      const [day, source] = key.split('\n');
      return {
        day: day ?? '',
        source: source ?? 'the-odds-api',
        slates: [...bucket.slates.values()].sort((a, b) => a.sport.localeCompare(b.sport)),
        props: bucket.props.size,
      };
    });
}

function bodyHasGames(body: unknown) {
  if (Array.isArray(body)) return body.length > 0;
  return body != null;
}

/**
 * Newest record, except an empty slate loses to a sibling that still has games.
 * Callers pass records that are already inside the cache lifetime.
 */
export function preferFreshRecord<T extends { savedAt: string; body: unknown }>(records: T[]): T | null {
  let best: T | null = null;
  let bestSaved = -Infinity;
  let bestHasGames = false;
  for (const record of records) {
    const saved = Date.parse(record.savedAt);
    if (!Number.isFinite(saved)) continue;
    const hasGames = bodyHasGames(record.body);
    const newer = saved > bestSaved;
    const better = best == null || (hasGames && !bestHasGames) || (hasGames === bestHasGames && newer);
    if (!better) continue;
    best = record;
    bestSaved = saved;
    bestHasGames = hasGames;
  }
  return best;
}

async function readFamily(request: string, source: string): Promise<CacheRecord | null> {
  const want = oddsSlateFamily(request);
  let names: string[];
  try {
    names = await readdir(cacheDir());
  } catch {
    return null;
  }
  const hits: CacheRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const hit = await readHit(`${cacheDir()}/${name}`, source);
    if (!hit?.request || oddsSlateFamily(hit.request) !== want) continue;
    hits.push(hit);
  }
  return preferFreshRecord(hits);
}

async function store(file: string, record: CacheRecord) {
  await mkdir(cacheDir(), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(record)}\n`);
  await rename(temp, file);
}

export async function oddsGet(url: string, init?: RequestInit, options?: { cacheOnly?: boolean }): Promise<OddsResponse> {
  const source = oddsSource();
  const identity = oddsRequestKey(url);
  if (replayDay) {
    const hit = await readReplay(identity.request, source);
    if (!hit) throw new Error(`No odds saved on ${replayDay} for ${requestLabel(identity.request)}. Nothing was fetched.`);
    await appendQuota(quotaEntry(identity.request, 'cached', null));
    return { body: parseOddsBody(hit.body), remaining: null, cached: true, savedAt: hit.savedAt };
  }
  const file = `${cacheDir()}/${oddsCacheName(identity.hash, source)}`;
  if (!cacheBypass()) {
    const hit = await readHit(file, source) ?? await readFamily(identity.request, source);
    if (hit) {
      await appendQuota(quotaEntry(identity.request, 'cached', null));
      return { body: parseOddsBody(hit.body), remaining: null, cached: true, savedAt: hit.savedAt };
    }
  }
  if (options?.cacheOnly) return { body: null, remaining: null, cached: false, savedAt: '', skipped: true };
  if (source === 'fanduel') {
    const raw = await fanduelFetch(url);
    let body: OddsEvent[] | OddsEvent;
    try {
      body = parseOddsBody(raw);
    } catch {
      throw new Error('FanDuel returned an unexpected payload.');
    }
    const savedAt = new Date().toISOString();
    await appendQuota(quotaEntry(identity.request, 'live', null));
    await store(file, { savedAt, remaining: null, body: raw, request: identity.request, source });
    return { body, remaining: null, cached: false, savedAt };
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new Error('Odds API timed out.');
    throw new Error('Odds API did not answer.');
  }
  const remainingHeader = res.headers.get('x-requests-remaining');
  const remaining = remainingHeader == null || remainingHeader === '' ? null : Number(remainingHeader);
  const credits = Number.isFinite(remaining) ? remaining : null;
  await appendQuota(quotaEntry(identity.request, 'live', credits));
  const raw = await res.json() as unknown;
  if (!res.ok) {
    const failed = raw && typeof raw === 'object' ? raw as { message?: unknown; error?: unknown } : {};
    const message = textOf(failed.message) || textOf(failed.error) || res.statusText;
    throw new Error(`Odds API ${res.status}: ${message}`);
  }
  const body = parseOddsBody(raw);
  const savedAt = new Date().toISOString();
  await store(file, {
    savedAt,
    remaining: credits,
    body: raw,
    request: identity.request,
    source: 'the-odds-api',
  });
  return { body, remaining: credits, cached: false, savedAt };
}
