import { injuryFor, teamAbbr, getBrief } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { LeagueDef } from '../types.js';
import { easternRange, oddsStamp, scoreboardEvents, todayEastern, type OddsWindow } from '../../slate/window.js';
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

async function windowFor(day: string | undefined): Promise<OddsWindow> {
  if (day) {
    const range = easternRange(day);
    return { ...range, label: `NFL ${day} (Eastern)` };
  }
  const { board, stamps } = await scoreboardEvents(SCOREBOARD, (status) => `ESPN scoreboard returned ${status}`);
  if (!stamps.length) return windowFor(todayEastern());
  const week = board.week?.number;
  return {
    from: oddsStamp(new Date(Math.min(...stamps) - 60 * 60 * 1000).toISOString()),
    to: oddsStamp(new Date(Math.max(...stamps) + 6 * 60 * 60 * 1000).toISOString()),
    label: week ? `NFL week ${week}` : 'NFL current week',
  };
}

export const nflLeague: LeagueDef = {
  label: 'NFL',
  short: 'NFL',
  source: {
    oddsKey: 'americanfootball_nfl',
    unit: 'points',
    query: 'Which NFL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: windowFor,
    getBrief,
    profile,
    propsNote: '',
  },
};
