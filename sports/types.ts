import type { EvidenceLeg, GameBrief } from '../espn/evidence.js';
import type { PropProfile } from '../props/board.js';
import type { OddsWindow } from '../slate/window.js';

/** One Games board and its Props board. NFL is one of these. Each soccer league is one of these. */
export type BoardSource = {
  /** Odds API sport key, for example americanfootball_nfl. Formula 1 is motorsport_f1. */
  oddsKey: string;
  unit: 'points' | 'goals' | 'runs' | 'places';
  query: string;
  /** Skip Draw and Tie moneylines. Soccer does. NFL does not. */
  threeWay: boolean;
  /** Use the ESPN short name in slips. Soccer does, so City and United do not collide. */
  shortNames: boolean;
  /** One driver price per row. No spread and no total. Formula 1 does this. */
  outright?: boolean;
  /** This board's prices stay on FanDuel when the run uses The Odds API. */
  fanduelNote?: string;
  window: (day: string | undefined) => Promise<OddsWindow>;
  getBrief: (leg: EvidenceLeg) => Promise<GameBrief>;
  /** null means the props tab is a note and makes no Odds API request. */
  profile: PropProfile | null;
  propsNote: string;
};

export type LeagueDef = {
  label: string;
  short?: string;
  source: BoardSource;
};

/** A parent tab. board is one Games and Props pair. leagues is a row of those pairs. */
export type Sport =
  | { label: string; kind: 'board'; source: BoardSource }
  | { label: string; kind: 'leagues'; leagues: LeagueDef[] };
