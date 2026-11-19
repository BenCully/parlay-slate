import type { LeagueDef, Sport } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';
import { getBrief } from './brief.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';

const propsNote = 'Formula 1 has no player props. The Games tab is each driver FanDuel prices at 60% or better. A driver keeps the race win when that price clears 0.60, otherwise a top-2 finish, otherwise a podium. Qualifying, fastest lap, top 10, and team markets stay off this slate.';

export const f1League: LeagueDef = {
  label: 'F1',
  short: 'F1',
  source: {
    oddsKey: 'motorsport_f1',
    unit: 'places',
    query: 'Which Formula 1 driver is very likely to win the race, finish top 2, or finish on the podium?',
    threeWay: false,
    shortNames: true,
    outright: true,
    fanduelNote: 'Formula 1 prices come from FanDuel.',
    window: (day) => upcomingWindow(SCOREBOARD, 'Formula 1', day, (status) => `ESPN Formula 1 scoreboard returned ${status}`),
    getBrief,
    profile: null,
    propsNote,
  },
};

export const formula1: Sport = {
  label: 'Formula 1',
  kind: 'leagues',
  leagues: [f1League],
};
