import { addDays } from '../../slate/window.js';
import {
  SOURCE_LABELS,
  SOURCE_ORDER,
  commandPreview,
  formIssues,
  keyStatus,
  settleForm,
  type FormContext,
  type OddsChoice,
  type SlateForm,
} from './commands.js';
import type { OddsSourceId, TuiAction } from './settings.js';

export const ACTIONS: { id: TuiAction; label: string }[] = [
  { id: 'start', label: 'Start slate' },
  { id: 'replay', label: 'Replay saved odds' },
  { id: 'view-last', label: 'View last run' },
  { id: 'view-snapshot', label: 'View snapshot' },
  { id: 'compare', label: 'Compare snapshots' },
  { id: 'list-odds', label: 'List saved odds' },
  { id: 'clear-snapshots', label: 'Clear snapshots' },
];

export type FocusId = 'action' | 'date-mode' | 'day' | 'odds-day' | 'model' | 'source' | 'fresh' | 'snapshot' | 'compare' | 'run' | 'quit';

export type UiState = SlateForm & {
  focus: FocusId;
  picker: boolean;
  pickerCursor: string;
  confirm: boolean;
  confirmFocus: 'yes' | 'no';
  confirmTyped: string;
  list: boolean;
  message: string;
  scroll: number;
};

export type FormEvent =
  | { type: 'key'; key: string }
  | { type: 'click'; id: string }
  | { type: 'wheel'; delta: number };

export type FormEffect = { type: 'none' } | { type: 'quit' } | { type: 'run' } | { type: 'clear' };

export type Hit = { id: string; line: number; start: number; end: number };

