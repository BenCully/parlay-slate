import { withAltScreen, type MouseEvent } from '../term.js';
import { pickLogo } from './logo.js';

export const REVEAL_MS = 1200;
export const HOLD_MS = 300;
export const SPLASH_MS = REVEAL_MS + HOLD_MS;
const FRAME_MS = 1000 / 30;
const EDGE = 3;

export function visibleColumns(progress: number, width: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.round(clamped * width);
}

/** Columns at `visible` are drawn. The last three of those are bold unless `boldEdge` is false. */
export function sliceLogo(lines: string[], visible: number, boldEdge: boolean) {
  return lines.map((line) => {
    const shown = line.slice(0, Math.max(0, visible)).padEnd(line.length, ' ');
    if (!boldEdge || visible <= 0) return shown;
    const edgeStart = Math.max(0, visible - EDGE);
    return `${shown.slice(0, edgeStart)}\x1b[1m${shown.slice(edgeStart, visible)}\x1b[22m${shown.slice(visible)}`;
  });
}

export function splashOrigin(columns: number, rows: number, width: number, height: number) {
  return {
    left: Math.max(1, Math.floor((columns - width) / 2) + 1),
    top: Math.max(1, Math.floor((rows - height - 2) / 2) + 1),
  };
}

export function noMotion(env: NodeJS.ProcessEnv = process.env) {
  const value = env.PARLAY_SLATE_NO_ANIM;
  return value != null && value !== '' && value !== '0';
}

export function planSplash(input: { noSplash: boolean; noAnim: boolean; noColor: boolean; columns: number; rows: number }) {
  if (input.noSplash) return { kind: 'skip' as const };
  const logo = pickLogo(input.columns, input.rows);
  if (input.noAnim || !logo.animate) return { kind: 'static' as const, ms: SPLASH_MS, lines: logo.lines };
  return { kind: 'wipe' as const, revealMs: REVEAL_MS, holdMs: HOLD_MS, lines: logo.lines, bold: !input.noColor };
}

export function createSplashPlayer(input: { lines: string[]; animate: boolean; bold: boolean }) {
  let skipped = false;
  return {
    get skipped() {
      return skipped;
    },
    skip() {
      skipped = true;
    },
    frame(elapsed: number): { done: boolean; lines: string[]; hint?: string } {
      if (skipped) return { done: true, lines: [] };
      if (elapsed >= SPLASH_MS) return { done: true, lines: input.lines, hint: 'press any key' };
      if (!input.animate || elapsed >= REVEAL_MS) return { done: false, lines: input.lines, hint: 'press any key' };
      const width = input.lines[0]?.length ?? 0;
      return { done: false, lines: sliceLogo(input.lines, visibleColumns(elapsed / REVEAL_MS, width), input.bold) };
    },
  };
}

function leftClick(mouse: MouseEvent) {
  return !mouse.release && (mouse.button & 64) === 0 && (mouse.button & 67) === 0;
}

function paintFrame(elapsed: number, noAnim: boolean, noColor: boolean) {
  const columns = Math.max(1, process.stdout.columns || 80);
  const rows = Math.max(1, process.stdout.rows || 24);
  const logo = pickLogo(columns, rows);
  const animate = logo.animate && !noAnim;
  const hint = !animate || elapsed >= REVEAL_MS;
  const lines = animate && elapsed < REVEAL_MS
    ? sliceLogo(logo.lines, visibleColumns(elapsed / REVEAL_MS, logo.lines[0]?.length ?? 0), !noColor)
    : logo.lines;
  const origin = splashOrigin(columns, rows, Math.max(...logo.lines.map((line) => line.length)), lines.length);
  let out = '';
  for (const [index, line] of lines.entries()) out += `\x1b[${origin.top + index};${origin.left}H${line}`;
  if (hint) out += `\x1b[${origin.top + lines.length + 1};${origin.left}Hpress any key`;
  process.stdout.write(out);
}

/** Ctrl-C leaves the launcher. Any other key skips the logo. */
export function splashKeyAction(key: string): 'interrupt' | 'skip' {
  return key === '\u0003' ? 'interrupt' : 'skip';
}

/** Column wipe, then a short hold. Any key or a left click skips. Ctrl-C exits. Keeps the alt screen up for the options screen. */
export function playSplash(): Promise<'done' | 'interrupt'> {
  const noAnim = noMotion();
  const noColor = process.env.NO_COLOR != null;
  let interrupted = false;
  return withAltScreen((session) => {
    const started = performance.now();
    let timer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      session.restore({ leaveAlt: false });
    };
    const tick = () => {
      if (session.closed) return;
      const elapsed = performance.now() - started;
      if (elapsed >= SPLASH_MS) {
        finish();
        return;
      }
      paintFrame(elapsed, noAnim, noColor);
      timer = setTimeout(tick, FRAME_MS);
    };
    timer = setTimeout(tick, FRAME_MS);
    return {
      draw() {
        if (!session.closed) paintFrame(performance.now() - started, noAnim, noColor);
      },
      onKey(key) {
        if (splashKeyAction(key) === 'interrupt') {
          interrupted = true;
          if (timer) clearTimeout(timer);
          timer = undefined;
          session.restore();
          return;
        }
        finish();
      },
      onMouse(mouse) {
        if (leftClick(mouse)) finish();
      },
    };
  }, { color: !noColor }).then(() => (interrupted ? 'interrupt' : 'done'));
}
