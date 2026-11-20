import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { TuiTest } from '@microsoft/tui-test';
import { withTerminal, type CreateTerminalOptions } from '@microsoft/tui-test/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/slate.json', import.meta.url));
const backend = 'alacritty' as const;
const timeouts = { text: 20_000, idle: 8_000, command: 30_000, exit: 15_000, ready: 20_000 };
const limit = { timeout: 120_000 };

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.TERM = 'xterm-256color';
  env.PARLAY_SLATE_NO_ANIM = '1';
  return env;
}

function terminalOptions(program: string[], cols: number, rows: number): CreateTerminalOptions {
  return {
    backend,
    cols,
    rows,
    cwd: root,
    env: childEnv(),
    program,
    timeouts,
    artifacts: { dir: '/tmp/parlay-slate-tui', onFailure: 'text' },
  };
}

function viewProgram() {
  return [process.execPath, '--import', 'tsx', 'scripts/view.ts', fixture];
}

function launcherProgram(args: string[] = []) {
  return [process.execPath, '--import', 'tsx', 'scripts/tui.ts', ...args];
}

async function headerLine(terminal: TuiTest) {
  return (await terminal.text()).split('\n')[0] ?? '';
}

async function assertInverse(terminal: TuiTest, label: string) {
  await terminal.getByText(label).getByStyle({ inverse: true }).expect();
}

async function assertLinesFit(terminal: TuiTest) {
  const size = await terminal.getSize();
  const cells = await terminal.cells(0, 0, size.cols, size.rows);
  for (let y = 0; y < size.rows; y++) {
    const last = cells.find((cell) => cell.y === y && cell.x === size.cols - 1);
    const char = last?.char ?? ' ';
    assert.equal(char === ' ' || char === '', true, `row ${y} uses the last column ${JSON.stringify(char)}`);
  }
}

async function scrollbar(terminal: TuiTest) {
  const size = await terminal.getSize();
  const cells = await terminal.cells(0, 0, size.cols, size.rows);
  const marks = cells.filter((cell) => cell.char === '█' || cell.char === '░');
  assert.ok(marks.length > 1, `scrollbar is missing\n${await terminal.text()}`);
  const counts = new Map<number, number>();
  for (const mark of marks) counts.set(mark.x, (counts.get(mark.x) ?? 0) + 1);
  const column = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  assert.ok(column);
  const ys = marks.filter((cell) => cell.x === column[0]).map((cell) => cell.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  assert.ok(bottom > top, 'scrollbar has no travel');
  return { x: column[0], top, bottom };
}

async function quit(terminal: TuiTest) {
  await terminal.keyboard.press('q');
  await terminal.waitExit();
}

test('a click lands on the league, the props tab, and the close button', limit, async () => {
  await withTerminal(terminalOptions(viewProgram(), 100, 30), async (terminal) => {
    await terminal.getByText('Football').expect();
    await terminal.getByText('Games').expect();
    await terminal.getByText('NCAA').click();
    await assertInverse(terminal, 'NCAA');
    await terminal.getByText('NCAA games marker').expect();
    await terminal.getByText('Props').click();
    await assertInverse(terminal, 'Props');
    await terminal.getByText('NCAA props marker').expect();
    await terminal.getByText('x').unique().click();
    await terminal.waitExit();
  });
});

test('keyboard matches the click', limit, async () => {
  await withTerminal(terminalOptions(viewProgram(), 100, 30), async (terminal) => {
    await terminal.getByText('Football').expect();
    await terminal.keyboard.press(']');
    await assertInverse(terminal, 'Soccer');
    await terminal.keyboard.press('2');
    await assertInverse(terminal, 'Props');
    await terminal.getByText('Soccer props marker').expect();
    await quit(terminal);
  });
});

test('the wheel hides the first row and a scrollbar drag jumps back', limit, async () => {
  await withTerminal(terminalOptions(viewProgram(), 100, 30), async (terminal) => {
    await terminal.getByText('NFL slate marker').expect();
    await terminal.getByText('Later Team').wait({ state: 'hidden' });
    await terminal.mouse.scroll('down');
    await terminal.getByText('Later Team').expect();
    await terminal.getByText('NFL slate marker').wait({ state: 'hidden' });
    const bar = await scrollbar(terminal);
    await terminal.mouse.drag(bar.x, bar.bottom, bar.x, bar.top);
    await terminal.getByText('NFL slate marker').expect();
    await terminal.getByText('Later Team').wait({ state: 'hidden' });
    await quit(terminal);
  });
});

test('sport names fit at 100 columns and shorten when the row does not', limit, async () => {
  await withTerminal(terminalOptions(viewProgram(), 100, 30), async (terminal) => {
    await terminal.getByText('Football').expect();
    const wide = await headerLine(terminal);
    assert.match(wide, /Football/);
    assert.match(wide, /Soccer/);
    assert.match(wide, /Basketball/);
    assert.match(wide, /Baseball/);
    assert.match(wide, /Formula 1/);
    assert.equal(wide.includes(' FB '), false);
    await assertLinesFit(terminal);
    await terminal.resize(70, 30);
    await terminal.getByText('FB').expect();
    await terminal.getByText('Formula 1').wait({ state: 'hidden' });
    const narrow = await headerLine(terminal);
    assert.match(narrow, / FB /);
    assert.match(narrow, / Soc /);
    assert.match(narrow, / Hockey /);
    assert.match(narrow, / Bask /);
    assert.match(narrow, / Base /);
    assert.match(narrow, / F1 /);
    assert.equal(narrow.includes('Football'), false);
    assert.equal(narrow.includes('Soccer'), false);
    assert.equal(narrow.includes('Basketball'), false);
    assert.equal(narrow.includes('Baseball'), false);
    assert.equal(narrow.includes('Formula 1'), false);
    await assertLinesFit(terminal);
    await quit(terminal);
  });
});

test('q on the launcher exits', limit, async () => {
  await withTerminal(terminalOptions(launcherProgram(), 100, 30), async (terminal) => {
    await terminal.getByText('Start slate').expect();
    await quit(terminal);
  });
});

test('q on a viewed slate returns to the options screen', limit, async () => {
  await withTerminal(terminalOptions(launcherProgram([fixture]), 100, 30), async (terminal) => {
    await terminal.getByText('Start slate').expect();
    await assertInverse(terminal, 'View snapshot');
    const start = await terminal.getByText('Start slate').getByStyle({ inverse: true }).locations();
    assert.equal(start.length, 0);
    await terminal.getByText('slate.json').first().expect();
    await terminal.keyboard.press('r');
    await terminal.getByText('Football').expect();
    await terminal.getByText('Games').expect();
    await terminal.keyboard.press('q');
    await terminal.getByText('Start slate').expect();
    await terminal.getByText('Football').wait({ state: 'hidden' });
    await quit(terminal);
  });
});

test('ctrl-c on a launcher slate exits', limit, async () => {
  await withTerminal(terminalOptions(launcherProgram([fixture]), 100, 30), async (terminal) => {
    await terminal.getByText('View snapshot').getByStyle({ inverse: true }).expect();
    await terminal.keyboard.press('r');
    await terminal.getByText('Football').expect();
    await terminal.keyboard.press('Ctrl+C');
    await terminal.waitExit();
  });
});
