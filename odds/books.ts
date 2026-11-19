// Book order for every sport. The first of these that posted the market wins. Anyone else is the fallback.
import type { OddsBook, OddsOutcome } from './cache.js';

export const BOOKS = ['fanduel', 'draftkings', 'betmgm', 'williamhill_us'];

const LABELS: Record<string, string> = {
  fanduel: 'FanDuel',
  draftkings: 'DraftKings',
  betmgm: 'BetMGM',
  williamhill_us: 'Caesars',
};

/** Name used in a row comment. Known books keep one spelling. Anyone else uses the title, then the key. */
export function bookLabel(book: { key?: string; title?: string }) {
  const key = String(book.key ?? '');
  if (LABELS[key]) return LABELS[key];
  const title = String(book.title ?? '').trim();
  if (title) return title;
  return key || 'the book';
}

/** The first book in BOOKS that posted this market, or the first other book that did. */
export function postedMarket(books: OddsBook[], market: string): { book: string; outcomes: OddsOutcome[] } | null {
  const preferred: OddsBook[] = [];
  for (const key of BOOKS) {
    const book = books.find((item) => item.key === key);
    if (book) preferred.push(book);
  }
  for (const book of [...preferred, ...books]) {
    const outcomes = book.markets.find((item) => item.key === market)?.outcomes;
    if (outcomes?.length) return { book: bookLabel(book), outcomes };
  }
  return null;
}
