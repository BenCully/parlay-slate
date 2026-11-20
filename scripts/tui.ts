// Always opens the launcher. A pipe prints how to run the slate and exits 1.
import { launchTui } from '../ui/tui/launch.js';
import { classifyStart } from './route.js';
import { scrubError } from './scrub.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('npm run tui needs a terminal. npm start or npm run slate will run the slate.');
  process.exit(1);
}

const route = classifyStart(process.argv.slice(2));
const opening = route.mode === 'slate'
  ? launchTui({ splash: !process.argv.includes('--no-splash'), prefill: route.args })
  : launchTui({ splash: route.splash, prefill: route.prefill });

opening.catch((error) => {
  console.error(scrubError(error, 'The launcher failed.'));
  process.exit(1);
});
