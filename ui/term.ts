// Shared alt screen, raw stdin, and mouse parsing. Stdin stays a Buffer.
// Do not call setEncoding: a utf8 decoder splits mouse bytes.
import type { Readable } from 'node:stream';

export const theme = '\x1b[40m\x1b[97m\x1b[48;2;0;0;0m\x1b[38;2;255;255;255m';

const enableMouse = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const disableMouse = '\x1b[?1002l\x1b[?1000l\x1b[?1006l';

export type ScreenClose = 'quit' | 'interrupt';

export type MouseEvent = {
  button: number;
  x: number;
  y: number;
  release: boolean;
};

export type AltSession = {
  readonly closed: boolean;
  /** Leave raw mode and mouse tracking. `leaveAlt: false` keeps the alternate screen up for the next session. */
  restore: (options?: { leaveAlt?: boolean }) => void;
};

export type AltHandlers = {
  draw: () => void;
  onKey: (key: string) => void;
  onMouse: (mouse: MouseEvent) => void;
};

export type InputEvent = { key: string; mouse?: MouseEvent };

const SGR = /^\x1b\[<(\d+);(\d+);(\d+)(?:;\d+)*([Mm])/;
const SGR_TAIL = /^<(\d+);(\d+);(\d+)(?:;\d+)*([Mm])/;

function mouseEvent(button: number, x: number, y: number, release: boolean): InputEvent {
  return { key: '', mouse: { button, x, y, release } };
}

/**
 * Pull every complete key or mouse report out of a stdin chunk.
 * A split SGR report stays buffered. A tail left after a lost escape (`<0;1;2M`)
 * is still a mouse report, not digit keys, so a click cannot change tabs.
 */
export function takeEvents(input: Buffer): { pending: Buffer; events: InputEvent[] } {
  const events: InputEvent[] = [];
  let pending = input;
  while (pending.length) {
    if (pending[0] === 0x3c) {
      const text = pending.toString('utf8');
      const tail = SGR_TAIL.exec(text);
      if (tail?.index === 0) {
        events.push(mouseEvent(Number(tail[1]), Number(tail[2]), Number(tail[3]), tail[4] === 'm'));
        pending = pending.subarray(Buffer.byteLength(tail[0]));
        continue;
      }
      if (/^<\d+(;\d+)+$/.test(text) && pending.length < 48) break;
      events.push({ key: '<' });
      pending = pending.subarray(1);
      continue;
    }
    if (pending[0] !== 0x1b) {
      events.push({ key: String.fromCharCode(pending[0]!) });
      pending = pending.subarray(1);
      continue;
    }
    // Alt+key is one event. No screen binds it, so it is ignored. A lone Esc waits for the timer.
    if (pending.length >= 2 && pending[1] !== 0x5b && pending[1] !== 0x4f) {
      events.push({ key: `\x1b${String.fromCharCode(pending[1]!)}` });
      pending = pending.subarray(2);
      continue;
    }
    if (pending.length < 3) break;
    if (pending[1] === 0x5b && pending[2] === 0x3c) {
      const text = pending.toString('utf8');
      const match = SGR.exec(text);
      if (match?.index === 0) {
        events.push(mouseEvent(Number(match[1]), Number(match[2]), Number(match[3]), match[4] === 'm'));
        pending = pending.subarray(Buffer.byteLength(match[0]));
        continue;
      }
      if (/^\x1b\[<\d*(;\d+)*$/.test(text) && pending.length < 64) break;
      pending = pending.subarray(1);
      continue;
    }
    if (pending[1] === 0x5b && pending[2] === 0x4d) {
      if (pending.length < 6) break;
      const button = pending[3]! - 32;
      events.push(mouseEvent(button, pending[4]! - 32, pending[5]! - 32, (button & 3) === 3 && (button & 64) === 0));
      pending = pending.subarray(6);
      continue;
    }
    const text = pending.toString('utf8');
    const match = /^\x1b\[[\d;]*[A-Za-z~]/.exec(text);
    if (match?.index === 0) {
      events.push({ key: match[0] });
      pending = pending.subarray(Buffer.byteLength(match[0]));
      continue;
    }
    if (pending.length <= 16 && /^\x1b\[[\d;]*$/.test(text)) break;
    if (pending[1] !== 0x5b) {
      events.push({ key: '\x1b' });
      pending = pending.subarray(1);
      continue;
    }
    pending = pending.subarray(1);
  }
  return { pending, events };
}

/** Overwrite the visible rows in place. A full clear scrolls some terminals and looks like flicker. */
export function paintScreen(lines: string[], options?: { color?: boolean }) {
  const rows = Math.max(1, process.stdout.rows || lines.length || 1);
  const color = options?.color !== false;
  let out = color ? theme : '\x1b[0m';
  for (let row = 0; row < rows; row++) {
    out += `\x1b[${row + 1};1H${color ? theme : ''}${lines[row] ?? ''}\x1b[K`;
  }
  process.stdout.write(out);
}

export function runPaint(session: AltSession, paint: () => void) {
  try {
    paint();
  } catch (error) {
    if (!session.closed) session.restore();
    console.error(error instanceof Error ? error.message : 'The screen failed.');
    process.exit(1);
  }
}

/** One paint for a burst of mouse reports, after the current chunk has been handled. */
export function schedulePaint(session: AltSession, paint: () => void) {
  let queued = false;
  return () => {
    if (queued || session.closed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!session.closed) runPaint(session, paint);
    });
  };
}

/**
 * Take over the terminal until `session.restore()`. Resize clears once and calls `draw`.
 * Callers draw their own frames. A lone Escape is delivered after a short wait so arrow keys still parse.
 */
export function withAltScreen(
  setup: (session: AltSession) => AltHandlers,
  options?: { color?: boolean },
): Promise<void> {
  const stdin = process.stdin as Readable & { setRawMode?: (mode: boolean) => void };
  const color = options?.color !== false;
  return new Promise((resolve) => {
    let closed = false;
    let pending = Buffer.alloc(0);
    let escTimer: NodeJS.Timeout | undefined;
    const handlers = { draw() {}, onKey(_key: string) {}, onMouse(_mouse: MouseEvent) {} };
    const paintOn = color ? theme : '\x1b[0m';

    const session: AltSession = {
      get closed() {
        return closed;
      },
      restore(choice) {
        if (closed) return;
        closed = true;
        if (escTimer) clearTimeout(escTimer);
        process.stdout.off('resize', onResize);
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        stdin.off('data', onData);
        if (process.stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
        stdin.pause();
        const leave = choice?.leaveAlt !== false;
        process.stdout.write(`\x1b[0m${disableMouse}\x1b[?25h${leave ? '\x1b[?1049l' : ''}`);
        resolve();
      },
    };

    const onSignal = () => {
      session.restore();
      process.exit(130);
    };

    const dispatch = (event: InputEvent) => {
      if (session.closed) return;
      try {
        if (event.mouse) handlers.onMouse(event.mouse);
        else handlers.onKey(event.key);
      } catch (error) {
        if (!session.closed) session.restore();
        console.error(error instanceof Error ? error.message : 'The screen failed.');
        process.exit(1);
      }
    };

    const pump = () => {
      const next = takeEvents(pending);
      pending = next.pending as typeof pending;
      for (const event of next.events) {
        dispatch(event);
        if (session.closed) return;
      }
      if (session.closed || pending.length !== 1 || pending[0] !== 0x1b) return;
      escTimer = setTimeout(() => {
        escTimer = undefined;
        if (session.closed || pending.length !== 1 || pending[0] !== 0x1b) return;
        pending = Buffer.alloc(0);
        dispatch({ key: '\x1b' });
      }, 200);
    };

    const onData = (chunk: Buffer) => {
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = undefined;
      }
      pending = Buffer.concat([pending, chunk]);
      pump();
    };

    let seenCols = process.stdout.columns || 0;
    let seenRows = process.stdout.rows || 0;
    let resizing = false;
    const onResize = () => {
      if (resizing || session.closed) return;
      const nextCols = process.stdout.columns || 0;
      const nextRows = process.stdout.rows || 0;
      if (nextCols === seenCols && nextRows === seenRows) return;
      seenCols = nextCols;
      seenRows = nextRows;
      resizing = true;
      try {
        process.stdout.write(`${paintOn}\x1b[2J\x1b[H`);
        handlers.draw();
      } catch (error) {
        if (!session.closed) session.restore();
        console.error(error instanceof Error ? error.message : 'The screen failed.');
        process.exit(1);
      } finally {
        resizing = false;
      }
    };

    Object.assign(handlers, setup(session));
    process.stdout.write(`\x1b[?1049h\x1b[?25l${enableMouse}${paintOn}\x1b[2J\x1b[H`);
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    process.stdout.on('resize', onResize);
    stdin.on('data', onData);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    handlers.draw();
  });
}
