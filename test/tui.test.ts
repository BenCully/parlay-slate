import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cacheBypass, setOddsFresh } from '../odds/cache.js';
import { classifyStart, isSlateArg } from '../scripts/route.js';
import {
  applyPrefill,
  commandPreview,
  defaultForm,
  formFromSettings,
  formIssues,
  persistsForm,
  settleForm,
  type FormContext,
  type SlateForm,
} from '../ui/tui/commands.js';
import { pickLogo, SMALL, STANDARD } from '../ui/tui/logo.js';
import { createUi, headerLine, hintFor, layoutScreen, reduceForm, type UiState } from '../ui/tui/options.js';
import { loadTuiSettings, parseSettings, saveTuiSettings, type TuiSettings } from '../ui/tui/settings.js';
import { createSplashPlayer, planSplash, sliceLogo, splashKeyAction, visibleColumns } from '../ui/tui/splash.js';
import { takeEvents } from '../ui/term.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function ctx(partial: Partial<FormContext> = {}): FormContext {
  return {
    envSource: 'books',
    oddsDays: [{ day: '2026-11-15', source: 'fanduel', label: '2026-11-15 FanDuel' }],
    snapshots: ['2026-11-15-jev', '2026-11-15-tail-jev'],
    compareDays: ['2026-11-15'],
    today: '2026-11-19',
    lastRun: true,
    lastRunPath: 'runs/last-run.json',
    oddsLines: ['2026-11-15  FanDuel'],
    ...partial,
  };
}

function form(partial: Partial<SlateForm> = {}): SlateForm {
  return { ...defaultForm('2026-11-15', 'books'), ...partial };
}

test('slate args bypass the launcher and a default model does not', () => {
  assert.equal(classifyStart([]).mode, 'tui');
  assert.deepEqual(classifyStart([]), { mode: 'tui', splash: true, prefill: [] });
  assert.deepEqual(classifyStart(['--no-splash']), { mode: 'tui', splash: false, prefill: [] });
  assert.deepEqual(classifyStart(['--tui', '2026-11-15']), { mode: 'tui', splash: true, prefill: ['2026-11-15'] });
  assert.deepEqual(classifyStart(['--fresh']), { mode: 'slate', args: ['--fresh'] });
  assert.deepEqual(classifyStart(['2026-11-15', 'model=jev']), { mode: 'slate', args: ['2026-11-15', 'model=jev'] });
  assert.deepEqual(classifyStart(['--slate', '--tui']), { mode: 'slate', args: [] });
  assert.deepEqual(classifyStart(['--tui', '--slate', 'model=jev']), { mode: 'slate', args: ['model=jev'] });
  assert.equal(isSlateArg('model=jev'), true);
  assert.equal(isSlateArg('jev'), false);
  assert.equal(classifyStart(['--']).mode, 'tui');
  assert.deepEqual(classifyStart(['test/fixtures/slate.json']), {
    mode: 'tui',
    splash: true,
    prefill: ['test/fixtures/slate.json'],
  });
});

test('command preview uses npm run slate and the odds source prefix', () => {
  const base = form();
  assert.equal(commandPreview(base, 'books'), 'npm run slate -- model=jev');
  assert.equal(commandPreview(form({ dateMode: 'day' }), 'books'), 'npm run slate -- 2026-11-15 model=jev');
  assert.equal(commandPreview(form({ model: 'tail-jev' }), 'books'), 'npm run slate -- model=tail-jev');
  assert.equal(commandPreview(form({ fresh: true }), 'books'), 'npm run slate -- model=jev --fresh');
  assert.equal(
    commandPreview(form({ dateMode: 'day', fresh: true, model: 'tail-jev' }), 'fanduel'),
    'ODDS_SOURCE=books npm run slate -- 2026-11-15 model=tail-jev --fresh',
  );
  assert.equal(commandPreview(form({ oddsSource: 'fanduel' }), 'books'), 'ODDS_SOURCE=fanduel npm run slate -- model=jev');
  assert.equal(
    commandPreview(form({ action: 'replay', oddsDay: '2026-11-15', oddsSource: 'the-odds-api' }), 'books'),
    'ODDS_SOURCE=the-odds-api npm run slate -- odds=2026-11-15 model=jev',
  );
  assert.equal(
    commandPreview(form({ action: 'replay', oddsDay: '2026-11-15', oddsSource: 'fanduel', fresh: true }), 'fanduel'),
    'npm run slate -- odds=2026-11-15 model=jev',
  );
  assert.equal(commandPreview(form({ action: 'view-last' }), 'books'), 'npm run view');
  assert.equal(commandPreview(form({ action: 'view-snapshot', snapshot: '2026-11-15-jev' }), 'books'), 'npm run view -- 2026-11-15-jev');
  assert.equal(commandPreview(form({ action: 'compare', compareDay: '2026-11-15' }), 'books'), 'npm run compare -- 2026-11-15');
  assert.equal(commandPreview(form({ action: 'list-odds' }), 'books'), 'npm run odds');
  assert.equal(commandPreview(form({ action: 'clear-snapshots' }), 'books'), 'npm run clear-snapshots');
});

