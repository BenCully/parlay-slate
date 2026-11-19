// Disk cache for The Odds API. The key is the request path with apiKey removed.
// A hit does not call the network and does not spend a credit.
// A slate whose kickoff window moved still counts as a hit until ODDS_CACHE_HOURS.
// odds=YYYY-MM-DD reads that Eastern day's saves even after the lifetime, and does not fetch.
// ODDS_CACHE_HOURS, ODDS_CACHE, and ODDS_CACHE_DIR come from .env.settings.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

export type OddsResponse = {
  body: any;
  remaining: number | null;
  cached: boolean;
  savedAt: string;
  /** True when a live fetch was skipped to stay above ODDS_CREDIT_FLOOR. */
  skipped?: boolean;
};

export type SavedOddsSlate = {
  sport: string;
  games: number;
  savedAt: string;
  from: string;
  to: string;
};

export type SavedOddsDay = {
  day: string;
  slates: SavedOddsSlate[];
  props: number;
};

let replayDay: string | null = null;
let catalog: Promise<CacheRecord[]> | null = null;

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
  catalog ??= readAll();
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

/** Eastern days that have saved odds, newest day first. Does not call the network. */
export async function listSavedOdds(): Promise<SavedOddsDay[]> {
  const byDay = new Map<string, { slates: Map<string, SavedOddsSlate>; props: Set<string> }>();
  for (const record of await readCatalog()) {
    const day = easternDay(record.savedAt);
    if (!day) continue;
    const bucket = byDay.get(day) ?? { slates: new Map(), props: new Set() };
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
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, bucket]) => ({
      day,
      slates: [...bucket.slates.values()].sort((a, b) => a.sport.localeCompare(b.sport)),
      props: bucket.props.size,
    }));
}

async function readFamily(request: string, source: string): Promise<CacheRecord | null> {
  const want = oddsSlateFamily(request);
  let names: string[];
  try {
    names = await readdir(cacheDir());
  } catch {
    return null;
  }
  let best: CacheRecord | null = null;
  let bestSaved = -Infinity;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const hit = await readHit(`${cacheDir()}/${name}`, source);
    if (!hit?.request || oddsSlateFamily(hit.request) !== want) continue;
    const saved = Date.parse(hit.savedAt);
    if (saved <= bestSaved) continue;
    best = hit;
    bestSaved = saved;
  }
  return best;
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
    return { body: hit.body, remaining: null, cached: true, savedAt: hit.savedAt };
  }
  const file = `${cacheDir()}/${identity.hash}.json`;
  if (!cacheBypass()) {
    const hit = await readHit(file, source) ?? await readFamily(identity.request, source);
    if (hit) return { body: hit.body, remaining: null, cached: true, savedAt: hit.savedAt };
  }
  if (options?.cacheOnly) return { body: null, remaining: null, cached: false, savedAt: '', skipped: true };
  if (source === 'fanduel') {
    const body = await fanduelFetch(url);
    const savedAt = new Date().toISOString();
    await store(file, { savedAt, remaining: null, body, request: identity.request, source });
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
  const body = await res.json() as any;
  if (!res.ok) {
    const message = body?.message || body?.error || res.statusText;
    throw new Error(`Odds API ${res.status}: ${message}`);
  }
  const savedAt = new Date().toISOString();
  const remaining = remainingHeader == null || remainingHeader === '' ? null : Number(remainingHeader);
  await store(file, {
    savedAt,
    remaining: Number.isFinite(remaining) ? remaining : null,
    body,
    request: identity.request,
    source: 'the-odds-api',
  });
  return { body, remaining: Number.isFinite(remaining) ? remaining : null, cached: false, savedAt };
}
