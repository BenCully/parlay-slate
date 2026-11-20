import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeModelName, readStartArgs } from '../../decisions/judge.js';
import { listSavedOdds, oddsReplayCommand, oddsSourceLabel, type SavedOddsDay } from '../../odds/cache.js';
import { todayEastern } from '../../slate/window.js';
import { missingSlateLines, slateFile } from '../../scripts/view.js';
import {
  defaultOddsSource,
  isOddsSource,
  type OddsSourceId,
  type TuiAction,
  type TuiSettings,
} from './settings.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const SOURCE_LABELS: Record<OddsSourceId, string> = {
  books: 'All books',
  fanduel: 'FanDuel',
  draftkings: 'DraftKings',
  betmgm: 'BetMGM',
  caesars: 'Caesars',
  'the-odds-api': 'The Odds API',
};

export const SOURCE_ORDER: OddsSourceId[] = ['books', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'the-odds-api'];

export type SlateForm = {
  action: TuiAction;
  dateMode: 'current' | 'day';
  day: string;
  model: 'jev' | 'tail-jev';
  oddsSource: OddsSourceId;
  fresh: boolean;
  oddsDay: string;
  snapshot: string;
  compareDay: string;
};

export type OddsChoice = { day: string; source: string; label: string };

export type FormContext = {
  envSource: string;
  oddsDays: OddsChoice[];
  snapshots: string[];
  compareDays: string[];
  today: string;
  lastRun: boolean;
  lastRunPath: string;
  oddsLines: string[];
};

export function defaultForm(today: string, source: OddsSourceId): SlateForm {
  return {
    action: 'start',
    dateMode: 'current',
    day: today,
    model: 'jev',
    oddsSource: source,
    fresh: false,
    oddsDay: '',
    snapshot: '',
    compareDay: '',
  };
}

export function formFromSettings(settings: TuiSettings, today: string): SlateForm {
  const saved = settings.day ?? '';
  const dayOk = DAY.test(saved) && saved >= today;
  return {
    action: settings.action,
    dateMode: dayOk ? settings.dateMode : 'current',
    day: dayOk ? saved : today,
    model: settings.model,
    oddsSource: settings.oddsSource,
    fresh: settings.fresh,
    oddsDay: settings.oddsDay ?? '',
    snapshot: settings.snapshot ?? '',
    compareDay: settings.compareDay ?? '',
  };
}

export function settingsFromForm(form: SlateForm): TuiSettings {
  return {
    version: 1,
    action: form.action,
    dateMode: form.dateMode,
    ...(DAY.test(form.day) ? { day: form.day } : {}),
    model: form.model,
    oddsSource: form.oddsSource,
    fresh: form.action === 'start' && form.fresh,
    ...(DAY.test(form.oddsDay) ? { oddsDay: form.oddsDay } : {}),
    ...(form.snapshot ? { snapshot: form.snapshot } : {}),
    ...(DAY.test(form.compareDay) ? { compareDay: form.compareDay } : {}),
  };
}

export function savesSettings(action: TuiAction) {
  return action === 'start' || action === 'replay' || action === 'view-last' || action === 'view-snapshot' || action === 'compare';
}

/** A `.json` argument is a one-off slate file, same as `npm run view -- file.json`. */
export function isViewFile(snapshot: string) {
  return snapshot.endsWith('.json');
}

/** Skip the settings file when the snapshot is a path, so a one-off view does not replace the saved name. */
export function persistsForm(form: SlateForm) {
  if (!savesSettings(form.action)) return false;
  if (form.action === 'view-snapshot' && isViewFile(form.snapshot)) return false;
  return true;
}

export function keyStatus(model: 'jev' | 'tail-jev') {
  if (model === 'jev') {
    return process.env.TYPESAFE_API_KEY?.trim()
      ? 'Keys: TYPESAFE_API_KEY ok.'
      : 'Set TYPESAFE_API_KEY in .env before a Jev run.';
  }
  const missing = [
    !process.env.AUTOJEV_URL?.trim() ? 'AUTOJEV_URL' : '',
    !process.env.AUTOJEV_API_KEY?.trim() ? 'AUTOJEV_API_KEY' : '',
  ].filter(Boolean);
  if (!missing.length) return 'Keys: AUTOJEV_URL ok. AUTOJEV_API_KEY ok.';
  const names = missing.length === 1 ? missing[0] : `${missing[0]} and ${missing[1]}`;
  return `Set ${names} in .env before a Tail-Jev run.`;
}