test('replay rejects fresh and a live Odds API start', () => {
  const replay = formIssues(form({ action: 'replay', oddsDay: '2026-11-15', oddsSource: 'fanduel', fresh: true }), ctx());
  assert.match(replay.join('\n'), /fresh/);
  const live = formIssues(form({ oddsSource: 'the-odds-api' }), ctx());
  assert.match(live.join('\n'), /saved files/);
});

test('prefill keeps settings and normalizes autojev', () => {
  const base = form({ model: 'tail-jev', oddsSource: 'betmgm' });
  const dated = applyPrefill(base, ['2026-11-18']);
  assert.equal(dated.error, undefined);
  assert.equal(dated.form.day, '2026-11-18');
  assert.equal(dated.form.dateMode, 'day');
  assert.equal(dated.form.model, 'tail-jev');
  assert.equal(dated.form.oddsSource, 'betmgm');
  const model = applyPrefill(base, ['model=autojev']);
  assert.equal(model.form.model, 'tail-jev');
  const both = applyPrefill(base, ['odds=2026-11-15', '2026-11-16']);
  assert.match(both.error ?? '', /not both/);
  assert.equal(both.form.model, 'tail-jev');
});

test('a json path prefills view and is not saved as a snapshot name', () => {
  const base = form({ model: 'tail-jev', oddsSource: 'betmgm' });
  const filled = applyPrefill(base, ['test/fixtures/slate.json']);
  assert.equal(filled.error, undefined);
  assert.equal(filled.form.action, 'view-snapshot');
  assert.equal(filled.form.model, 'tail-jev');
  assert.equal(filled.form.oddsSource, 'betmgm');
  assert.equal(filled.form.fresh, false);
  assert.equal(filled.form.snapshot.endsWith('/test/fixtures/slate.json'), true);
  const empty = ctx({ snapshots: [] });
  const settled = settleForm(filled.form, empty);
  assert.equal(settled.snapshot, filled.form.snapshot);
  assert.deepEqual(formIssues(settled, empty), []);
  const kept = settleForm(filled.form, ctx());
  assert.equal(kept.snapshot, filled.form.snapshot);
  assert.equal(persistsForm(settled), false);
  assert.equal(persistsForm(form({ action: 'view-snapshot', snapshot: '2026-11-15-jev' })), true);
  assert.equal(commandPreview(settled, 'books'), `npm run view -- ${settled.snapshot}`);
});

