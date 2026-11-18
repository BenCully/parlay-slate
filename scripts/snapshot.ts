// The compare screen reads snapshots/<day>-<model>.json. A new run of that day and model
// copies the previous file into snapshots/archive/ before it replaces that name.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function writeAtomic(path: string, body: string) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, body);
  await rename(temp, path);
}

function savedAtOf(body: string) {
  try {
    const parsed = JSON.parse(body) as { savedAt?: unknown };
    if (typeof parsed.savedAt === 'string' && Number.isFinite(Date.parse(parsed.savedAt))) return parsed.savedAt;
  } catch {
    return new Date().toISOString();
  }
  return new Date().toISOString();
}

/** 2026-11-18T15:00:00.000Z becomes 2026-11-18T150000Z. */
export function archiveStamp(iso: string) {
  const parsed = Date.parse(iso);
  const source = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return source.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '');
}

/**
 * Write snapshots/<label>-<model>.json.
 * When that file already exists and the new body differs, the old body is kept under snapshots/archive/.
 */
export async function saveDecisionSnapshot(dir: string, label: string, model: string, saved: unknown): Promise<{ path: string; archived?: string }> {
  const fileName = `${label}-${model}.json`;
  const body = `${JSON.stringify(saved, null, 2)}\n`;
  await mkdir(dir, { recursive: true });
  const path = join(dir, fileName);
  const archived = await archivePrevious(dir, fileName, body);
  await writeAtomic(path, body);
  return archived ? { path, archived } : { path };
}

async function archivePrevious(dir: string, fileName: string, nextBody: string) {
  let previous: string;
  try {
    previous = await readFile(join(dir, fileName), 'utf8');
  } catch {
    return undefined;
  }
  if (previous === nextBody) return undefined;
  const stamp = archiveStamp(savedAtOf(previous));
  const archiveDir = join(dir, 'archive');
  await mkdir(archiveDir, { recursive: true });
  const stem = fileName.replace(/\.json$/, '');
  let archivePath = join(archiveDir, `${stem}-${stamp}.json`);
  try {
    const existing = await readFile(archivePath, 'utf8');
    if (existing === previous) return undefined;
    archivePath = join(archiveDir, `${stem}-${stamp}-${process.pid}.json`);
  } catch {
    // This savedAt is not in the archive yet.
  }
  await writeAtomic(archivePath, previous);
  return archivePath;
}
