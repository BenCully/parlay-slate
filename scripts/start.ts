// Bare `npm start` opens the launcher. Slate arguments run the slate directly.
import { readStartArgs } from '../decisions/judge.js';
import { launchTui } from '../ui/tui/launch.js';
import { classifyStart } from './route.js';
import { scrubError } from './scrub.js';

const route = classifyStart(process.argv.slice(2));

async function direct(args: string[]) {
  const { runSlate } = await import('./parlays.js');
  const parsed = readStartArgs(args);
  await runSlate({ day: parsed.day, model: parsed.model, odds: parsed.odds, fresh: parsed.fresh });
}

const opening = route.mode === 'slate' || !process.stdin.isTTY || !process.stdout.isTTY
  ? direct(route.mode === 'slate' ? route.args : [])
  : launchTui({ splash: route.splash, prefill: route.prefill });

opening.catch((error) => {
  console.error(scrubError(error, 'The slate failed.'));
  process.exit(1);
});