test('keyboard reaches every action and esc closes only the open dialog', () => {
  const sample = ctx();
  let state = createUi(form());
  const seen = new Set<string>();
  for (let index = 0; index < 7; index += 1) {
    seen.add(state.action);
    state = reduceForm(state, { type: 'key', key: '\x1b[C' }, sample).state;
  }
  assert.equal(seen.size, 7);
  assert.equal(reduceForm(createUi(form()), { type: 'key', key: 'q' }, sample).effect.type, 'quit');
  assert.equal(reduceForm(createUi(form()), { type: 'key', key: '\x1b' }, sample).effect.type, 'quit');
  let picked = createUi(form({ dateMode: 'day', day: '2026-11-15' }));
  picked = { ...picked, focus: 'day' };
  const opened = reduceForm(picked, { type: 'key', key: '\r' }, sample).state;
  assert.equal(opened.picker, true);
  const closed = reduceForm(opened, { type: 'key', key: '\x1b' }, sample);
  assert.equal(closed.state.picker, false);
  assert.equal(closed.effect.type, 'none');
  const closedQ = reduceForm(opened, { type: 'key', key: 'q' }, sample);
  assert.equal(closedQ.state.picker, false);
  assert.equal(closedQ.effect.type, 'none');
  const chosen = reduceForm(opened, { type: 'click', id: 'pick:2026-11-20' }, sample).state;
  assert.equal(chosen.day, '2026-11-20');
  assert.equal(chosen.picker, false);
  const stepped = reduceForm(picked, { type: 'key', key: ']' }, sample).state;
  assert.equal(stepped.day, '2026-11-16');
  const clicked = reduceForm(createUi(form()), { type: 'click', id: 'action:compare' }, sample).state;
  assert.equal(clicked.action, 'compare');
  const fresh = reduceForm({ ...createUi(form()), focus: 'fresh' }, { type: 'key', key: ' ' }, sample).state;
  assert.equal(fresh.fresh, true);
});

test('options lines stay within 80, 100, and 120 columns', () => {
  const sample = ctx();
  const states: UiState[] = [
    createUi(form()),
    createUi(form({ dateMode: 'day', fresh: true, model: 'tail-jev', oddsSource: 'draftkings' })),
    createUi(form({ action: 'replay', oddsDay: '2026-11-15', oddsSource: 'fanduel' })),
    createUi(form({ action: 'view-snapshot', snapshot: '2026-11-15-jev' })),
    createUi(form({ action: 'compare', compareDay: '2026-11-15' })),
    createUi(form({ action: 'list-odds' })),
    createUi(form({ action: 'clear-snapshots' })),
    { ...createUi(form({ dateMode: 'day' })), picker: true, pickerCursor: '2026-11-15' },
    { ...createUi(form({ action: 'clear-snapshots' })), confirm: true },
    { ...createUi(form({ action: 'list-odds' })), list: true },
  ];
  for (const width of [80, 100, 120]) {
    for (const state of states) {
      for (const line of layoutScreen(state, sample, width).lines) {
        assert.ok(line.length <= width, `width ${width} got ${line.length}: ${JSON.stringify(line)}`);
      }
      assert.ok(headerLine(state, width).length <= width);
    }
  }
  assert.ok(hintFor(createUi(form())).length <= 80);
});

test('logo widths and reveal frames', () => {
  assert.ok(STANDARD.every((line) => line.length === 56));
  assert.ok(SMALL.every((line) => line.length === 48));
  assert.equal(visibleColumns(0, 56), 0);
  assert.equal(visibleColumns(0.5, 56), 28);
  assert.equal(visibleColumns(1, 56), 56);
  assert.equal(sliceLogo(STANDARD, 0, true).some((line) => line.includes('\x1b')), false);
  assert.equal(sliceLogo(STANDARD, 28, true).some((line) => line.includes('\x1b[1m')), true);
  assert.equal(sliceLogo(STANDARD, 56, true).some((line) => line.includes('\x1b[1m')), true);
  assert.equal(sliceLogo(STANDARD, 28, false).some((line) => line.includes('\x1b')), false);
  assert.equal(sliceLogo(STANDARD, 56, false).some((line) => line.includes('\x1b')), false);
  assert.equal(pickLogo(80, 24).kind, 'standard');
  assert.equal(pickLogo(50, 24).kind, 'small');
  assert.equal(pickLogo(40, 24).kind, 'line');
  assert.equal(pickLogo(80, 7).kind, 'small');
  assert.equal(pickLogo(80, 6).kind, 'line');
  assert.equal(planSplash({ noSplash: true, noAnim: false, noColor: false, columns: 80, rows: 24 }).kind, 'skip');
  assert.equal(planSplash({ noSplash: false, noAnim: true, noColor: false, columns: 80, rows: 24 }).kind, 'static');
  const colorFree = planSplash({ noSplash: false, noAnim: false, noColor: true, columns: 80, rows: 24 });
  assert.equal(colorFree.kind, 'wipe');
  if (colorFree.kind === 'wipe') assert.equal(colorFree.bold, false);
});

