// One JSON line per odds response in gitignored runs/quota.jsonl.
// Eastern time, sport, event id for a prop, cached or live, credits remaining.
// No URL and no key. A write failure does not fail the slate.
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type QuotaSource = 'cached' | 'live';

export type QuotaEntry = {
  time: string;
  zone: 'America/New_York';
  sport: string;
  event?: string;
  source: QuotaSource;
  remaining: number | null;
};

const defaultFile = fileURLToPath(new URL('../runs/quota.jsonl', import.meta.url));

let chain: Promise<void> = Promise.resolve();

/** America/New_York wall time as YYYY-MM-DDTHH:MM:SS. */
export function easternClock(when: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = value('hour') === '24' ? '00' : value('hour');
  return `${value('year')}-${value('month')}-${value('day')}T${hour}:${value('minute')}:${value('second')}`;
}

/** Sport key, plus the event id for a prop request. The request path is not copied into the line. */
export function quotaEntry(request: string, source: QuotaSource, remaining: number | null, when = new Date()): QuotaEntry {
  const path = request.split('?')[0] ?? '';
  const sport = /\/sports\/([^/]+)/.exec(path)?.[1] ?? 'unknown';
  const event = /\/events\/([^/]+)/.exec(path)?.[1];
  return {
    time: easternClock(when),
    zone: 'America/New_York',
    sport,
    ...(event ? { event } : {}),
    source,
    remaining,
  };
}

/** `0` is off. `1` or `true` uses the default file, or `QUOTA_LOG_PATH` when that is set. */
export function quotaLogFile() {
  const flag = process.env.QUOTA_LOG?.trim();
  if (flag === '0') return '';
  const custom = process.env.QUOTA_LOG_PATH?.trim();
  const on = flag === '1' || flag === 'true' || flag == null || flag === '';
  if (!on && flag) return custom || (process.env.NODE_TEST_CONTEXT ? '' : defaultFile);
  if (custom) return custom;
  if (process.env.NODE_TEST_CONTEXT) return '';
  return defaultFile;
}

/** Append one line. QUOTA_LOG=0 turns it off. QUOTA_LOG=1 uses the default file. QUOTA_LOG_PATH picks another file. */
export async function appendQuota(entry: QuotaEntry) {
  const file = quotaLogFile();
  if (!file) return;
  const line = `${JSON.stringify(entry)}\n`;
  const run = chain.then(async () => {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, line);
  }).catch(() => {
    console.error('Quota log was not written.');
  });
  chain = run;
  await run;
}
