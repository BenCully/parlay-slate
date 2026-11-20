// Pair the two sides of a ladder, then keep the pair closest to even.
// The score lives in pickBalanced. Do not copy it.
import { pickBalanced, type LineQuote } from './fanduel.js';

export type PricedSide = { name: string; price: number; point: number };

/** Pair each side with the other team's opposite number. Pick'em is 0 against 0. A team is not paired with itself. */
export function balancedSpreads(rows: PricedSide[]): LineQuote[] {
  const pairs: LineQuote[][] = [];
  const used = new Set<number>();
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];
    if (!left || used.has(leftIndex) || !Number.isFinite(left.point) || !Number.isFinite(left.price)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex];
      if (!right || used.has(rightIndex) || !Number.isFinite(right.point) || !Number.isFinite(right.price)) continue;
      if (left.name === right.name) continue;
      const opposite = left.point === 0 ? right.point === 0 : Object.is(right.point, -left.point);
      if (!opposite) continue;
      used.add(leftIndex);
      used.add(rightIndex);
      const pair = [
        { label: left.name, price: left.price, point: left.point },
        { label: right.name, price: right.price, point: right.point },
      ];
      if (pair[0].point < pair[1].point) pair.reverse();
      pairs.push(pair);
      break;
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
