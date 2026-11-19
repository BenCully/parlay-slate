// Championship form for one Formula 1 driver. ESPN's standings page, no key.
// A miss leaves a short brief so the race still reaches the decision model.
import { readEspnCache, writeEspnCache } from '../../espn/cache.js';
import { nameKey, type EvidenceLeg, type GameBrief, type SideBrief } from '../../espn/evidence.js';

const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/racing/f1/standings';
const TIMEOUT_MS = 10_000;

export type DriverLine = {
  name: string;
  rank: string;
  points: string;
  recent: string[];
};

type StandingStat = { name?: string; displayValue?: string; played?: boolean };

function listWords(values: string[]) {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function statValue(stats: StandingStat[], name: string) {
  return stats.find((stat) => stat.name === name)?.displayValue?.trim() ?? '';
}

/** One driver row from the ESPN standings payload, or null when the row has no name. */
export function driverLine(entry: unknown): DriverLine | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as { athlete?: { displayName?: string }; stats?: StandingStat[] };
  const name = row.athlete?.displayName?.trim() ?? '';
  if (!name) return null;
  const stats = Array.isArray(row.stats) ? row.stats : [];
  const recent = stats
    .filter((stat) => stat.played === true)
    .slice(-5)
    .map((stat) => {
      const value = stat.displayValue?.trim() ?? '';
      return value && value !== '-' ? value : 'DNF';
    });
  return {
    name,
    rank: statValue(stats, 'rank'),
    points: statValue(stats, 'championshipPts'),
    recent,
  };
}

export function driverLines(body: unknown): DriverLine[] {
  const children = (body as { children?: { abbreviation?: string; name?: string; standings?: { entries?: unknown[] } }[] } | null)?.children ?? [];
  const drivers = children.find((child) => child.abbreviation === 'Driver' || child.name === 'Driver Standings');
  return (drivers?.standings?.entries ?? []).map(driverLine).filter((line): line is DriverLine => line != null);
}

/** Exact championship name, then one unique partial match. */
export function matchDriver(lines: DriverLine[], name: string) {
  const key = nameKey(name);
  if (!key) return undefined;
  const exact = lines.filter((line) => nameKey(line.name) === key);
  if (exact.length === 1) return exact[0];
  if (key.length < 4) return undefined;
  const contains = lines.filter((line) => {
    const other = nameKey(line.name);
    return other.includes(key) || key.includes(other);
  });
  return contains.length === 1 ? contains[0] : undefined;
}

/** The brief the decision model reads. Recent numbers are championship points, not finishing places. */
export function describeDriver(driver: string, line: DriverLine | undefined, phrase: string, race: string) {
  const bet = `${driver} ${phrase} at the ${race}.`;
  if (!line) return `ESPN has no 2026 championship line for ${driver}. ${bet}`;
  const place = line.rank ? `P${line.rank}` : 'unranked';
  const points = line.points ? `${line.points} points` : 'no points listed';
  const recent = line.recent.length
    ? `Last five races scored ${listWords(line.recent)} points.`
    : 'ESPN lists no finished races.';
  return `${line.name} is ${place} in the 2026 championship with ${points}. ${recent} ${bet}`;
}

function side(name: string, record: string, short?: string): SideBrief {
  return {
    name,
    short: short ?? name.split(' ').at(-1) ?? name,
    record,
    rest: 'this race weekend',
    injury: 'no significant injuries listed',
    margin: null,
    scored: null,
    allowed: null,
  };
}

let pending: Promise<DriverLine[]> | undefined;

async function loadDrivers() {
  if (pending) return pending;
  pending = fetchDrivers().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

async function fetchDrivers() {
  const cached = await readEspnCache(STANDINGS, 'day');
  if (cached !== undefined) return driverLines(cached);
  let res: Response;
  try {
    res = await fetch(STANDINGS, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    console.error(name === 'TimeoutError' || name === 'AbortError'
      ? 'ESPN Formula 1 standings timed out.'
      : 'ESPN Formula 1 standings did not answer.');
    return [];
  }
  if (!res.ok) {
    console.error(`ESPN Formula 1 standings returned ${res.status}.`);
    return [];
  }
  const body = await res.json();
  await writeEspnCache(STANDINGS, body);
  return driverLines(body);
}

export async function getBrief(leg: EvidenceLeg): Promise<GameBrief> {
  const phrase = leg.phrase?.trim() || 'to win the race';
  const race = leg.opponent.trim() || 'the race';
  let line: DriverLine | undefined;
  try {
    line = matchDriver(await loadDrivers(), leg.team);
  } catch {
    line = undefined;
  }
  const text = describeDriver(leg.team, line, phrase, race);
  const record = line?.rank
    ? `P${line.rank}${line.points ? `, ${line.points} points` : ''}`
    : 'no championship line';
  return {
    text,
    pick: side(leg.team, record),
    opponent: side(race, 'the rest of the grid', race),
  };
}
