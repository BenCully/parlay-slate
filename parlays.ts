// Builds every sport in sports/index.ts, saves last-run.json, and opens the screen.
// env: TYPESAFE_API_KEY, ODDS_API_KEY, plus cache settings in .env.settings
// run: npm start                              current slate, games that have not kicked off
//      npm start -- 2026-11-15                one Eastern calendar day
//      npm start -- 2026-11-15 model=jev      TypeSafe through jev-recipes (also the default)
//      npm start -- 2026-11-15 model=tail-jev Autojev on the tailnet (model=autojev is the same)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readStartArgs, selectDecisionModel } from './decisions/judge.js';
import { buildBoard, type BuiltBoard } from './slate/board.js';
import { showSlate, type SavedBoard, type SavedLeague, type SavedSlate, type SavedSport } from './ui/screen.js';
import { SPORTS, type LeagueDef } from './sports/index.js';

const { day, model } = readStartArgs(process.argv.slice(2));

function scrub(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/apiKey=[^&\s]+/gi, 'apiKey=***');
}

function gamesOf(board: BuiltBoard): SavedBoard {
  return { title: board.title, groups: board.groups, note: board.note, ticketGroups: board.ticketGroups };
}

async function runLeague(league: LeagueDef): Promise<{ league: SavedLeague; built: boolean }> {
  try {
    const board = await buildBoard(league.source, day);
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
  const chosen = selectDecisionModel(model);
  console.log(`Decisions: ${chosen}.`);
  const sports: SavedSport[] = [];
  let built = false;
  for (const sport of SPORTS) {
    if (sport.kind === 'board') {
      try {
        const board = await buildBoard(sport.source, day);
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
      const result = await runLeague(league);
      built = built || result.built;
      leagues.push(result.league);
    }
    sports.push({ label: sport.label, leagues });
  }

  if (!built) {
    console.error('No sport produced a board. Left last-run.json unchanged.');
    process.exit(1);
  }

  const first = openedBoard(sports);
  const saved: SavedSlate = {
    savedAt: new Date().toISOString(),
    model: chosen,
    title: first?.games?.title ?? '',
    groups: first?.games?.groups ?? [],
    note: first?.games?.note,
    ticketGroups: first?.games?.ticketGroups,
    props: first?.props,
    sports,
  };
  await saveSlate(saved);
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

const savedPath = fileURLToPath(new URL('./last-run.json', import.meta.url));

async function saveSlate(saved: SavedSlate) {
  await writeFile(savedPath, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(`Saved ${savedPath}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
