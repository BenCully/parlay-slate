import { ncaaLeague } from './ncaa.js';
import { nflLeague } from './nfl.js';
import type { Sport } from '../types.js';

export const football: Sport = {
  label: 'Football',
  kind: 'leagues',
  leagues: [nflLeague, ncaaLeague],
};
