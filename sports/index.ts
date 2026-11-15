import { nfl } from './nfl.js';
import { soccer } from './soccer.js';
import type { Sport } from './types.js';

export type { BoardSource, LeagueDef, Sport } from './types.js';

/** Parent tabs, in screen order. Append a sport here to add one. */
export const SPORTS: Sport[] = [nfl, soccer];
