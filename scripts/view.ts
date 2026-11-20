import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showSlate, type SavedSlate } from '../ui/screen.js';
import type { ScreenClose } from '../ui/term.js';
import { isDirectRun } from './entry.js';

const lastRunPath = fileURLToPath(new URL('../runs/last-run.json', import.meta.url));

export function slateFile(name?: string) {
  if (!name) return lastRunPath;
  if (name.endsWith('.json')) return resolve(name);
  return fileURLToPath(new URL(`../snapshots/${name}.json`, import.meta.url));
}

export function missingSlateLines(path: string) {
  return [
    `No saved slate at ${path}.`,
    'npm start writes runs/last-run.json and snapshots/<day>-<model>.json.',
    'npm run view opens the latest run. npm run view -- 2026-11-15-jev opens that snapshot.',
  ];
}

export async function viewSavedSlate(name?: string): Promise<ScreenClose> {
  const path = slateFile(name);
  let saved: SavedSlate;
  try {
    saved = JSON.parse(await readFile(path, 'utf8')) as SavedSlate;
  } catch {
    const error = new Error(missingSlateLines(path).join('\n'));
    throw error;
  }
  return showSlate(saved);
}

if (isDirectRun(import.meta.url)) {
  const arg = process.argv.slice(2).find((item) => item !== '--');
  viewSavedSlate(arg).catch((error) => {
    const lines = error instanceof Error ? error.message.split('\n') : missingSlateLines(slateFile(arg));
    for (const line of lines) console.error(line);
    process.exit(1);
  });
}
