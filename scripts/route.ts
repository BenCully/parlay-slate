const TUI_FLAGS = new Set(['--no-splash', '--tui', '--slate']);

const MODEL_ARG = /^(?:--)?model=/;
const ODDS_ARG = /^(?:--)?odds=/;
const DAY_ARG = /^\d{4}-\d{2}-\d{2}$/;

/** A user-supplied slate argument. A defaulted model is not one of these. */
export function isSlateArg(arg: string) {
  if (arg === '--fresh') return true;
  if (MODEL_ARG.test(arg)) return true;
  if (ODDS_ARG.test(arg)) return true;
  return DAY_ARG.test(arg);
}

export type StartRoute =
  | { mode: 'tui'; splash: boolean; prefill: string[] }
  | { mode: 'slate'; args: string[] };

/**
 * Bare arguments open the launcher. Slate arguments bypass it.
 * `--slate` wins over `--tui`. `--no-splash`, `--tui`, and `--slate` are not slate arguments.
 */
export function classifyStart(argv: string[]): StartRoute {
  const forceTui = argv.includes('--tui');
  const forceSlate = argv.includes('--slate');
  const rest = argv.filter((arg) => arg !== '--' && !TUI_FLAGS.has(arg));
  if (forceSlate || (rest.some(isSlateArg) && !forceTui)) return { mode: 'slate', args: rest };
  return { mode: 'tui', splash: !argv.includes('--no-splash'), prefill: rest };
}
