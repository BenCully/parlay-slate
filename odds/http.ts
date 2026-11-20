// Shared HTTP for the direct sportsbook clients. Illinois only.
// A network failure before any response is retried once. A priced response is not retried.
// Errors name the book and the status. They do not include the request URL.

export const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const DIRECT_TIMEOUT_MS = 30_000;

export class BookError extends Error {
  readonly status: number | null;
  readonly answered: boolean;

  constructor(book: string, status: number | null, answered: boolean) {
    super(status == null ? `${book} did not answer.` : `${book} ${status}`);
    this.name = 'BookError';
    this.status = status;
    this.answered = answered;
  }
}

/** American price. A unicode minus (U+2212) counts as a hyphen. A plus sign is dropped. */
export function americanPrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/\u2212/g, '-').replace(/^\+/, '');
  if (!text || text === '-') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

/** True when a kickoff is inside the Odds API window. An empty bound does not limit that side. */
export function inWindow(iso: string, from: string, to: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return false;
  if (from && time < Date.parse(from)) return false;
  if (to && time > Date.parse(to)) return false;
  return true;
}

/** DraftKings stamps fractional seconds with more than three digits. oddsStamp needs three or none. */
export function trimStamp(iso: string) {
  return iso.replace(/(\.\d{3})\d+(?=Z$)/, '$1');
}

export function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && 'value' in value) return textValue((value as { value: unknown }).value);
  return '';
}

export async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

async function once(url: string, headers: Record<string, string>, book: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS) });
  } catch {
    throw new BookError(book, null, false);
  }
  if (!res.ok) throw new BookError(book, res.status, true);
  try {
    return await res.json() as unknown;
  } catch {
    throw new BookError(book, res.status, true);
  }
}

/** GET JSON. One retry when the network fails before a response. */
export async function fetchJson(url: string, headers: Record<string, string>, book: string): Promise<unknown> {
  try {
    return await once(url, headers, book);
  } catch (error) {
    if (!(error instanceof BookError) || error.answered) throw error;
    return once(url, headers, book);
  }
}
