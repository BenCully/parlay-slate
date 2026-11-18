// Builds every sport in sports/index.ts, saves runs/last-run.json and a snapshot, and opens the screen.
// env: TYPESAFE_API_KEY, ODDS_API_KEY, plus cache settings in .env.settings
// run: npm start                              current slate, games that have not kicked off
//      npm start -- 2026-11-15                one Eastern calendar day
//      npm start -- 2026-11-15 model=jev      TypeSafe through jev-recipes (also the default)
//      npm start -- 2026-11-15 model=tail-jev Autojev on the tailnet (model=autojev is the same)
//      npm start -- odds=2026-11-15 model=jev prices saved that Eastern day, no Odds API call
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStartArgs, requireRunKeys, selectDecisionModel } from '../decisions/judge.js';
import { setOddsReplay } from '../odds/cache.js';
import { buildBoard, type BuiltBoard } from '../slate/board.js';
import { todayEastern } from '../slate/window.js';
import { showSlate, type SavedBoard, type SavedLeague, type SavedSlate, type SavedSport } from '../ui/screen.js';
import { SPORTS, type LeagueDef } from '../sports/index.js';
import { acquireRunLock } from './lock.js';
import { scrubError } from './scrub.js';

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

function currentSlate(sports: SavedSport[], model: SavedSlate['model'], odds: string | undefined): SavedSlate {
  const first = openedBoard(sports);
  return {
    savedAt: new Date().toISOString(),
    model,
    ...(odds ? { oddsDay: odds } : {}),
    title: first?.games?.title ?? '',
    groups: first?.games?.groups ?? [],
    note: first?.games?.note,
    ticketGroups: first?.games?.ticketGroups,
    props: first?.props,
    sports,
  };
}

async function main() {
  const { day, model, odds } = readStartArgs(process.argv.slice(2));
  if (odds) setOddsReplay(odds);
  const chosen = selectDecisionModel(model);
  requireRunKeys(chosen, Boolean(odds));
  const release = await acquireRunLock(dirname(savedPath));
  try {
    console.log(odds ? `Decisions: ${chosen}. Odds saved on ${odds}.` : `Decisions: ${chosen}.`);
    const sports: SavedSport[] = [];
    let built = false;
    const label = odds ?? day ?? todayEastern();
    const remember = async () => {
      if (!built) return;
      await saveRun(currentSlate(sports, chosen, odds));
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
      console.error('No sport produced a board. Left runs/last-run.json unchanged.');
      process.exitCode = 1;
      return;
    }

    const saved = currentSlate(sports, chosen, odds);
    await saveRun(saved);
    await saveSnapshot(saved, label);
    await showSlate(saved);
  } finally {
    await release();
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

const savedPath = fileURLToPath(new URL('../runs/last-run.json', import.meta.url));
const snapshotDir = fileURLToPath(new URL('../snapshots/', import.meta.url));

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
  await mkdir(snapshotDir, { recursive: true });
  const snapshotPath = `${snapshotDir}${label}-${saved.model}.json`;
  await writeAtomic(snapshotPath, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(`Saved ${snapshotPath}`);
}

main().catch((error) => {
  console.error(scrubError(error, 'The slate failed.'));
  process.exit(1);
});