export type Layout = { lines: string[]; hits: Hit[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function createUi(form: SlateForm, message = ''): UiState {
  return {
    action: form.action,
    dateMode: form.dateMode,
    day: form.day,
    model: form.model,
    oddsSource: form.oddsSource,
    fresh: form.fresh,
    oddsDay: form.oddsDay,
    snapshot: form.snapshot,
    compareDay: form.compareDay,
    focus: 'action',
    picker: false,
    pickerCursor: form.day,
    confirm: false,
    confirmFocus: 'yes',
    confirmTyped: '',
    list: false,
    message,
    scroll: 0,
  };
}

export function focusOrder(state: UiState): FocusId[] {
  const order: FocusId[] = ['action'];
  if (state.action === 'start') {
    order.push('date-mode');
    if (state.dateMode === 'day') order.push('day');
    order.push('model', 'source', 'fresh');
  } else if (state.action === 'replay') order.push('odds-day', 'model', 'source');
  else if (state.action === 'view-snapshot') order.push('snapshot');
  else if (state.action === 'compare') order.push('compare');
  order.push('run', 'quit');
  return order;
}

export function focusedHitId(state: UiState) {
  if (state.confirm) return state.confirmFocus === 'yes' ? 'confirm:yes' : 'confirm:no';
  if (state.focus === 'action') return `action:${state.action}`;
  if (state.focus === 'date-mode') return `date:${state.dateMode}`;
  if (state.focus === 'model') return `model:${state.model}`;
  if (state.focus === 'source') return `source:${state.oddsSource}`;
  if (state.focus === 'odds-day') return `odds:${state.oddsDay}:${state.oddsSource}`;
  if (state.focus === 'snapshot') return `snap:${state.snapshot}`;
  if (state.focus === 'compare') return `cmp:${state.compareDay}`;
  if (state.focus === 'day') return 'day';
  if (state.focus === 'fresh') return 'fresh';
  if (state.focus === 'run') return 'run';
  return 'quit';
}

export function hintFor(state: UiState) {
  if (state.list) return 'q returns · wheel scrolls · ctrl-c exits';
  if (state.picker) return ', . change month · enter selects · esc closes';
  if (state.confirm) return 'enter confirms · esc cancels · type yes';
  return 'enter runs · tab / arrows move · click selects · q / esc quits · ctrl-c exits';
}

export function headerLine(state: UiState, width: number) {
  const title = ' Parlay Slate';
  const show = state.action === 'start' || state.action === 'replay';
  const model = show ? `Model: ${state.model === 'tail-jev' ? 'Tail-Jev' : 'Jev'}` : 'Model: —';
  const source = show ? `Odds Source: ${SOURCE_LABELS[state.oddsSource]}` : 'Odds Source: —';
  const button = ' x ';
  let corner = `${model}  ${source}  `;
  if (title.length + corner.length + button.length > width) corner = `${model}  `;
  if (title.length + corner.length + button.length > width) corner = '';
  const gap = width - title.length - corner.length - button.length;
  if (gap < 1) return fit(`${title}${button}`, width);
  return `${title}${' '.repeat(gap)}${corner}${button}`;
}

function fit(text: string, width: number) {
  if (width <= 0) return '';
  return text.length <= width ? text : text.slice(0, width);
}

function wrap(text: string, width: number) {
  const limit = Math.max(1, width);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const piece = word.length > limit ? word.slice(0, limit) : word;
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= limit) current += ` ${piece}`;
    else {
      lines.push(current);
      current = piece;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function addLine(layout: Layout, text: string, width: number, hits: { id: string; start: number; end: number }[] = []) {
  const line = fit(text, width);
  const y = layout.lines.length;
  layout.lines.push(line);
  for (const hit of hits) {
    if (hit.start >= line.length) continue;
    layout.hits.push({ id: hit.id, line: y, start: hit.start, end: Math.min(hit.end, line.length) });
  }
}

function addFlow(layout: Layout, prefix: string, items: { id: string; text: string }[], width: number) {
  const lead = fit(prefix, width);
  const pad = ' '.repeat(Math.min(prefix.length, Math.max(0, width - 1)));
  let text = lead;
  let hits: { id: string; start: number; end: number }[] = [];
  const commit = () => {
    addLine(layout, text, width, hits);
    text = pad;
    hits = [];
  };
  for (const item of items) {
    if (!item.text) continue;
    const spacer = hits.length ? '  ' : '';
    if (hits.length && text.length + spacer.length + item.text.length > width) commit();
    const gap = hits.length ? '  ' : '';
    const start = Math.min(text.length + gap.length, width);
    text += gap + item.text;
    hits.push({ id: item.id, start, end: start + item.text.length });
  }
  if (hits.length) commit();
}

function radio(on: boolean, label: string) {
  return `${on ? '(•)' : '( )'} ${label}`;
}

function cycle<T>(items: T[], current: T, delta: number) {
  if (!items.length) return current;
  const index = items.indexOf(current);
  const start = index < 0 ? 0 : index;
  return items[(start + delta + items.length) % items.length] ?? current;
}

function stepDay(day: string, delta: number, today: string) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  return addDays(base, delta);
}

function shiftMonth(day: string, delta: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const kept = Math.min(date, last);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(kept).padStart(2, '0')}`;
}

function withAction(state: UiState, action: TuiAction, ctx: FormContext): UiState {
  return { ...createUi(settleForm({ ...state, action }, ctx)), focus: 'action' };
}

function moveFocus(state: UiState, delta: number): UiState {
  const order = focusOrder(state);
  const index = Math.max(0, order.indexOf(state.focus));
  return { ...state, focus: order[(index + delta + order.length) % order.length] ?? 'action' };
}

function requestRun(state: UiState, ctx: FormContext): { state: UiState; effect: FormEffect } {
  const issues = formIssues(state, ctx);
  if (issues.length) return { state: { ...state, message: issues[0] ?? '' }, effect: { type: 'none' } };
  if (state.action === 'clear-snapshots') {
    return { state: { ...state, confirm: true, confirmFocus: 'yes', confirmTyped: '', scroll: 0, message: '' }, effect: { type: 'none' } };
  }
  if (state.action === 'list-odds') return { state: { ...state, list: true, scroll: 0, message: '' }, effect: { type: 'none' } };
  return { state, effect: { type: 'run' } };
}

function selectOdds(state: UiState, choice: OddsChoice): UiState {
  const oddsSource = (SOURCE_ORDER as string[]).includes(choice.source) ? choice.source as OddsSourceId : state.oddsSource;
  return { ...state, oddsDay: choice.day, oddsSource, focus: 'odds-day', message: '' };
}

function reduceList(state: UiState, event: FormEvent): { state: UiState; effect: FormEffect } {
  if (event.type === 'key' && (event.key === 'q' || event.key === 'Q' || event.key === '\x1b')) {
    return { state: { ...state, list: false, scroll: 0 }, effect: { type: 'none' } };
  }
  return { state, effect: { type: 'none' } };
}

function reduceConfirm(state: UiState, event: FormEvent): { state: UiState; effect: FormEffect } {
  if (event.type === 'click') {
    if (event.id === 'confirm:yes') return { state, effect: { type: 'clear' } };
    if (event.id === 'confirm:no') return { state: { ...state, confirm: false, confirmTyped: '' }, effect: { type: 'none' } };
    return { state, effect: { type: 'none' } };
  }
  if (event.type !== 'key') return { state, effect: { type: 'none' } };
  const key = event.key;
  if (key === '\x1b') return { state: { ...state, confirm: false, confirmTyped: '' }, effect: { type: 'none' } };
  if (key === 'q' || key === 'Q') return { state, effect: { type: 'quit' } };
  if (key === '\t' || key === '\x1b[C' || key === '\x1b[Z' || key === '\x1b[D') {
    return { state: { ...state, confirmFocus: state.confirmFocus === 'yes' ? 'no' : 'yes' }, effect: { type: 'none' } };
  }
  if (key === '\r' || key === '\n' || key === ' ') {
    if (state.confirmFocus === 'yes' || state.confirmTyped === 'yes') return { state, effect: { type: 'clear' } };
    return { state: { ...state, confirm: false, confirmTyped: '' }, effect: { type: 'none' } };
  }
  if (key === 'y' || key === 'e' || key === 's') {
    const next = `${state.confirmTyped}${key}`;
    const typed = 'yes'.startsWith(next) ? next : '';
    return { state: { ...state, confirmTyped: typed }, effect: { type: 'none' } };
  }
  return { state: { ...state, confirmTyped: '' }, effect: { type: 'none' } };
}

function reducePicker(state: UiState, event: FormEvent, ctx: FormContext): { state: UiState; effect: FormEffect } {
  if (event.type === 'click' && event.id.startsWith('pick:')) {
    const day = event.id.slice('pick:'.length);
    return { state: { ...state, day, picker: false, pickerCursor: day, focus: 'day', message: '' }, effect: { type: 'none' } };
  }
  if (event.type !== 'key') return { state, effect: { type: 'none' } };
  const key = event.key;
  if (key === '\x1b') return { state: { ...state, picker: false }, effect: { type: 'none' } };
  if (key === 'q' || key === 'Q') return { state, effect: { type: 'quit' } };
  let cursor = state.pickerCursor || state.day || ctx.today;
  if (key === '\x1b[C' || key === 'l' || key === ']') cursor = stepDay(cursor, 1, ctx.today);
  else if (key === '\x1b[D' || key === 'h' || key === '[') cursor = stepDay(cursor, -1, ctx.today);
  else if (key === '\x1b[A' || key === 'k') cursor = stepDay(cursor, -7, ctx.today);
  else if (key === '\x1b[B' || key === 'j') cursor = stepDay(cursor, 7, ctx.today);
  else if (key === ',') cursor = shiftMonth(cursor, -1);
  else if (key === '.') cursor = shiftMonth(cursor, 1);
  else if (key === '\r' || key === '\n') {
    return { state: { ...state, day: cursor, picker: false, pickerCursor: cursor, focus: 'day', message: '' }, effect: { type: 'none' } };
  } else return { state, effect: { type: 'none' } };
  return { state: { ...state, pickerCursor: cursor }, effect: { type: 'none' } };
}

function reduceMain(state: UiState, event: FormEvent, ctx: FormContext): { state: UiState; effect: FormEffect } {
  if (event.type === 'click') {
    const id = event.id;
    if (id.startsWith('action:')) return { state: withAction(state, id.slice('action:'.length) as TuiAction, ctx), effect: { type: 'none' } };
    if (id === 'date:current' || id === 'date:day') {
      return { state: { ...state, dateMode: id === 'date:day' ? 'day' : 'current', focus: 'date-mode', message: '' }, effect: { type: 'none' } };
    }
    if (id === 'day') return { state: { ...state, picker: true, pickerCursor: state.day || ctx.today, focus: 'day', scroll: 0 }, effect: { type: 'none' } };
    if (id === 'day-prev' || id === 'day-next') {
      const day = stepDay(state.day, id === 'day-next' ? 1 : -1, ctx.today);
      return { state: { ...state, day, dateMode: 'day', focus: 'day', message: '' }, effect: { type: 'none' } };
    }
    if (id.startsWith('model:')) {
      const model = id.endsWith('tail-jev') ? 'tail-jev' : 'jev';
      return { state: { ...state, model, focus: 'model', message: '' }, effect: { type: 'none' } };
    }
    if (id.startsWith('source:')) {
      const oddsSource = id.slice('source:'.length) as OddsSourceId;
      return { state: { ...state, oddsSource, focus: 'source', message: '' }, effect: { type: 'none' } };
    }
    if (id.startsWith('odds:')) {
      const choice = ctx.oddsDays.find((day) => id === `odds:${day.day}:${day.source}`);
      if (choice) return { state: selectOdds(state, choice), effect: { type: 'none' } };
    }
    if (id.startsWith('snap:')) return { state: { ...state, snapshot: id.slice('snap:'.length), focus: 'snapshot', message: '' }, effect: { type: 'none' } };
    if (id.startsWith('cmp:')) return { state: { ...state, compareDay: id.slice('cmp:'.length), focus: 'compare', message: '' }, effect: { type: 'none' } };
    if (id === 'fresh' && state.action === 'start') return { state: { ...state, fresh: !state.fresh, focus: 'fresh', message: '' }, effect: { type: 'none' } };
    if (id === 'run') return requestRun({ ...state, focus: 'run' }, ctx);
    if (id === 'quit') return { state, effect: { type: 'quit' } };
    return { state, effect: { type: 'none' } };
  }
  if (event.type !== 'key') return { state, effect: { type: 'none' } };
  const key = event.key;
  if (key === 'q' || key === 'Q' || key === '\x1b') return { state, effect: { type: 'quit' } };
  if (key === '\t' || key === '\x1b[B') return { state: moveFocus(state, 1), effect: { type: 'none' } };
  if (key === '\x1b[Z' || key === '\x1b[A') return { state: moveFocus(state, -1), effect: { type: 'none' } };
  if (key === 'r' || key === 'R') return requestRun(state, ctx);
  if ((key === '\r' || key === '\n') && state.focus === 'run') return requestRun(state, ctx);
  if ((key === '\r' || key === '\n') && state.focus === 'quit') return { state, effect: { type: 'quit' } };
  if ((key === ' ' || key === '\r' || key === '\n') && state.focus === 'fresh' && state.action === 'start') {
    return { state: { ...state, fresh: !state.fresh, message: '' }, effect: { type: 'none' } };
  }
  if ((key === '\r' || key === '\n' || key === ' ') && state.focus === 'day') {
    return { state: { ...state, picker: true, pickerCursor: state.day || ctx.today, scroll: 0 }, effect: { type: 'none' } };
  }
  const delta = key === '\x1b[C' ? 1 : key === '\x1b[D' ? -1 : 0;
  if (!delta && key !== '[' && key !== ']') return { state, effect: { type: 'none' } };
  if (state.focus === 'action' && delta) return { state: withAction(state, cycle(ACTIONS.map((item) => item.id), state.action, delta), ctx), effect: { type: 'none' } };
  if (state.focus === 'date-mode' && delta) {
    return { state: { ...state, dateMode: state.dateMode === 'current' ? 'day' : 'current', message: '' }, effect: { type: 'none' } };
  }
  if (state.focus === 'day' && (delta || key === '[' || key === ']')) {
    const step = key === '[' || delta < 0 ? -1 : 1;
    return { state: { ...state, day: stepDay(state.day, step, ctx.today), message: '' }, effect: { type: 'none' } };
  }
  if (state.focus === 'model' && delta) {
    return { state: { ...state, model: state.model === 'jev' ? 'tail-jev' : 'jev', message: '' }, effect: { type: 'none' } };
  }
  if (state.focus === 'source' && delta) {
    return { state: { ...state, oddsSource: cycle(SOURCE_ORDER, state.oddsSource, delta), message: '' }, effect: { type: 'none' } };
  }
  if (state.focus === 'odds-day' && delta && ctx.oddsDays.length) {
    const current = ctx.oddsDays.find((day) => day.day === state.oddsDay && day.source === state.oddsSource) ?? ctx.oddsDays[0];
    if (!current) return { state, effect: { type: 'none' } };
    return { state: selectOdds(state, cycle(ctx.oddsDays, current, delta)), effect: { type: 'none' } };
  }
  if (state.focus === 'snapshot' && delta) {
    return { state: { ...state, snapshot: cycle(ctx.snapshots, state.snapshot, delta), message: '' }, effect: { type: 'none' } };
  }
  if (state.focus === 'compare' && delta) {
    return { state: { ...state, compareDay: cycle(ctx.compareDays, state.compareDay, delta), message: '' }, effect: { type: 'none' } };
  }
  return { state, effect: { type: 'none' } };
}

export function reduceForm(state: UiState, event: FormEvent, ctx: FormContext): { state: UiState; effect: FormEffect } {
  if (event.type === 'wheel') return { state: { ...state, scroll: state.scroll + event.delta }, effect: { type: 'none' } };
  if (event.type === 'click' && event.id === 'header-x') {
    if (state.list) return { state: { ...state, list: false, scroll: 0 }, effect: { type: 'none' } };
    return { state, effect: { type: 'quit' } };
  }
  if (state.list) return reduceList(state, event);
  if (state.confirm) return reduceConfirm(state, event);
  if (state.picker) return reducePicker(state, event, ctx);
  return reduceMain(state, event, ctx);
}

function layoutCalendar(cursor: string, width: number): Layout {
  const layout: Layout = { lines: [], hits: [] };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cursor);
  const year = match ? Number(match[1]) : 2026;
  const month = match ? Number(match[2]) : 1;
  const title = `${MONTHS[month - 1] ?? 'Month'} ${year}`;
  const cells: { label: string; day: string | null }[] = [];
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let index = 0; index < first; index++) cells.push({ label: '    ', day: null });
  for (let date = 1; date <= count; date++) {
    const day = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    const text = String(date).padStart(2, ' ');
    cells.push({ label: day === cursor ? `[${text}]` : ` ${text} `, day });
  }
  const block = 28;
  const left = Math.max(0, Math.floor((width - block) / 2));
  const pad = ' '.repeat(Math.min(left, width));
  addLine(layout, fit(pad + title, width), width);
  addLine(layout, fit(pad + ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((name) => ` ${name} `).join(''), width), width);
  for (let index = 0; index < cells.length; index += 7) {
    const row = cells.slice(index, index + 7);
    let text = pad;
    const hits: { id: string; start: number; end: number }[] = [];
    for (const cell of row) {
      const start = text.length;
      text += cell.label;
      if (cell.day) hits.push({ id: `pick:${cell.day}`, start, end: start + cell.label.length });
    }
    addLine(layout, text, width, hits);
  }
  return layout;
}

function layoutList(ctx: FormContext, width: number): Layout {
  const layout: Layout = { lines: [], hits: [] };
  addLine(layout, 'Saved odds', width);
  addLine(layout, '', width);
  for (const line of ctx.oddsLines.flatMap((item) => wrap(item.trimEnd(), width))) addLine(layout, line, width);
  return layout;
}

function layoutConfirm(state: UiState, width: number): Layout {
  const layout: Layout = { lines: [], hits: [] };
  for (const line of wrap('Clear every file in snapshots/?', width)) addLine(layout, line, width);
  for (const line of wrap('runs/ and odds-cache/ stay.', width)) addLine(layout, line, width);
  addLine(layout, '', width);
  addFlow(layout, '', [
    { id: 'confirm:yes', text: '[ Yes ]' },
    { id: 'confirm:no', text: '[ No ]' },
  ], width);
  if (state.confirmTyped) addLine(layout, `typed: ${state.confirmTyped}`, width);
  return layout;
}

export function layoutScreen(state: UiState, ctx: FormContext, width: number): Layout {
  if (state.list) return layoutList(ctx, width);
  if (state.confirm) return layoutConfirm(state, width);
  if (state.picker) return layoutCalendar(state.pickerCursor || state.day, width);
  const layout: Layout = { lines: [], hits: [] };
  addFlow(layout, ' Action     ', ACTIONS.map((item) => ({ id: `action:${item.id}`, text: radio(state.action === item.id, item.label) })), width);
  addLine(layout, '', width);
  if (state.action === 'start') {
    addFlow(layout, ' Date mode  ', [
      { id: 'date:current', text: radio(state.dateMode === 'current', 'Current slate') },
      { id: 'date:day', text: radio(state.dateMode === 'day', 'Eastern day') },
    ], width);
    if (state.dateMode === 'day') {
      addFlow(layout, '            ', [
        { id: 'day', text: `[ ${state.day} ]` },
        { id: 'day-prev', text: '[<]' },
        { id: 'day-next', text: '[>]' },
      ], width);
      for (const line of wrap('Click the date to open a month grid. [ and ] step one day.', width - 12)) {
        addLine(layout, fit(`            ${line}`, width), width);
      }
    }
    addLine(layout, '', width);
  }
  if (state.action === 'replay') {
    const items = ctx.oddsDays.length
      ? ctx.oddsDays.map((day) => ({
        id: `odds:${day.day}:${day.source}`,
        text: radio(state.oddsDay === day.day && state.oddsSource === day.source, day.label),
      }))
      : [{ id: 'odds:none', text: '(no saved odds)' }];
    addFlow(layout, ' Odds day   ', items, width);
    addLine(layout, '', width);
  }
  if (state.action === 'start' || state.action === 'replay') {
    addFlow(layout, ' Model      ', [
      { id: 'model:jev', text: radio(state.model === 'jev', 'Jev') },
      { id: 'model:tail-jev', text: radio(state.model === 'tail-jev', 'Tail-Jev') },
    ], width);
    addLine(layout, '', width);
    addFlow(layout, ' Odds src   ', SOURCE_ORDER.map((id) => ({
      id: `source:${id}`,
      text: radio(state.oddsSource === id, SOURCE_LABELS[id]),
    })), width);
    addLine(layout, '', width);
  }
  if (state.action === 'start') {
    addFlow(layout, ' Fresh      ', [{ id: 'fresh', text: `${state.fresh ? '[x]' : '[ ]'} Ignore odds-cache and fetch new prices` }], width);
    if (state.fresh) {
      for (const line of wrap('Fresh prices ignore odds-cache and read the books again.', width - 12)) {
        addLine(layout, fit(`            ${line}`, width), width);
      }
    }
    addLine(layout, '', width);
  }
  if (state.action === 'view-snapshot') {
    const items = ctx.snapshots.length
      ? ctx.snapshots.map((name) => ({ id: `snap:${name}`, text: radio(state.snapshot === name, name) }))
      : [{ id: 'snap:none', text: '(no snapshots)' }];
    addFlow(layout, ' Snapshot   ', items, width);
    addLine(layout, '', width);
  }
  if (state.action === 'compare') {
    const items = ctx.compareDays.length
      ? ctx.compareDays.map((day) => ({ id: `cmp:${day}`, text: radio(state.compareDay === day, day) }))
      : [{ id: 'cmp:none', text: '(no day has both models)' }];
    addFlow(layout, ' Compare    ', items, width);
    addLine(layout, '', width);
  }
  const issues = formIssues(state, ctx);
  const notes = [state.message, state.action === 'start' || state.action === 'replay' ? keyStatus(state.model) : '', ...issues]
    .filter((line, index, all) => line && all.indexOf(line) === index);
  if (notes.length) {
    for (const note of notes) for (const line of wrap(note, width)) addLine(layout, line, width);
    addLine(layout, '', width);
  }
  for (const line of wrap(commandPreview(state, ctx.envSource), width)) addLine(layout, line, width);
  addLine(layout, '', width);
  addFlow(layout, '            ', [
    { id: 'run', text: '[ Run ]' },
    { id: 'quit', text: '[ Quit ]' },
  ], width);
  return layout;
}