export function commandPreview(form: SlateForm, envSource: string) {
  if (form.action === 'view-last') return 'npm run view';
  if (form.action === 'view-snapshot') return form.snapshot ? `npm run view -- ${form.snapshot}` : 'npm run view -- <snapshot>';
  if (form.action === 'compare') return DAY.test(form.compareDay) ? `npm run compare -- ${form.compareDay}` : 'npm run compare -- YYYY-MM-DD';
  if (form.action === 'list-odds') return 'npm run odds';
  if (form.action === 'clear-snapshots') return 'npm run clear-snapshots';
  const parts: string[] = [];
  if (form.action === 'replay') {
    if (form.oddsDay) parts.push(`odds=${form.oddsDay}`);
  } else if (form.dateMode === 'day' && form.day) parts.push(form.day);
  parts.push(`model=${form.model}`);
  if (form.action === 'start' && form.fresh) parts.push('--fresh');
  const command = `npm run slate -- ${parts.join(' ')}`;
  return form.oddsSource === envSource ? command : `ODDS_SOURCE=${form.oddsSource} ${command}`;
}

export function formIssues(form: SlateForm, ctx: FormContext) {
  const issues: string[] = [];
  if (form.action === 'start' || form.action === 'replay') {
    const keys = keyStatus(form.model);
    if (!keys.startsWith('Keys:')) issues.push(keys);
  }
  if (form.action === 'start') {
    if (form.oddsSource === 'the-odds-api') issues.push('The Odds API only opens saved files. Choose Replay saved odds.');
    if (form.dateMode === 'day' && !DAY.test(form.day)) issues.push('Date must be YYYY-MM-DD.');
  }
  if (form.action === 'replay') {
    if (form.fresh) issues.push('odds= reads saved prices only. Leave off --fresh.');
    if (!DAY.test(form.oddsDay)) issues.push('odds= must be YYYY-MM-DD, the Eastern day the prices were saved.');
    else if (!ctx.oddsDays.some((day) => day.day === form.oddsDay && day.source === form.oddsSource)) {
      issues.push('No saved odds for that day and source.');
    }
  }
  if (form.action === 'view-last' && !ctx.lastRun) issues.push(missingSlateLines(ctx.lastRunPath).join(' '));
  if (form.action === 'view-snapshot') {
    if (!form.snapshot) issues.push('Pick a snapshot.');
    else if (!ctx.snapshots.includes(form.snapshot) && !isViewFile(form.snapshot)) {
      issues.push(missingSlateLines(`snapshots/${form.snapshot}.json`).join(' '));
    }
  }
  if (form.action === 'compare' && !ctx.compareDays.includes(form.compareDay)) {
    const day = DAY.test(form.compareDay) ? form.compareDay : 'YYYY-MM-DD';
    issues.push(`Missing snapshots/${day}-jev.json or snapshots/${day}-tail-jev.json. Run npm run slate -- ${day} model=jev and npm run slate -- ${day} model=tail-jev.`);
  }
  return issues;
}

