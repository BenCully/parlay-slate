import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showSlate, type SavedSlate } from './ui/screen.js';

const arg = process.argv.slice(2).find((item) => item !== '--');
const path = !arg
  ? fileURLToPath(new URL('./last-run.json', import.meta.url))
  : arg.endsWith('.json')
    ? resolve(arg)
    : fileURLToPath(new URL(`./snapshots/${arg}.json`, import.meta.url));

let saved: SavedSlate;
try {
  saved = JSON.parse(await readFile(path, 'utf8')) as SavedSlate;
} catch {
  console.error(`No saved slate at ${path}.`);
  console.error('npm start writes last-run.json and snapshots/<day>-<model>.json.');
  console.error('npm run view opens the latest run. npm run view -- 2026-11-15-jev opens that snapshot.');
  process.exit(1);
}

await showSlate(saved);
