// Figlet 1.12.0 Standard and Small, generated 2026-11-19. Not a runtime dependency.

export const STANDARD_WIDTH = 56;
export const SMALL_WIDTH = 48;

export const STANDARD = [
  '  ____            _               ____  _       _       ',
  ' |  _ \\ __ _ _ __| | __ _ _   _  / ___|| | __ _| |_ ___ ',
  " | |_) / _` | '__| |/ _` | | | | \\___ \\| |/ _` | __/ _ \\",
  ' |  __/ (_| | |  | | (_| | |_| |  ___) | | (_| | ||  __/',
  ' |_|   \\__,_|_|  |_|\\__,_|\\__, | |____/|_|\\__,_|\\__\\___|',
  '                          |___/                         ',
];

export const SMALL = [
  '  ___          _             ___ _      _       ',
  ' | _ \\__ _ _ _| |__ _ _  _  / __| |__ _| |_ ___ ',
  " |  _/ _` | '_| / _` | || | \\__ \\ / _` |  _/ -_)",
  ' |_| \\__,_|_| |_\\__,_|\\_, | |___/_\\__,_|\\__\\___|',
  '                      |__/                      ',
];

export const ONE_LINE = ['Parlay Slate'];

export function pickLogo(columns: number, rows: number): { kind: 'standard' | 'small' | 'line'; lines: string[]; animate: boolean } {
  if (columns >= STANDARD_WIDTH && rows >= 8) return { kind: 'standard', lines: STANDARD, animate: true };
  if (columns >= SMALL_WIDTH && rows >= 7) return { kind: 'small', lines: SMALL, animate: true };
  return { kind: 'line', lines: ONE_LINE, animate: false };
}
