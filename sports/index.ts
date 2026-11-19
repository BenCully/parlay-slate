import { baseball } from './baseball/index.js';
import { basketball } from './basketball/index.js';
import { football } from './football/index.js';
import { formula1 } from './formula1/index.js';
import { hockey } from './hockey/index.js';
import { soccer } from './soccer/index.js';
import type { Sport } from './types.js';

export type { BoardSource, LeagueDef, Sport } from './types.js';

/** Parent tabs, in screen order. Append a sport here to add one. */
export const SPORTS: Sport[] = [football, soccer, hockey, basketball, baseball, formula1];
