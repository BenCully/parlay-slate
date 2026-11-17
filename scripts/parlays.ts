// Builds every sport in sports/index.ts, saves runs/last-run.json and a snapshot, and opens the screen.
// env: TYPESAFE_API_KEY, ODDS_API_KEY, plus cache settings in .env.settings
// run: npm start                              current slate, games that have not kicked off
//      npm start -- 2026-11-15                one Eastern calendar day
//      npm start -- 2026-11-15 model=jev      TypeSafe through jev-recipes (also the default)
//      npm start -- 2026-11-15 model=tail-jev Autojev on the tailnet (model=autojev is the same)
//      npm start -- odds=2026-11-15 model=jev prices saved that Eastern day, no Odds API call
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStartArgs, selectDecisionModel } from '../decisions/judge.js';
import { setOddsReplay } from '../odds/cache.js';
import { buildBoard, type BuiltBoard } from '../slate/board.js';
import { todayEastern } from '../slate/window.js';
import { showSlate, type SavedBoard, type SavedLeague, type SavedSlate, type SavedSport } from '../ui/screen.js';
import { SPORTS, type LeagueDef } from '../sports/index.js';

function scrub(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/apiKey=[^&\s]+/gi, 'apiKey=***');
}

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
    const safe = scrub(error, 'This league failed.');
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

async function main() {
  const { day, model, odds } = readStartArgs(process.argv.slice(2));
  if (odds) setOddsReplay(odds);
  const chosen = selectDecisionModel(model);
  console.log(odds ? `Decisions: ${chosen}. Odds saved on ${odds}.` : `Decisions: ${chosen}.`);
  const sports: SavedSport[] = [];
  let built = false;
  for (const sport of SPORTS) {
    if (sport.kind === 'board') {
      try {
        const board = await buildBoard(sport.source, odds ?? day);
        built = true;
        sports.push({ label: sport.label, games: gamesOf(board), props: board.props });
      } catch (error) {
        const safe = scrub(error, 'This sport failed.');
        console.error(`${sport.label}: ${safe}`);
        sports.push({
          label: sport.label,
          games: { title: sport.label, groups: [], note: safe },
          props: { title: 'Player props', groups: [], note: safe },
        });
      }
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
  }

  if (!built) {
    console.error('No sport produced a board. Left runs/last-run.json unchanged.');
    process.exit(1);
  }

  const first = openedBoard(sports);
  const saved: SavedSlate = {
    savedAt: new Date().toISOString(),
    model: chosen,
    ...(odds ? { oddsDay: odds } : {}),
    title: first?.games?.title ?? '',
    groups: first?.games?.groups ?? [],
    note: first?.games?.note,
    ticketGroups: first?.games?.ticketGroups,
    props: first?.props,
    sports,
  };
  await saveSlate(saved, odds ?? day ?? todayEastern());
  await showSlate(saved);
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

async function saveSlate(saved: SavedSlate, label: string) {
  const body = `${JSON.stringify(saved, null, 2)}\n`;
  await mkdir(dirname(savedPath), { recursive: true });
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(savedPath, body);
  const snapshotPath = `${snapshotDir}${label}-${saved.model}.json`;
  await writeFile(snapshotPath, body);
  console.log(`Saved ${savedPath}`);
  console.log(`Saved ${snapshotPath}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