test('an ordinary key skips the splash and ctrl-c interrupts', () => {
  assert.equal(splashKeyAction('q'), 'skip');
  assert.equal(splashKeyAction('\r'), 'skip');
  assert.equal(splashKeyAction('\u0003'), 'interrupt');
  const player = createSplashPlayer({ lines: STANDARD, animate: true, bold: true });
  assert.equal(player.frame(0).done, false);
  player.skip();
  const frame = player.frame(100);
  assert.equal(frame.done, true);
  assert.deepEqual(frame.lines, []);
});

test('clear snapshots starts on No', () => {
  const sample = ctx();
  const start = { ...createUi(form({ action: 'clear-snapshots' })), focus: 'run' as const };
  const opened = reduceForm(start, { type: 'key', key: '\r' }, sample);
  assert.equal(opened.effect.type, 'none');
  assert.equal(opened.state.confirm, true);
  assert.equal(opened.state.confirmFocus, 'no');
  const again = reduceForm(opened.state, { type: 'key', key: '\r' }, sample);
  assert.equal(again.effect.type, 'none');
  assert.equal(again.state.confirm, false);

  const reopened = reduceForm(start, { type: 'key', key: '\r' }, sample).state;
  const tabbed = reduceForm(reopened, { type: 'key', key: '\t' }, sample);
  assert.equal(tabbed.state.confirmFocus, 'yes');
  assert.equal(reduceForm(tabbed.state, { type: 'key', key: '\r' }, sample).effect.type, 'clear');

  let typed = reduceForm(start, { type: 'key', key: '\r' }, sample).state;
  for (const key of ['y', 'e', 's']) typed = reduceForm(typed, { type: 'key', key }, sample).state;
  assert.equal(typed.confirmTyped, 'yes');
  assert.equal(reduceForm(typed, { type: 'key', key: '\r' }, sample).effect.type, 'clear');

  const confirming = reduceForm(start, { type: 'key', key: '\r' }, sample).state;
  const byQ = reduceForm(confirming, { type: 'key', key: 'q' }, sample);
  assert.equal(byQ.state.confirm, false);
  assert.equal(byQ.effect.type, 'none');
  const byEsc = reduceForm(confirming, { type: 'key', key: '\x1b' }, sample);
  assert.equal(byEsc.state.confirm, false);
  assert.equal(byEsc.effect.type, 'none');
  assert.equal(reduceForm(confirming, { type: 'click', id: 'confirm:yes' }, sample).effect.type, 'clear');
  assert.equal(reduceForm(confirming, { type: 'click', id: 'header-x' }, sample).effect.type, 'quit');
  const hint = hintFor(confirming);
  assert.match(hint, /type yes, or tab to Yes/);
  assert.match(hint, /q \/ esc closes/);
  assert.ok(hint.length <= 80);
  const picker = reduceForm({ ...createUi(form({ dateMode: 'day', day: '2026-11-15' })), focus: 'day' }, { type: 'key', key: '\r' }, sample).state;
  assert.match(hintFor(picker), /q \/ esc closes/);
});

