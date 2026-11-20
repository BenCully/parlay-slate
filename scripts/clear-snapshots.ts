// Deletes every entry in snapshots/, including snapshots/archive/. Does not call an API.
// Leaves runs/last-run.json and odds-cache/ in place.
// run: npm run clear-snapshots
import { lstat, readdir, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirectRun } from './entry.js';

const snapshotDir = fileURLToPath(new URL('../snapshots/', import.meta.url));

export async function clearSnapshots(): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(snapshotDir);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT') return ['No snapshots folder. Nothing to remove.'];
    throw error;
  }

  if (!names.length) return ['snapshots/ is already empty.'];

  const lines: string[] = [];
  for (const name of names) {
    const path = join(snapshotDir, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) await unlink(path);
    else await rm(path, { recursive: true });
    lines.push(`Removed snapshots/${name}`);
  }
  const count = names.length;
  lines.push(`Removed ${count} ${count === 1 ? 'entry' : 'entries'} from snapshots/.`);
  return lines;
}

if (isDirectRun(import.meta.url)) {
  clearSnapshots()
    .then((lines) => {
      for (const line of lines) console.log(line);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Could not clear snapshots.');
      process.exit(1);
    });
}
