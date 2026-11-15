import { createEvidence, NCAA_EVIDENCE } from '../evidence.js';
import { createPlayers } from '../players.js';
import type { LeagueDef } from './types.js';
import { footballProfile } from './nfl.js';
import { easternRange, oddsStamp, scoreboardEvents, todayEastern, type OddsWindow } from '../window.js';

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

async function windowFor(day: string | undefined): Promise<OddsWindow> {
  if (day) {
    const range = easternRange(day);
    return { ...range, label: `NCAA ${day} (Eastern)` };
  }
  const { board, stamps } = await scoreboardEvents(SCOREBOARD, (status) => `ESPN college football scoreboard returned ${status}`);
  if (!stamps.length) return windowFor(todayEastern());
  const week = board.week?.number;
  return {
    from: oddsStamp(new Date(Math.min(...stamps) - 60 * 60 * 1000).toISOString()),
    to: oddsStamp(new Date(Math.max(...stamps) + 6 * 60 * 60 * 1000).toISOString()),
    label: week ? `NCAA week ${week}` : 'NCAA current week',
  };
}

export const ncaaLeague: LeagueDef = {
  label: 'NCAA',
  short: 'NCAA',
  source: {
    oddsKey: 'americanfootball_ncaaf',
    unit: 'points',
    query: 'Which college football team is very likely to win this game?',
    threeWay: false,
    shortNames: true,
    window: windowFor,
    getBrief: evidence.getBrief,
    profile,
    propsNote: '',
  },
};
