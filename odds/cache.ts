// Disk cache for The Odds API. The key is the request path with apiKey removed.
// A hit does not call the network and does not spend a credit.
// A slate whose kickoff window moved still counts as a hit until ODDS_CACHE_HOURS.
// ODDS_CACHE_HOURS, ODDS_CACHE, and ODDS_CACHE_DIR come from .env.settings.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_HOURS = 24 * 7;

type CacheRecord = {
  savedAt: string;
  remaining: number | null;
  body: unknown;
  request: string;
};

export type OddsResponse = {
  body: any;
  remaining: number | null;
  cached: boolean;
  savedAt: string;
};

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
function slateFamily(request: string) {
  const parsed = new URL(request, 'https://api.the-odds-api.com');
  parsed.searchParams.delete('commenceTimeFrom');
  parsed.searchParams.delete('commenceTimeTo');
  parsed.searchParams.sort();
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

async function readHit(file: string): Promise<CacheRecord | null> {
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
  return record;
}

async function readFamily(request: string): Promise<CacheRecord | null> {
  const want = slateFamily(request);
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
    const hit = await readHit(`${cacheDir()}/${name}`);
    if (!hit?.request || slateFamily(hit.request) !== want) continue;
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

export async function oddsGet(url: string, init?: RequestInit): Promise<OddsResponse> {
  const identity = oddsRequestKey(url);
  const file = `${cacheDir()}/${identity.hash}.json`;
  if (!cacheBypass()) {
    const hit = await readHit(file) ?? await readFamily(identity.request);
    if (hit) return { body: hit.body, remaining: null, cached: true, savedAt: hit.savedAt };
  }
  const res = await fetch(url, init);
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
  });
  return { body, remaining: Number.isFinite(remaining) ? remaining : null, cached: false, savedAt };
}
