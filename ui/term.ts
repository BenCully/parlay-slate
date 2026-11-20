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

type InputEvent = { key: string; mouse?: MouseEvent };

function takeInput(pending: Buffer): { pending: Buffer; event: InputEvent | null; wait: boolean } {
  if (!pending.length) return { pending, event: null, wait: false };
  if (pending[0] !== 0x1b) {
    return { pending: pending.subarray(1), event: { key: String.fromCharCode(pending[0]) }, wait: false };
  }
  if (pending.length < 3) return { pending, event: null, wait: true };
  if (pending[1] === 0x5b && pending[2] === 0x3c) {
    const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(pending.toString('utf8'));
    if (!match) {
      if (pending.length > 64) return { pending: pending.subarray(1), event: { key: '\x1b' }, wait: false };
      return { pending, event: null, wait: true };
    }
    return {
      pending: pending.subarray(Buffer.byteLength(match[0])),
      event: {
        key: '',
        mouse: { button: Number(match[1]), x: Number(match[2]), y: Number(match[3]), release: match[4] === 'm' },
      },
      wait: false,
    };
  }
  if (pending[1] === 0x5b && pending[2] === 0x4d) {
    if (pending.length < 6) return { pending, event: null, wait: true };
    const button = pending[3] - 32;
    return {
      pending: pending.subarray(6),
      event: {
        key: '',
        mouse: {
          button,
          x: pending[4] - 32,
          y: pending[5] - 32,
          release: (button & 3) === 3 && (button & 64) === 0,
        },
      },
      wait: false,
    };
  }
  const match = /^\x1b\[[\d;]*[A-Za-z~]/.exec(pending.toString('utf8'));
  if (!match) {
    if (pending.length > 16) return { pending: pending.subarray(1), event: { key: '\x1b' }, wait: false };
    return { pending, event: null, wait: true };
  }
  return {
    pending: pending.subarray(Buffer.byteLength(match[0])),
    event: { key: match[0] },
    wait: false,
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
      if (event.mouse) handlers.onMouse(event.mouse);
      else handlers.onKey(event.key);
    };

    const pump = () => {
      for (;;) {
        const next = takeInput(pending);
        pending = next.pending as typeof pending;
        if (!next.event) break;
        dispatch(next.event);
        if (session.closed) return;
      }
      if (session.closed || pending.length !== 1 || pending[0] !== 0x1b) return;
      escTimer = setTimeout(() => {
        escTimer = undefined;
        if (session.closed || pending.length !== 1 || pending[0] !== 0x1b) return;
        pending = pending.subarray(1) as typeof pending;
        dispatch({ key: '\x1b' });
      }, 50);
    };

    const onData = (chunk: Buffer) => {
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = undefined;
      }
      pending = Buffer.concat([pending, chunk]);
      pump();
    };

    const onResize = () => {
      if (session.closed) return;
      process.stdout.write(`${paintOn}\x1b[2J\x1b[H`);
      handlers.draw();
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
