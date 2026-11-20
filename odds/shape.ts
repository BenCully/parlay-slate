// The event shape parseOddsBody already accepts. Extra fields are dropped by that parser.
import { oddsStamp } from '../slate/window.js';

export type Outcome = {
  name: string;
  price: number;
  point?: number;
  description?: string;
};

export type Market = {
  key: string;
  outcomes: Outcome[];
};

export function bookEvent(id: string, commence: string, home: string, away: string, bookKey: string, markets: Market[]) {
  const now = new Date().toISOString();
  const kept = markets.filter((market) => market.outcomes.length > 0);
  return {
    id,
    commence_time: oddsStamp(commence),
    home_team: home,
    away_team: away,
    bookmakers: [{
      key: bookKey,
      last_update: now,
      markets: kept.map((market) => ({ key: market.key, last_update: now, outcomes: market.outcomes })),
    }],
  };
}

export function outcome(name: string, price: number, point?: number | null, description?: string): Outcome {
  const row: Outcome = { name, price };
  if (point != null && Number.isFinite(point)) row.point = point;
  if (description) row.description = description;
  return row;
}
