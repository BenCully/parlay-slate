// League table, expected goals, and unavailable players from FotMob's public web routes.
// No key. A miss leaves the ESPN brief unchanged. The previous match lineup is not a projection.
import { clubKey, type EvidenceLeg, type GameBrief } from '../../espn/evidence.js';

const EMPTY_INJURY = 'no significant injuries listed';
const NOBODY_LISTED = 'injury report: nobody listed Out, Doubtful, Questionable, or on injured reserve.';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LIMIT = 4;

type Split = { place: number; wins: number; draws: number; losses: number };
type Team = {
  id: string;
  name: string;
  shortName: string;
  place: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gd: number;
  xg: number | null;
  xga: number | null;
  home: Split | null;
  away: Split | null;
};
type Fixture = { id: string; homeId: string; awayId: string; utcTime: string };
type Absence = { name: string; kind: string; back: string; until: number | null };
type MatchAbsences = { homeId: string; awayId: string; home: Absence[]; away: Absence[] };

export type FotmobLeague = { teams: Team[]; fixtures: Fixture[] };

let active = 0;
const waiters: Array<() => void> = [];

function gate() {
  if (active < LIMIT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release() {
  active -= 1;
  waiters.shift()?.();
}

async function fotmobGet(url: string, label: string): Promise<any | null> {
  await gate();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`FotMob ${label} returned ${res.status}.`);
      return null;
    }
    return await res.json();
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    console.error(name === 'TimeoutError' || name === 'AbortError' ? `FotMob ${label} timed out.` : `FotMob ${label} did not answer.`);
    return null;
  } finally {
    release();
  }
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function splitOf(row: any): Split | null {
  const place = num(row?.idx);
  const wins = num(row?.wins);
  const draws = num(row?.draws);
  const losses = num(row?.losses);
  if (place == null || wins == null || draws == null || losses == null) return null;
  return { place, wins, draws, losses };
}

