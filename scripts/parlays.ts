// Builds every sport in sports/index.ts, saves runs/last-run.json and a snapshot, and opens the screen.
// env: TYPESAFE_API_KEY, plus cache settings in .env.settings. Prices come from the books.
// run: npm run slate                              current slate, games that have not kicked off
//      npm run slate -- 2026-11-15                one Eastern calendar day
//      npm run slate -- 2026-11-15 model=jev      TypeSafe through jev-recipes (also the default)
//      npm run slate -- 2026-11-15 model=tail-jev Autojev on the tailnet (model=autojev is the same)
//      npm run slate -- odds=2026-11-15 model=jev prices saved that Eastern day, no live fetch
// npm start with those same arguments does this too. Bare npm start opens the launcher.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStartArgs, requireRunKeys, selectDecisionModel } from '../decisions/judge.js';
import { oddsSource, setOddsFresh, setOddsReplay } from '../odds/cache.js';
import { buildBoard, type BuiltBoard } from '../slate/board.js';
import { todayEastern } from '../slate/window.js';
import { showSlate, type SavedBoard, type SavedLeague, type SavedSlate, type SavedSport } from '../ui/screen.js';
import type { ScreenClose } from '../ui/term.js';
import { SPORTS, type LeagueDef } from '../sports/index.js';
import { isDirectRun } from './entry.js';
import { acquireRunLock } from './lock.js';
import { scrubError } from './scrub.js';
import { saveDecisionSnapshot } from './snapshot.js';

export type RunSlateOptions = {
  day?: string;
  model?: string;
  odds?: string;
  fresh?: boolean;
  /** Sets ODDS_SOURCE for this run only, then restores the previous value. */
  source?: string;
};

export type SlateRunResult = {
  built: boolean;
  close: ScreenClose;
  message: string;
};

function gamesOf(board: BuiltBoard): SavedBoard {
  return { title: board.title, groups: board.groups, note: board.note, ticketGroups: board.ticketGroups };
}

async function runLeague(league: LeagueDef, slateDay: string | undefined): Promise<{ league: SavedLeague; built: boolean }> {
  try {
    const board = await buildBoard(league.source, slateDay);
    return {
      built: true,
      league: { label: league.label, short: league.short, games: gamesOf(board), props: board.props },
    };
  } catch (error) {
    const safe = scrubError(error, 'This league failed.');
    console.error(`${league.label}: ${safe}`);
    return {
      built: false,
      league: {
        label: league.label,
        short: league.short,
        games: { title: league.label, groups: [], note: safe },
        props: { title: 'Player props', groups: [], note: safe },
      },
    };
  }
}

function currentSlate(sports: SavedSport[], model: SavedSlate['model'], odds: string | undefined, source: string): SavedSlate {
  const first = openedBoard(sports);
  return {
    savedAt: new Date().toISOString(),
    model,
    oddsSource: source,
    ...(odds ? { oddsDay: odds } : {}),
    title: first?.games?.title ?? '',
    groups: first?.games?.groups ?? [],
    note: first?.games?.note,
    ticketGroups: first?.games?.ticketGroups,
    props: first?.props,
    sports,
  };
}

const savedPath = fileURLToPath(new URL('../runs/last-run.json', import.meta.url));
const snapshotDir = fileURLToPath(new URL('../snapshots/', import.meta.url));

export async function runSlate(options: RunSlateOptions = {}): Promise<SlateRunResult> {
  const day = options.day;
  const odds = options.odds;
  const previousSource = process.env.ODDS_SOURCE;
  const sourceSet = options.source != null && options.source !== '';
  if (sourceSet) process.env.ODDS_SOURCE = options.source;
  setOddsFresh(Boolean(options.fresh));
  if (odds) setOddsReplay(odds);
  let release: (() => Promise<void>) | undefined;
  try {
    const source = oddsSource();
    const chosen = selectDecisionModel(options.model ?? 'jev');
    requireRunKeys(chosen, Boolean(odds));
    release = await acquireRunLock(dirname(savedPath));
    console.log(odds ? `Decisions: ${chosen}. Odds saved on ${odds}.` : `Decisions: ${chosen}.`);
    const sports: SavedSport[] = [];
    let built = false;
    const label = odds ?? day ?? todayEastern();
    const remember = async () => {
      if (!built) return;
      await saveRun(currentSlate(sports, chosen, odds, source));
    };
    for (const sport of SPORTS) {
      if (sport.kind === 'board') {
        try {
          const board = await buildBoard(sport.source, odds ?? day);
          built = true;
          sports.push({ label: sport.label, games: gamesOf(board), props: board.props });
        } catch (error) {
          const safe = scrubError(error, 'This sport failed.');
          console.error(`${sport.label}: ${safe}`);
          sports.push({
            label: sport.label,
            games: { title: sport.label, groups: [], note: safe },
            props: { title: 'Player props', groups: [], note: safe },
          });
        }
        await remember();
        continue;
      }
      const leagues: SavedLeague[] = [];
      for (const league of sport.leagues) {
        console.log(`\n${league.label}`);
        const result = await runLeague(league, odds ?? day);
        built = built || result.built;
        leagues.push(result.league);
      }
      sports.push({ label: sport.label, leagues });
      await remember();
    }

    if (!built) {
      const message = 'No sport produced a board. Left runs/last-run.json unchanged.';
      console.error(message);
      process.exitCode = 1;
      return { built: false, close: 'quit', message };
    }

    const saved = currentSlate(sports, chosen, odds, source);
    await saveRun(saved);
    await saveSnapshot(saved, label);
    const close = await showSlate(saved);
    return { built: true, close, message: '' };
  } finally {
    setOddsFresh(false);
    setOddsReplay(null);
    if (sourceSet) {
      if (previousSource === undefined) delete process.env.ODDS_SOURCE;
      else process.env.ODDS_SOURCE = previousSource;
    }
    if (release) await release();
  }
}

function openedBoard(sports: SavedSport[]) {
  for (const sport of sports) {
    if (sport.games) return sport;
    const league = sport.leagues?.find((item) => item.label === 'NFL') ?? sport.leagues?.[0];
    if (league) return league;
  }
  return undefined;
}

async function writeAtomic(path: string, body: string) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, body);
  await rename(temp, path);
}

async function saveRun(saved: SavedSlate) {
  await mkdir(dirname(savedPath), { recursive: true });
  await writeAtomic(savedPath, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(`Saved ${savedPath}`);
}

async function saveSnapshot(saved: SavedSlate, label: string) {
  const { path, archived } = await saveDecisionSnapshot(snapshotDir, label, saved.model ?? 'jev', saved);
  if (archived) console.log(`Archived ${archived}`);
  console.log(`Saved ${path}`);
}

if (isDirectRun(import.meta.url)) {
  const args = readStartArgs(process.argv.slice(2));
  runSlate({ day: args.day, model: args.model, odds: args.odds, fresh: args.fresh }).catch((error) => {
    console.error(scrubError(error, 'The slate failed.'));
    process.exit(1);
  });
}
