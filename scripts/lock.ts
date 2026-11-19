// One npm start at a time. The lock is runs/slate.lock, and it holds the process id.
// A second start exits. A lock whose process is gone is taken over.
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const lockName = 'slate.lock';

function heldBy(pid: number | null) {
  if (pid == null) return 'Another npm start is already running. Stop that process, or remove runs/slate.lock if it is gone.';
  return `Another npm start is already running (pid ${pid}). Stop that process before starting another.`;
}

async function readHolder(path: string): Promise<number | null> {
  try {
    const text = await readFile(path, 'utf8');
    const pid = Number(text.split('\n')[0]);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    return code === 'EPERM';
  }
}

async function take(path: string, reclaimed: boolean): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'wx');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'EEXIST') throw error;
    const pid = await readHolder(path);
    if (!reclaimed && pid != null && !pidAlive(pid)) {
      await rm(path, { force: true });
      return take(path, true);
    }
    throw new Error(heldBy(pid));
  }
  try {
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
  } catch (error) {
    await handle.close();
    await rm(path, { force: true });
    throw error;
  }
  await handle.close();
}

/** Hold runs/slate.lock until the returned function runs. The second caller throws. */
export async function acquireRunLock(dir: string): Promise<() => Promise<void>> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, lockName);
  await take(path, false);
  return async () => {
    const pid = await readHolder(path);
    if (pid !== process.pid) return;
    await rm(path, { force: true });
  };
}
