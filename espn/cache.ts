// Same-day file cache for ESPN pages. Injuries stay fresh for 3 hours. Other pages stay fresh for 18.
// A page from a previous Eastern day is a miss even inside those hours. The scoreboard is not cached.
// Failures are not stored. site.api.espn.com and site.web.api.espn.com are the only hosts.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { easternDay } from '../slate/window.js';

export const ESPN_INJURY_HOURS = 3;
export const ESPN_DAY_HOURS = 18;

const HOSTS = new Set(['site.api.espn.com', 'site.web.api.espn.com']);

export type EspnCacheKind = 'injury' | 'day';

type EspnRecord = {
  savedAt: string;
  body: unknown;
};

function cacheDir() {
  return process.env.ESPN_CACHE_DIR || fileURLToPath(new URL('../espn-cache/', import.meta.url));
}

function espnHost(url: string) {
  try {
    return HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function cacheFile(url: string) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 20);
  return `${cacheDir()}/${hash}.json`;
}

/** True when the page was saved today (Eastern) and is still inside its hour limit. */
export function espnCacheFresh(savedAt: string, kind: EspnCacheKind, now = Date.now()) {
  const saved = Date.parse(savedAt);
  if (!Number.isFinite(saved) || saved > now) return false;
  if (easternDay(saved) !== easternDay(now)) return false;
  const hours = kind === 'injury' ? ESPN_INJURY_HOURS : ESPN_DAY_HOURS;
  return now - saved < hours * 3_600_000;
}

/** The cached JSON, or undefined on a miss, a stale file, or a host this cache does not keep. */
export async function readEspnCache(url: string, kind: EspnCacheKind): Promise<unknown | undefined> {
  if (!espnHost(url)) return undefined;
  let record: EspnRecord;
  try {
    record = JSON.parse(await readFile(cacheFile(url), 'utf8')) as EspnRecord;
  } catch {
    return undefined;
  }
  if (!record || !espnCacheFresh(record.savedAt, kind)) return undefined;
  return record.body;
}

/** Store one successful ESPN body. A write failure leaves the caller with the live body. */
export async function writeEspnCache(url: string, body: unknown, savedAt = new Date().toISOString()) {
  if (!espnHost(url) || body == null) return;
  const file = cacheFile(url);
  try {
    await mkdir(cacheDir(), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify({ savedAt, body })}\n`);
    await rename(temp, file);
  } catch {
    console.error('ESPN cache was not written.');
  }
}
