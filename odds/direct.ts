// Merged read of FanDuel, DraftKings, BetMGM, and Caesars.
// Games match on the two team names and the America/New_York date. A book that throws is left off.
import { betMgmCacheSize, betmgmFetch, resetBetMgm } from './betmgm.js';
import { resetMergedBooks, type OddsEvent } from './cache.js';
import { caesarsFetch } from './caesars.js';
import { draftKingsCacheSize, draftkingsFetch, resetDraftKings } from './draftkings.js';
import { fanduelFetch } from './fanduel.js';
import { easternDay } from '../slate/window.js';

export type BookId = 'fd' | 'dk' | 'mgm' | 'czr';

const READERS = [
  { id: 'fanduel' as const, label: 'FanDuel', run: fanduelFetch },
  { id: 'draftkings' as const, label: 'DraftKings', run: draftkingsFetch },
  { id: 'betmgm' as const, label: 'BetMGM', run: betmgmFetch },
  { id: 'caesars' as const, label: 'Caesars', run: caesarsFetch },
];

const BOOK_ORDER = ['fanduel', 'draftkings', 'betmgm', 'williamhill_us'];

const BOOK_KEY: Record<(typeof READERS)[number]['id'], string> = {
  fanduel: 'fanduel',
  draftkings: 'draftkings',
  betmgm: 'betmgm',
  caesars: 'williamhill_us',
};

const ID_SLOT: Record<string, BookId> = {
  fanduel: 'fd',
  draftkings: 'dk',
  betmgm: 'mgm',
  williamhill_us: 'czr',
};

/** `fd=,dk=,mgm=6:44037,czr=`. The comma is the separator because a BetMGM id contains a colon. */
export function splitBookId(id: string): Record<BookId, string> | null {
  if (!id.includes('fd=') || !id.includes('dk=') || !id.includes('mgm=') || !id.includes('czr=')) return null;
  const out: Record<BookId, string> = { fd: '', dk: '', mgm: '', czr: '' };
  for (const part of id.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index);
    if (key === 'fd' || key === 'dk' || key === 'mgm' || key === 'czr') out[key] = part.slice(index + 1);
  }
  return out;
}

export function compositeId(ids: Partial<Record<BookId, string>>) {
  return `fd=${ids.fd ?? ''},dk=${ids.dk ?? ''},mgm=${ids.mgm ?? ''},czr=${ids.czr ?? ''}`;
}

export function decodedEventId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** One book's event id from a merged prop id. A plain id is returned unchanged. An empty part stays empty. */
export function bookEventId(raw: string, book: BookId): string {
  const parts = splitBookId(decodedEventId(raw));
  if (!parts) return raw;
  return parts[book];
}

function asEvents(body: unknown): OddsEvent[] {
  if (Array.isArray(body)) return body as OddsEvent[];
  if (body && typeof body === 'object') return [body as OddsEvent];
  return [];
}

function matchKey(event: OddsEvent) {
  const day = easternDay(event.commence_time);
  const names = [event.home_team, event.away_team].map((name) => name.toLowerCase()).sort();
  return `${day}|${names[0] ?? ''}|${names[1] ?? ''}`;
}

function hasPrices(event: OddsEvent) {
  return (event.bookmakers ?? []).some((book) => (book.markets ?? []).some((market) => (market.outcomes ?? []).length > 0));
}

function booksInOrder(rows: { source: string; event: OddsEvent }[]) {
  const books = new Map<string, OddsEvent['bookmakers'][number]>();
  const ranked = [...rows].sort((a, b) => BOOK_ORDER.indexOf(a.source) - BOOK_ORDER.indexOf(b.source));
  for (const row of ranked) {
    for (const book of row.event.bookmakers ?? []) {
      if (book?.key && !books.has(book.key)) books.set(book.key, book);
    }
  }
  return {
    ranked,
    bookmakers: BOOK_ORDER.flatMap((key) => {
      const book = books.get(key);
      return book ? [book] : [];
    }),
  };
}

/**
 * One props event. The combined id already says these rows are the same game, so team-name
 * differences stay in one list. A row with no priced market is a placeholder and is left out.
 */
export function mergePropEvent(requestId: string, rows: { source: string; events: OddsEvent[] }[]): OddsEvent {
  const priced = rows.flatMap((row) => row.events.filter(hasPrices).map((event) => ({ source: row.source, event })));
  const { ranked, bookmakers } = booksInOrder(priced);
  const first = ranked[0]?.event;
  if (!first) {
    return {
      id: requestId,
      commence_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      home_team: 'Home',
      away_team: 'Away',
      bookmakers: [],
    };
  }
  return {
    id: requestId,
    commence_time: first.commence_time,
    home_team: first.home_team,
    away_team: first.away_team,
    bookmakers,
  };
}

/** One event per game. Each book keeps its own bookmaker. The id carries every book's event id. */
export function mergeBookEvents(groups: { source: string; events: OddsEvent[] }[]): OddsEvent[] {
  const buckets = new Map<string, { source: string; event: OddsEvent }[]>();
  for (const group of groups) {
    for (const event of group.events) {
      if (!event?.id || !event.home_team || !event.away_team || !event.commence_time) continue;
      const key = matchKey(event);
      const list = buckets.get(key) ?? [];
      list.push({ source: group.source, event });
      buckets.set(key, list);
    }
  }
  const merged: OddsEvent[] = [];
  for (const list of buckets.values()) {
    const ranked = [...list].sort((a, b) => BOOK_ORDER.indexOf(a.source) - BOOK_ORDER.indexOf(b.source));
    const first = ranked[0]?.event;
    if (!first) continue;
    const ids: Partial<Record<BookId, string>> = {};
    for (const row of ranked) {
      const slot = ID_SLOT[row.source];
      if (slot && !ids[slot]) ids[slot] = row.event.id;
    }
    merged.push({
      id: compositeId(ids),
      commence_time: first.commence_time,
      home_team: first.home_team,
      away_team: first.away_team,
      bookmakers: booksInOrder(ranked).bookmakers,
    });
  }
  return merged;
}

export type MergedRead = {
  body: OddsEvent[] | OddsEvent;
  omitted: string[];
  failed: string[];
};

/** In-memory DraftKings and BetMGM reads. FanDuel and Caesars do not keep a price cache. */
export function bookCacheSize() {
  return draftKingsCacheSize() + betMgmCacheSize();
}

/** Drop book reads kept in this process, including the merged-book header flags. */
export function resetBookReads() {
  resetDraftKings();
  resetBetMgm();
  resetMergedBooks();
}

/** FanDuel, DraftKings, BetMGM, and Caesars for one Odds API URL. A thrown book is named and skipped. */
export async function booksFetch(url: string): Promise<MergedRead> {
  const settled = await Promise.all(READERS.map(async (reader) => {
    try {
      const body = await reader.run(url);
      return { source: BOOK_KEY[reader.id], label: reader.label, events: asEvents(body), error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${reader.label} did not answer.`;
      return { source: BOOK_KEY[reader.id], label: reader.label, events: [] as OddsEvent[], error: message };
    }
  }));
  const omitted = settled.filter((row) => row.error).map((row) => `${row.label} did not post this league (${row.error}).`);
  const failed = settled.filter((row) => row.error).map((row) => row.label);
  const rows = settled.filter((row) => !row.error).map((row) => ({ source: row.source, events: row.events }));
  const parsed = new URL(url);
  if (parsed.pathname.includes('/events/')) {
    const requestId = decodedEventId(/\/events\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '');
    return { body: mergePropEvent(requestId, rows), omitted, failed };
  }
  return { body: mergeBookEvents(rows), omitted, failed };
}
