// Deletes every entry in snapshots/. Does not call an API.
// Leaves runs/last-run.json and odds-cache/ in place.
// run: npm run clear-snapshots
import { lstat, readdir, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const snapshotDir = fileURLToPath(new URL('../snapshots/', import.meta.url));

let names: string[];
try {
  names = await readdir(snapshotDir);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'ENOENT') {
    console.log('No snapshots folder. Nothing to remove.');
    process.exit(0);
  }
  throw error;
}

if (!names.length) {
  console.log('snapshots/ is already empty.');
  process.exit(0);
}

for (const name of names) {
  const path = join(snapshotDir, name);
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) await unlink(path);
  else await rm(path, { recursive: true });
  console.log(`Removed snapshots/${name}`);
}

const count = names.length;
console.log(`Removed ${count} ${count === 1 ? 'entry' : 'entries'} from snapshots/.`);
