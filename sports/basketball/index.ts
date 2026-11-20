import { createEvidence, BASKETBALL_EVIDENCE, nameKey } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { PropProfile } from '../../props/board.js';
import type { LeagueDef, Sport } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const SCOREBOARD = `${BASE}/scoreboard`;

const evidence = createEvidence(BASE, BASKETBALL_EVIDENCE);
const players = createPlayers({
  rosterBase: BASE,
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes',
  teamPath: evidence.teamPath,
  seasonLabel: '2026-27 season',
});

type ExtraOption = {
  market: string;
  side: 'Over' | 'Under' | 'Yes';
  posted: { point: number | null };
  ref: { name: string; pos: string };
};

export function realExtra(option: ExtraOption) {
  const point = option.posted.point ?? 0;
  if (option.market !== 'player_blocks' && option.market !== 'player_steals') return false;
  if (option.side === 'Under') return false;
  return point >= 0.5;
}

function featureExtra(option: { ref: { name: string } }, featured: Set<string>) {
  return featured.has(nameKey(option.ref.name));
}

const profile: PropProfile = {
  sport: 'basketball_nba',
  markets: [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_threes',
    'player_blocks',
    'player_steals',
  ],
  core: [
    { market: 'player_points', label: 'Points', phrase: 'points', stat: 'points' },
    { market: 'player_rebounds', label: 'Rebounds', phrase: 'rebounds', stat: 'totalRebounds' },
    { market: 'player_assists', label: 'Assists', phrase: 'assists', stat: 'assists' },
    { market: 'player_threes', label: 'Threes', phrase: 'threes', stat: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted' },
  ],
  extra: [
    { market: 'player_blocks', label: 'Blocks', phrase: 'blocks', stat: 'blocks' },
    { market: 'player_steals', label: 'Steals', phrase: 'steals', stat: 'steals' },
  ],
  title: 'Player props for every team still to play. The last row on each team is a likely extra stat.',
  note: 'Each team has points, rebounds, assists, and threes. The last row is blocks or steals, chosen from the short prices and kept on a player already in that team block. It skips a tiny under such as a backup staying under 0.5 blocks. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.',
  logLabel: 'NBA',
  allowOneSide: true,
  loadRosters: players.loadRosters,
  injuryFor: evidence.injuryFor,
  recentStat: players.recentStat,
  realExtra,
  featureExtra,
};

export const nbaLeague: LeagueDef = {
  label: 'NBA',
  short: 'NBA',
  source: {
    oddsKey: 'basketball_nba',
    unit: 'points',
    query: 'Which NBA team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: (day) => upcomingWindow(SCOREBOARD, 'NBA', day, (status) => `ESPN NBA scoreboard returned ${status}`),
    getBrief: evidence.getBrief,
    profile,
    propsNote: '',
  },
};

export const basketball: Sport = {
  label: 'Basketball',
  kind: 'leagues',
  leagues: [nbaLeague],
};