test('settings load, drop bad fields, and save without secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'parlay-tui-'));
  try {
    const missing = await loadTuiSettings(join(dir, 'missing', 'tui-settings.json'));
    assert.equal(missing.warning, undefined);
    assert.equal(missing.settings.action, 'start');
    assert.equal(missing.settings.model, 'jev');
    assert.equal(missing.settings.fresh, false);

    const junk = join(dir, 'junk.json');
    await writeFile(junk, '{');
    const bad = await loadTuiSettings(junk);
    assert.match(bad.warning ?? '', /using defaults/);

    const list = join(dir, 'list.json');
    await writeFile(list, '[]');
    const nonObject = await loadTuiSettings(list);
    assert.equal(nonObject.settings.action, 'start');

    const parsed = parseSettings({
      version: 3,
      action: 'compare',
      compareDay: '2026-11-15',
      day: 'yesterday',
      model: 'autojev',
      oddsSource: 'pinnacle',
      fresh: 'yes',
      snapshot: '../secret',
      TYPESAFE_API_KEY: 'secret-value',
      AUTOJEV_URL: 'http://tailnet.example',
      extra: true,
    }, 'books');
    assert.equal(parsed.version, 1);
    assert.equal(parsed.action, 'compare');
    assert.equal(parsed.compareDay, '2026-11-15');
    assert.equal(parsed.day, undefined);
    assert.equal(parsed.model, 'tail-jev');
    assert.equal(parsed.oddsSource, 'books');
    assert.equal(parsed.fresh, false);
    assert.equal(parsed.snapshot, undefined);
    assert.equal('TYPESAFE_API_KEY' in parsed, false);

    const file = join(dir, 'nested', 'tui-settings.json');
    await saveTuiSettings(parsed, file);
    const names = await readdir(join(dir, 'nested'));
    assert.equal(names.some((name) => name.endsWith('.tmp')), false);
    const body = await readFile(file, 'utf8');
    assert.equal(body.includes('secret'), false);
    assert.equal(body.includes('http'), false);
    assert.equal(body.includes('TYPESAFE_API_KEY'), false);
    assert.equal(body.includes('AUTOJEV_URL'), false);
    const round = await loadTuiSettings(file);
    assert.equal(round.settings.action, 'compare');
    assert.equal(round.settings.model, 'tail-jev');
    assert.equal(round.settings.compareDay, '2026-11-15');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setOddsFresh does not leak into the next read', () => {
  const previous = process.env.ODDS_CACHE;
  delete process.env.ODDS_CACHE;
  const argvFresh = process.argv.includes('--fresh');
  try {
    setOddsFresh(false);
    assert.equal(cacheBypass(), argvFresh);
    setOddsFresh(true);
    assert.equal(cacheBypass(), true);
    setOddsFresh(false);
    assert.equal(cacheBypass(), argvFresh);
  } finally {
    setOddsFresh(false);
    if (previous === undefined) delete process.env.ODDS_CACHE;
    else process.env.ODDS_CACHE = previous;
  }
});

test('mouse reports stay mouse reports when a click is split', () => {
  const click = Buffer.from('\x1b[<0;15;3M');
  const whole = takeEvents(click);
  assert.equal(whole.events.length, 1);
  assert.equal(whole.events[0]?.key, '');
  assert.deepEqual(whole.events[0]?.mouse, { button: 0, x: 15, y: 3, release: false });
  assert.equal(whole.pending.length, 0);

  const split = takeEvents(click.subarray(0, 1));
  assert.equal(split.events.length, 0);
  assert.equal(split.pending.length, 1);
  const rest = takeEvents(Buffer.concat([split.pending, click.subarray(1)]));
  assert.equal(rest.events.length, 1);
  assert.equal(rest.events[0]?.mouse?.x, 15);
  assert.equal(rest.events.some((event) => /\d/.test(event.key)), false);

  const tail = takeEvents(Buffer.from('<32;15;3M'));
  assert.equal(tail.events.length, 1);
  assert.equal(tail.events[0]?.mouse?.button, 32);
  assert.equal(tail.events[0]?.key, '');

  const burst = Buffer.concat(Array.from({ length: 30 }, () => Buffer.from('\x1b[<32;40;8M\x1b[<0;40;8m')));
  const moved = takeEvents(burst);
  assert.equal(moved.events.length, 60);
  assert.equal(moved.events.every((event) => event.mouse && event.key === ''), true);

  const typed = takeEvents(Buffer.from('q1'));
  assert.deepEqual(typed.events.map((event) => event.key), ['q', '1']);

  const alt = takeEvents(Buffer.from('\x1bq'));
  assert.deepEqual(alt.events.map((event) => event.key), ['\x1b', 'q']);
  assert.equal(alt.pending.length, 0);
});

test('a saved Eastern day in the past returns to today', () => {
  const settings: TuiSettings = {
    version: 1,
    action: 'start',
    dateMode: 'day',
    day: '2026-11-18',
    model: 'jev',
    oddsSource: 'books',
    fresh: false,
  };
  const past = formFromSettings(settings, '2026-11-20');
  assert.equal(past.day, '2026-11-20');
  assert.equal(past.dateMode, 'current');
  const later = formFromSettings({ ...settings, day: '2026-11-22' }, '2026-11-20');
  assert.equal(later.day, '2026-11-22');
  assert.equal(later.dateMode, 'day');
});

test('npm run tui without a terminal exits 1', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/tui.ts'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString('utf8');
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 1);
  assert.match(err, /needs a terminal/);
});
