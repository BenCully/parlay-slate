import { createEvidence, HOCKEY_EVIDENCE, nameKey } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { PropProfile } from '../../props/board.js';
import type { LeagueDef, Sport } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
const SCOREBOARD = `${BASE}/scoreboard`;

const evidence = createEvidence(BASE, HOCKEY_EVIDENCE);
const players = createPlayers({
  rosterBase: BASE,
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes',
  teamPath: evidence.teamPath,
  seasonLabel: '2026-27 season',
});

const goalYes = {
  slip: (who: string, price: string) => `Take ${who} anytime goal ${price}`,
  thing: 'anytime goal',
  claim: (player: string, opponent: string, when: string) => `${player} scores a goal against ${opponent} on ${when}.`,
};

type ExtraOption = {
  market: string;
  side: 'Over' | 'Under' | 'Yes';
  posted: { point: number | null };
  ref: { name: string; pos: string };
};

export function realExtra(option: ExtraOption) {
  const point = option.posted.point ?? 0;
  if (option.market === 'player_total_saves') return point >= 18.5;
  if (option.market === 'player_power_play_points') return option.side === 'Over' && point >= 0.5;
  return false;
}

function featureExtra(option: { market: string; ref: { name: string; pos: string } }, featured: Set<string>) {
  if (featured.has(nameKey(option.ref.name))) return true;
  return option.ref.pos === 'G' && option.market === 'player_total_saves';
}

const profile: PropProfile = {
  sport: 'icehockey_nhl',
  markets: [
    'player_goal_scorer_anytime',
    'player_points',
    'player_shots_on_goal',
    'player_assists',
    'player_total_saves',
    'player_power_play_points',
  ],
  core: [
    { market: 'player_goal_scorer_anytime', label: 'Anytime goal', phrase: 'goals', stat: 'goals', yes: goalYes },
    { market: 'player_points', label: 'Points', phrase: 'points', stat: 'points' },
    { market: 'player_shots_on_goal', label: 'Shots', phrase: 'shots on goal', stat: 'shotsTotal' },
    { market: 'player_assists', label: 'Assists', phrase: 'assists', stat: 'assists' },
  ],
  extra: [
    { market: 'player_total_saves', label: 'Saves', phrase: 'saves', stat: 'saves' },
    { market: 'player_power_play_points', label: 'PP points', phrase: 'power-play points', stat: 'powerPlayPoints' },
  ],
  title: 'Player props for every team still to play. The last row on each team is a likely extra stat.',
  note: 'Each team has an anytime goal, points, shots on goal, and assists. The last row is goalie saves or power-play points, chosen from the short prices and kept on a player already in that team block, or the goalie. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.',
  logLabel: 'NHL',
  allowOneSide: true,
  loadRosters: players.loadRosters,
  injuryFor: evidence.injuryFor,
  recentStat: players.recentStat,
  realExtra,
  featureExtra,
};

export const nhlLeague: LeagueDef = {
  label: 'NHL',
  short: 'NHL',
  source: {
    oddsKey: 'icehockey_nhl',
    unit: 'goals',
    query: 'Which NHL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: (day) => upcomingWindow(SCOREBOARD, 'NHL', day, (status) => `ESPN NHL scoreboard returned ${status}`),
    getBrief: evidence.getBrief,
    profile,
    propsNote: '',
  },
};

export const hockey: Sport = {
  label: 'Hockey',
  kind: 'leagues',
  leagues: [nhlLeague],
};
