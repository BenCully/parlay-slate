import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeModelName } from '../../decisions/judge.js';
import { oddsSource } from '../../odds/cache.js';

export const ODDS_SOURCES = ['books', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'the-odds-api'] as const;

export type OddsSourceId = (typeof ODDS_SOURCES)[number];

export type TuiAction = 'start' | 'replay' | 'view-last' | 'view-snapshot' | 'compare' | 'list-odds' | 'clear-snapshots';

export type TuiSettings = {
  version: 1;
  action: TuiAction;
  dateMode: 'current' | 'day';
  day?: string;
  model: 'jev' | 'tail-jev';
  oddsSource: OddsSourceId;
  fresh: boolean;
  oddsDay?: string;
  snapshot?: string;
  compareDay?: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set<TuiAction>(['start', 'replay', 'view-last', 'view-snapshot', 'compare', 'list-odds', 'clear-snapshots']);
const WARN = 'Could not read runs/tui-settings.json, using defaults.';

export function defaultSettingsPath() {
  return fileURLToPath(new URL('../../runs/tui-settings.json', import.meta.url));
}

export function isOddsSource(value: string): value is OddsSourceId {
  return (ODDS_SOURCES as readonly string[]).includes(value);
}

export function defaultOddsSource(): OddsSourceId {
  try {
    const value = oddsSource();
    if (isOddsSource(value)) return value;
  } catch {
    return 'books';
  }
  return 'books';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function safeSnapshot(value: string) {
  return value.trim() !== '' && !value.includes('/') && !value.includes('\\') && !value.includes('..');
}

/** Known v1 fields. Unknown keys are ignored. A version above 1 still reads these fields. */
export function parseSettings(value: unknown, fallbackSource: OddsSourceId): TuiSettings {
  const raw = isRecord(value) ? value : {};
  const action = typeof raw.action === 'string' && ACTIONS.has(raw.action as TuiAction) ? raw.action as TuiAction : 'start';
  const dateMode = raw.dateMode === 'day' ? 'day' : 'current';
  const model = typeof raw.model === 'string' ? normalizeModelName(raw.model) ?? 'jev' : 'jev';
  const source = typeof raw.oddsSource === 'string' && isOddsSource(raw.oddsSource) ? raw.oddsSource : fallbackSource;
  const settings: TuiSettings = {
    version: 1,
    action,
    dateMode,
    model,
    oddsSource: source,
    fresh: raw.fresh === true,
  };
  if (typeof raw.day === 'string' && DAY.test(raw.day)) settings.day = raw.day;
  if (typeof raw.oddsDay === 'string' && DAY.test(raw.oddsDay)) settings.oddsDay = raw.oddsDay;
  if (typeof raw.compareDay === 'string' && DAY.test(raw.compareDay)) settings.compareDay = raw.compareDay;
  if (typeof raw.snapshot === 'string' && safeSnapshot(raw.snapshot)) settings.snapshot = raw.snapshot;
  return settings;
}

function stored(settings: TuiSettings) {
  return {
    version: 1 as const,
    action: settings.action,
    dateMode: settings.dateMode,
    ...(settings.day ? { day: settings.day } : {}),
    model: settings.model,
    oddsSource: settings.oddsSource,
    fresh: settings.fresh,
    ...(settings.oddsDay ? { oddsDay: settings.oddsDay } : {}),
    ...(settings.snapshot ? { snapshot: settings.snapshot } : {}),
    ...(settings.compareDay ? { compareDay: settings.compareDay } : {}),
  };
}

export async function loadTuiSettings(file = defaultSettingsPath()): Promise<{ settings: TuiSettings; warning?: string }> {
  const fallback = defaultOddsSource();
  try {
    const text = await readFile(file, 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return invalid(fallback);
    }
    if (!isRecord(value)) return invalid(fallback);
    return { settings: parseSettings(value, fallback) };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT') return { settings: parseSettings({}, fallback) };
    return invalid(fallback);
  }
}

function invalid(fallback: OddsSourceId) {
  console.error(WARN);
  return { settings: parseSettings({}, fallback), warning: WARN };
}

export async function saveTuiSettings(settings: TuiSettings, file = defaultSettingsPath()) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(stored(settings), null, 2)}\n`);
  await rename(temp, file);
}
