import { injuryFor, teamAbbr, getBrief } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { LeagueDef } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';
import { footballProfile } from './props.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const players = createPlayers({
  rosterBase: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes',
  teamPath: async (name) => {
    const abbr = await teamAbbr(name);
    return abbr ? abbr.toLowerCase() : null;
  },
  seasonLabel: '2026 regular-season',
});

const profile = footballProfile('americanfootball_nfl', {
  loadRosters: players.loadRosters,
  injuryFor,
  recentStat: players.recentStat,
});

export const nflLeague: LeagueDef = {
  label: 'NFL',
  short: 'NFL',
  source: {
    oddsKey: 'americanfootball_nfl',
    unit: 'points',
    query: 'Which NFL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: (day) => upcomingWindow(SCOREBOARD, 'NFL', day, (status) => `ESPN scoreboard returned ${status}`, {
      datedEmpty: true,
      label: (board) => (board.week?.number ? `NFL week ${board.week.number}` : 'NFL current week'),
    }),
    getBrief,
    profile,
    propsNote: '',
  },
};