function byId(rows: any[] | undefined) {
  const map = new Map<string, any>();
  for (const row of rows ?? []) {
    const id = text(row?.id ?? row?.teamId);
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

/** One standings block. A split league posts conference tables beside a larger overall table. */
function standings(block: any) {
  const data = block?.data;
  if (data?.table?.all?.length) return data.table;
  let best: any = null;
  let bestCount = 0;
  const tables = Array.isArray(data?.tables) ? data.tables : [];
  for (const entry of tables) {
    const count = entry?.table?.all?.length ?? 0;
    if (count > bestCount) {
      best = entry.table;
      bestCount = count;
    }
  }
  return best ?? data?.table;
}

export function parseLeague(body: any): FotmobLeague | null {
  const teams: Team[] = [];
  const seen = new Set<string>();
  for (const block of body?.table ?? []) {
    const table = standings(block);
    const home = byId(table?.home);
    const away = byId(table?.away);
    const xg = byId(table?.xg);
    for (const row of table?.all ?? []) {
      const id = text(row?.id);
      const name = text(row?.name);
      const record = splitOf(row);
      const gd = num(row?.goalConDiff);
      if (!id || !name || !record || gd == null || seen.has(id)) continue;
      seen.add(id);
      const expected = xg.get(id);
      teams.push({
        id,
        name,
        shortName: text(row?.shortName) || name,
        place: record.place,
        played: num(row?.played) ?? 0,
        wins: record.wins,
        draws: record.draws,
        losses: record.losses,
        gd,
        xg: num(expected?.xg),
        xga: num(expected?.xgConceded),
        home: splitOf(home.get(id)),
        away: splitOf(away.get(id)),
      });
    }
  }
  if (!teams.length) return null;
  const fixtures: Fixture[] = [];
  for (const match of body?.fixtures?.allMatches ?? []) {
    const id = text(match?.id);
    const homeId = text(match?.home?.id);
    const awayId = text(match?.away?.id);
    const utcTime = text(match?.status?.utcTime);
    if (!id || !homeId || !awayId || !utcTime) continue;
    fixtures.push({ id, homeId, awayId, utcTime });
  }
  return { teams, fixtures };
}

export function matchClub<T extends { name: string; shortName?: string; id?: string | number }>(rows: T[], name: string): T | undefined {
  const key = clubKey(name);
  if (!key) return undefined;
  const keysOf = (row: T) => [clubKey(row.name), row.shortName ? clubKey(row.shortName) : ''].filter(Boolean);
  const unique = (hits: T[]) => {
    const map = new Map<string, T>();
    hits.forEach((row, index) => map.set(text(row.id) || String(index), row));
    return [...map.values()];
  };
  const direct = unique(rows.filter((row) => keysOf(row).includes(key)));
  if (direct.length === 1) return direct[0];
  if (key.length < 4) return undefined;
  const hits = unique(rows.filter((row) => keysOf(row).some((teamKey) => teamKey.length >= 4 && (teamKey.includes(key) || key.includes(teamKey)))));
  return hits.length === 1 ? hits[0] : undefined;
}

function ordinal(place: number) {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  if (place % 10 === 1) return `${place}st`;
  if (place % 10 === 2) return `${place}nd`;
  if (place % 10 === 3) return `${place}rd`;
  return `${place}th`;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function tableLine(team: Team, atHome: boolean, count: number) {
  const parts = [`${ordinal(team.place)} of ${count}, ${team.wins}-${team.draws}-${team.losses}, ${signed(team.gd)} GD`];
  if (team.xg != null && team.xga != null && team.played > 0) {
    parts.push(`${(team.xg / team.played).toFixed(1)} xG and ${(team.xga / team.played).toFixed(1)} xGA per game`);
  }
  const split = atHome ? team.home : team.away;
  if (split) parts.push(`${ordinal(split.place)} ${atHome ? 'at home' : 'away'} (${split.wins}-${split.draws}-${split.losses})`);
  return parts.join(', ');
}

export function pickFixture(league: FotmobLeague, team: string, opponent: string, commence: string) {
  const ours = matchClub(league.teams, team);
  const theirs = matchClub(league.teams, opponent);
  if (!ours || !theirs) return undefined;
  const kick = Date.parse(commence);
  let best: Fixture | undefined;
  let bestGap = Infinity;
  for (const fixture of league.fixtures) {
    const ids = [fixture.homeId, fixture.awayId];
    if (!ids.includes(ours.id) || !ids.includes(theirs.id)) continue;
    const gap = Math.abs(Date.parse(fixture.utcTime) - kick);
    if (gap < bestGap) {
      best = fixture;
      bestGap = gap;
    }
  }
  if (!best || bestGap > 36 * 60 * 60 * 1000) return undefined;
  return best;
}

function parseAbsences(list: any): Absence[] {
  if (!Array.isArray(list)) return [];
  const absences: Absence[] = [];
  for (const player of list) {
    const name = text(player?.name);
    if (!name) continue;
    const info = player?.unavailability ?? {};
    const raw = text(info.type);
    const kind = raw === 'suspension' ? 'suspended' : raw === 'injury' ? 'injured' : raw || 'unavailable';
    const until = Date.parse(info.expectedReturnDate);
    absences.push({ name, kind, back: text(info.expectedReturn), until: Number.isFinite(until) ? until : null });
  }
  return absences;
}

export function openAbsences(list: Absence[], kickoff: number) {
  return list.filter((player) => player.until == null || player.until > kickoff);
}

export function absenceText(list: Absence[]) {
  const shown = list.slice(0, 2).map((player) => player.back ? `${player.name} ${player.kind}, back ${player.back}` : `${player.name} ${player.kind}`);
  const extra = list.length - shown.length;
  const more = extra > 0 ? `, and ${extra} other${extra === 1 ? '' : 's'}` : '';
  return `${shown.join('; ')}${more}`;
}

function parseMatch(body: any): MatchAbsences | null {
  const lineup = body?.content?.lineup;
  const homeId = text(lineup?.homeTeam?.id);
  const awayId = text(lineup?.awayTeam?.id);
  if (!homeId || !awayId) return null;
  return {
    homeId,
    awayId,
    home: parseAbsences(lineup.homeTeam.unavailable),
    away: parseAbsences(lineup.awayTeam.unavailable),
  };
}

export function applyFotmob(brief: GameBrief, leg: EvidenceLeg, league: FotmobLeague, absences: MatchAbsences | null): GameBrief {
  const pick = matchClub(league.teams, leg.team);
  const opponent = matchClub(league.teams, leg.opponent);
  const count = league.teams.length;
  const pickLine = pick ? tableLine(pick, leg.home, count) : '';
  const opponentLine = opponent ? tableLine(opponent, !leg.home, count) : '';
  const kick = Date.parse(leg.commence);
  const forSide = (team: Team | undefined) => {
    if (!absences || !team) return [];
    const list = team.id === absences.homeId ? absences.home : team.id === absences.awayId ? absences.away : [];
    return openAbsences(list, kick);
  };
  const pickOut = forSide(pick);
  const opponentOut = forSide(opponent);
  if (!pickLine && !opponentLine && !pickOut.length && !opponentOut.length) return brief;

  const nextPick = { ...brief.pick };
  const nextOpponent = { ...brief.opponent };
  if (pickLine) nextPick.table = pickLine;
  if (opponentLine) nextOpponent.table = opponentLine;
  let text = brief.text;
  const bits = [
    pickLine ? `${brief.pick.name} ${pickLine}` : '',
    opponentLine ? `${brief.opponent.name} ${opponentLine}` : '',
  ].filter(Boolean);
  if (bits.length) text += ` FotMob table: ${bits.join('. ')}.`;

  const writeAbsence = (side: GameBrief['pick'], list: Absence[]) => {
    if (!list.length) return;
    const sentence = absenceText(list);
    side.injury = side.injury === EMPTY_INJURY ? sentence : `${side.injury}; ${sentence}`;
    const espn = `${side.name} ${NOBODY_LISTED}`;
    const replacement = `${side.name} unavailable: ${sentence}.`;
    text = text.includes(espn) ? text.replace(espn, replacement) : `${text} ${replacement}`;
  };
  writeAbsence(nextPick, pickOut);
  writeAbsence(nextOpponent, opponentOut);
  return { ...brief, text, pick: nextPick, opponent: nextOpponent };
}

export function createFotmob(leagueId: number) {
  let leaguePromise: Promise<FotmobLeague | null> | undefined;
  const matches = new Map<string, Promise<MatchAbsences | null>>();

  function loadLeague() {
    return leaguePromise ??= (async () => {
      const body = await fotmobGet(`https://www.fotmob.com/api/data/leagues?id=${leagueId}`, `league ${leagueId}`);
      if (!body) return null;
      const league = parseLeague(body);
      if (!league) console.error(`FotMob league ${leagueId} had no table.`);
      return league;
    })();
  }

  function loadMatch(id: string) {
    const pending = matches.get(id);
    if (pending) return pending;
    const next = (async () => {
      const body = await fotmobGet(`https://www.fotmob.com/api/data/matchDetails?matchId=${id}`, `match ${id}`);
      return body ? parseMatch(body) : null;
    })();
    matches.set(id, next);
    return next;
  }

  async function enrich(leg: EvidenceLeg, getBrief: (leg: EvidenceLeg) => Promise<GameBrief>): Promise<GameBrief> {
    const [brief, league] = await Promise.all([getBrief(leg), loadLeague()]);
    if (!league) return brief;
    const fixture = pickFixture(league, leg.team, leg.opponent, leg.commence);
    const absences = fixture ? await loadMatch(fixture.id) : null;
    return applyFotmob(brief, leg, league, absences);
  }

  return { enrich };
}
