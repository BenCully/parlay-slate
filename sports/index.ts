import { football } from './football/index.js';
import { soccer } from './soccer/index.js';
import type { Sport } from './types.js';

export type { BoardSource, LeagueDef, Sport } from './types.js';

/** Parent tabs, in screen order. Append a sport here to add one. */
export const SPORTS: Sport[] = [football, soccer];
