import { pathToFileURL } from 'node:url';

/** True when this module is the process entry, not an import from the launcher or a test. */
export function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return metaUrl === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}
