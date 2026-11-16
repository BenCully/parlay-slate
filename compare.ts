// Opens jev and tail-jev snapshots for one day. Does not call an API.
// run: npm run compare -- 2026-11-15
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { showComparison } from './ui/compare.js';
import type { SavedSlate } from './ui/screen.js';

const day = process.argv.slice(2).find((arg) => arg !== '--');
if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error('Usage: npm run compare -- YYYY-MM-DD');
  process.exit(1);
}

const snapshotDir = fileURLToPath(new URL('./snapshots/', import.meta.url));

async function load(model: string) {
  const path = `${snapshotDir}${day}-${model}.json`;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as SavedSlate;
  } catch {
    console.error(`Missing ${path}`);
    console.error(`Run npm start -- ${day} model=${model}`);
    console.error(`Or npm start -- odds=${day} model=${model}`);
    return null;
  }
}

const jev = await load('jev');
const tail = await load('tail-jev');
if (!jev || !tail) process.exit(1);
await showComparison(jev, tail);
