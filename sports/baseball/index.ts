import { createEvidence, BASEBALL_EVIDENCE, nameKey } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { PropProfile } from '../../props/board.js';
import type { LeagueDef, Sport } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';
const SCOREBOARD = `${BASE}/scoreboard`;

const evidence = createEvidence(BASE, BASEBALL_EVIDENCE);
const players = createPlayers({
  rosterBase: BASE,
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes',
  teamPath: evidence.teamPath,
  seasonLabel: '2026 season',
});

type ExtraOption = {
  market: string;
  side: 'Over' | 'Under' | 'Yes';
  posted: { point: number | null };
  ref: { name: string; pos: string };
};

export function realExtra(option: ExtraOption) {
  const point = option.posted.point ?? 0;
  if (option.market === 'batter_stolen_bases') return option.side === 'Over' && point >= 0.5;
  if (option.market !== 'batter_total_bases') return false;
  return option.side === 'Over' ? point >= 0.5 : point >= 1.5;
}

function featureExtra(option: { ref: { name: string } }, featured: Set<string>) {
  return featured.has(nameKey(option.ref.name));
}

const profile: PropProfile = {
  sport: 'baseball_mlb',
  markets: [
    'batter_hits',
    'batter_home_runs',
    'batter_rbis',
    'pitcher_strikeouts',
    'batter_total_bases',
    'batter_stolen_bases',
  ],
  core: [
    { market: 'batter_hits', label: 'Hits', phrase: 'hits', stat: 'hits' },
    { market: 'batter_home_runs', label: 'Home runs', phrase: 'home runs', stat: 'homeRuns' },
    { market: 'batter_rbis', label: 'RBIs', phrase: 'RBIs', stat: 'RBIs' },
    { market: 'pitcher_strikeouts', label: 'Strikeouts', phrase: 'strikeouts', stat: 'strikeouts' },
  ],
  extra: [
    { market: 'batter_total_bases', label: 'Total bases', phrase: 'total bases', stat: 'totalBases' },
    { market: 'batter_stolen_bases', label: 'Steals', phrase: 'stolen bases', stat: 'stolenBases' },
  ],
  title: 'Player props for every team still to play. The last row on each team is a likely extra stat.',
  note: 'Each team has hits, home runs, RBIs, and pitcher strikeouts. The last row is total bases or stolen bases, chosen from the short prices and kept on a player already in that team block. It skips a tiny under such as a bench player staying under 0.5 stolen bases. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.',
  logLabel: 'MLB',
  allowOneSide: true,
  teamShort: evidence.teamShort,
  loadRosters: players.loadRosters,
  injuryFor: evidence.injuryFor,
  recentStat: players.recentStat,
  realExtra,
  featureExtra,
};

export const mlbLeague: LeagueDef = {
  label: 'MLB',
  short: 'MLB',
  source: {
    oddsKey: 'baseball_mlb',
    unit: 'runs',
    query: 'Which MLB team is very likely to win this game?',
    threeWay: false,
    shortNames: true,
    window: (day) => upcomingWindow(SCOREBOARD, 'MLB', day, (status) => `ESPN MLB scoreboard returned ${status}`),
    getBrief: evidence.getBrief,
    profile,
    propsNote: '',
  },
};

export const baseball: Sport = {
  label: 'Baseball',
  kind: 'leagues',
  leagues: [mlbLeague],
};
