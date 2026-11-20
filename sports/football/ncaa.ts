import { createEvidence, NCAA_EVIDENCE } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { LeagueDef } from '../types.js';
import { footballProfile } from './props.js';
import { upcomingWindow } from '../../slate/window.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const SCOREBOARD = `${BASE}/scoreboard`;

const evidence = createEvidence(BASE, NCAA_EVIDENCE);
const players = createPlayers({
  rosterBase: BASE,
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes',
  teamPath: async (name) => {
    const abbr = await evidence.teamAbbr(name);
    return abbr ? abbr.toLowerCase() : null;
  },
  seasonLabel: '2026 season',
});

const profile = footballProfile('americanfootball_ncaaf', {
  loadRosters: players.loadRosters,
  injuryFor: evidence.injuryFor,
  recentStat: players.recentStat,
  teamShort: evidence.teamShort,
});

export const ncaaLeague: LeagueDef = {
  label: 'NCAA',
  short: 'NCAA',
  source: {
    oddsKey: 'americanfootball_ncaaf',
    unit: 'points',
    query: 'Which college football team is very likely to win this game?',
    threeWay: false,
    shortNames: true,
    window: (day) => upcomingWindow(SCOREBOARD, 'NCAA', day, (status) => `ESPN college football scoreboard returned ${status}`, {
      datedEmpty: true,
      label: (board) => (board.week?.number ? `NCAA week ${board.week.number}` : 'NCAA current week'),
    }),
    getBrief: evidence.getBrief,
    profile,
    propsNote: '',
  },
};
