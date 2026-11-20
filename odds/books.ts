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

function marketReady(market: string, outcomes: OddsOutcome[], threeWay: boolean) {
  if (market === 'h2h') return outcomes.length >= (threeWay ? 3 : 2);
  if (market === 'spreads') return outcomes.length >= 2;
  if (market === 'totals') {
    const names = new Set(outcomes.map((outcome) => outcome.name));
    return names.has('Over') && names.has('Under');
  }
  return outcomes.length > 0;
}

/** The first book in BOOKS that posted a complete market, or the first other book that did. */
export function postedMarket(
  books: OddsBook[],
  market: string,
  options?: { threeWay?: boolean },
): { book: string; outcomes: OddsOutcome[] } | null {
  const preferred: OddsBook[] = [];
  for (const key of BOOKS) {
    const book = books.find((item) => item.key === key);
    if (book) preferred.push(book);
  }
  for (const book of [...preferred, ...books]) {
    const outcomes = book.markets.find((item) => item.key === market)?.outcomes;
    if (outcomes?.length && marketReady(market, outcomes, Boolean(options?.threeWay))) {
      return { book: bookLabel(book), outcomes };
    }
  }
  return null;
}
