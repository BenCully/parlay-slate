// Opens jev and tail-jev snapshots for one day. Does not call an API.
// run: npm run compare -- 2026-11-15
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { showComparison } from '../ui/compare.js';
import type { SavedSlate } from '../ui/screen.js';
import type { ScreenClose } from '../ui/term.js';
import { isDirectRun } from './entry.js';

const snapshotDir = fileURLToPath(new URL('../snapshots/', import.meta.url));

export function missingCompareLines(day: string, model: string) {
  const path = `${snapshotDir}${day}-${model}.json`;
  return [
    `Missing ${path}`,
    `Run npm run slate -- ${day} model=${model}`,
    `Or npm start -- ${day} model=${model}`,
    `Or npm start -- odds=${day} model=${model}`,
  ];
}

export async function compareSnapshots(day: string): Promise<ScreenClose> {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error('Usage: npm run compare -- YYYY-MM-DD');
  }
  const missing: string[] = [];
  const load = async (model: string) => {
    const path = `${snapshotDir}${day}-${model}.json`;
    try {
      return JSON.parse(await readFile(path, 'utf8')) as SavedSlate;
    } catch {
      missing.push(...missingCompareLines(day, model));
      return null;
    }
  };
  const jev = await load('jev');
  const tail = await load('tail-jev');
  if (!jev || !tail) throw new Error(missing.join('\n'));
  return showComparison(jev, tail);
}

if (isDirectRun(import.meta.url)) {
  const day = process.argv.slice(2).find((arg) => arg !== '--') ?? '';
  compareSnapshots(day).catch((error) => {
    const message = error instanceof Error ? error.message : 'Usage: npm run compare -- YYYY-MM-DD';
    for (const line of message.split('\n')) console.error(line);
    process.exit(1);
  });
}
