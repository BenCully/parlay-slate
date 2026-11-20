// Pair the two sides of a ladder, then keep the pair closest to even.
// The score lives in pickBalanced. Do not copy it.
import { pickBalanced, type LineQuote } from './fanduel.js';

export type PricedSide = { name: string; price: number; point: number };

/** Opposite signs at the same absolute point. A point with two pairs is scored twice. */
export function balancedSpreads(rows: PricedSide[]): LineQuote[] {
  const groups = new Map<string, { plus: PricedSide[]; minus: PricedSide[] }>();
  for (const row of rows) {
    if (!Number.isFinite(row.point) || !Number.isFinite(row.price)) continue;
    const key = Math.abs(row.point).toFixed(4);
    const bucket = groups.get(key) ?? { plus: [], minus: [] };
    if (row.point < 0) bucket.minus.push(row);
    else bucket.plus.push(row);
    groups.set(key, bucket);
  }
  const pairs: LineQuote[][] = [];
  for (const bucket of groups.values()) {
    const count = Math.min(bucket.plus.length, bucket.minus.length);
    for (let index = 0; index < count; index += 1) {
      const left = bucket.plus[index];
      const right = bucket.minus[index];
      if (!left || !right) continue;
      pairs.push([
        { label: left.name, price: left.price, point: left.point },
        { label: right.name, price: right.price, point: right.point },
      ]);
    }
  }
  return pickBalanced(pairs);
}

/** One Over and one Under at the same point. The closest pair to even is kept. */
export function balancedTotals(rows: { side: 'Over' | 'Under'; price: number; point: number }[]): LineQuote[] {
  const groups = new Map<string, { overs: typeof rows; unders: typeof rows }>();
  for (const row of rows) {
    if (!Number.isFinite(row.point) || !Number.isFinite(row.price)) continue;
    const key = row.point.toFixed(4);
    const bucket = groups.get(key) ?? { overs: [], unders: [] };
    if (row.side === 'Over') bucket.overs.push(row);
    else bucket.unders.push(row);
    groups.set(key, bucket);
  }
  const pairs: LineQuote[][] = [];
  for (const bucket of groups.values()) {
    const count = Math.min(bucket.overs.length, bucket.unders.length);
    for (let index = 0; index < count; index += 1) {
      const over = bucket.overs[index];
      const under = bucket.unders[index];
      if (!over || !under) continue;
      pairs.push([
        { label: 'Over', price: over.price, point: over.point },
        { label: 'Under', price: under.price, point: under.point },
      ]);
    }
  }
  return pickBalanced(pairs);
}
