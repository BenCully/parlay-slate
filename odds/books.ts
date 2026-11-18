// Book order for every sport. The first of these that posted the market wins. Anyone else is the fallback.
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
export function postedMarket(books: any[], market: string): { book: string; outcomes: any[] } | null {
  const ordered = [
    ...BOOKS.map((key) => books.find((book) => book?.key === key)).filter(Boolean),
    ...books,
  ];
  for (const book of ordered) {
    const outcomes = book.markets?.find((item: any) => item.key === market)?.outcomes;
    if (outcomes?.length) return { book: bookLabel(book), outcomes };
  }
  return null;
}
