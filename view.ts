import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { showSlate, type SavedSlate } from './ui/screen.js';

const path = fileURLToPath(new URL('./last-run.json', import.meta.url));

let saved: SavedSlate;
try {
  saved = JSON.parse(await readFile(path, 'utf8')) as SavedSlate;
} catch {
  console.error('No saved slate. Run npm start once, then npm run view.');
  process.exit(1);
}

await showSlate(saved);