export function applyPrefill(form: SlateForm, argv: string[]): { form: SlateForm; error?: string } {
  try {
    readStartArgs(argv.filter((arg) => arg !== '--no-splash' && arg !== '--tui' && arg !== '--slate'));
  } catch (error) {
    return { form, error: error instanceof Error ? error.message : 'Could not read those options.' };
  }
  const next = { ...form };
  let sawOdds = false;
  let sawFresh = false;
  for (const arg of argv) {
    if (arg === '--fresh') {
      sawFresh = true;
      continue;
    }
    const named = /^(?:--)?model=(.*)$/.exec(arg);
    if (named) {
      const model = normalizeModelName(named[1] ?? '');
      if (model) next.model = model;
      continue;
    }
    const saved = /^(?:--)?odds=(.*)$/.exec(arg);
    if (saved && DAY.test((saved[1] ?? '').trim())) {
      next.oddsDay = saved[1].trim();
      next.action = 'replay';
      next.fresh = false;
      sawOdds = true;
      continue;
    }
    if (DAY.test(arg)) {
      next.day = arg;
      next.dateMode = 'day';
      if (!sawOdds) next.action = 'start';
    }
  }
  if (sawFresh && !sawOdds) {
    next.fresh = true;
    next.action = 'start';
  }
  const view = argv.find((arg) => isViewFile(arg));
  if (view) {
    next.action = 'view-snapshot';
    next.snapshot = resolve(view);
    next.fresh = false;
  }
  return { form: next };
}

export function settleForm(form: SlateForm, ctx: FormContext): SlateForm {
  const next = { ...form };
  if (next.action !== 'start') next.fresh = false;
  if (next.action === 'replay') {
    const match = ctx.oddsDays.find((day) => day.day === next.oddsDay && day.source === next.oddsSource) ?? ctx.oddsDays[0];
    if (match && isOddsSource(match.source)) {
      next.oddsDay = match.day;
      next.oddsSource = match.source;
    }
  }
  if (next.action === 'view-snapshot' && !ctx.snapshots.includes(next.snapshot) && !isViewFile(next.snapshot)) {
    next.snapshot = ctx.snapshots[0] ?? '';
  }
  if (next.action === 'compare' && !ctx.compareDays.includes(next.compareDay)) next.compareDay = ctx.compareDays[0] ?? '';
  return next;
}

export function formatOddsLines(days: SavedOddsDay[]) {
  if (!days.length) return ['No saved odds. npm run slate stores responses in odds-cache/.'];
  const lines: string[] = [];
  for (const day of days) {
    const label = day.source === 'the-odds-api' ? '' : oddsSourceLabel(day.source);
    lines.push(label ? `${day.day}  ${label}` : day.day);
    for (const slate of day.slates) {
      const games = `${slate.games} game${slate.games === 1 ? '' : 's'}`;
      const window = slate.from && slate.to ? `  ${slate.from} to ${slate.to}` : '';
      lines.push(`  ${slate.sport}  ${games}${window}`);
    }
    if (day.props) lines.push(`  props  ${day.props} event file${day.props === 1 ? '' : 's'}`);
    lines.push(`  ${oddsReplayCommand(day.day, day.source, 'jev')}`);
    lines.push(`  ${oddsReplayCommand(day.day, day.source, 'tail-jev')}`);
  }
  return lines;
}

export function compareDaysOf(names: string[]) {
  const jev = new Set<string>();
  const tail = new Set<string>();
  for (const name of names) {
    if (name.endsWith('-tail-jev')) tail.add(name.slice(0, -'-tail-jev'.length));
    else if (name.endsWith('-jev')) jev.add(name.slice(0, -'-jev'.length));
  }
  return [...jev].filter((day) => tail.has(day) && DAY.test(day)).sort().reverse();
}

const snapshotDir = fileURLToPath(new URL('../../snapshots/', import.meta.url));

export async function listSnapshotNames() {
  try {
    const entries = await readdir(snapshotDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.slice(0, -'.json'.length))
      .sort();
  } catch {
    return [];
  }
}

export async function loadContext(): Promise<FormContext> {
  const days = await listSavedOdds();
  const snapshots = await listSnapshotNames();
  const lastRunPath = slateFile();
  let lastRun = false;
  try {
    await access(lastRunPath);
    lastRun = true;
  } catch {
    lastRun = false;
  }
  return {
    envSource: defaultOddsSource(),
    oddsDays: days.map((day) => ({
      day: day.day,
      source: day.source,
      label: `${day.day} ${day.source === 'the-odds-api' ? 'The Odds API' : oddsSourceLabel(day.source) || day.source}`,
    })),
    snapshots,
    compareDays: compareDaysOf(snapshots),
    today: todayEastern(),
    lastRun,
    lastRunPath,
    oddsLines: formatOddsLines(days),
  };
}
