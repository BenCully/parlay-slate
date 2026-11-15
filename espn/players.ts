// Player names and recent stat lines from ESPN's public site API. No key.
// A sport calls createPlayers with that competition's roster and gamelog bases.
import { nameKey } from './evidence.js';

export type PlayerRef = {
  id: string;
  name: string;
  pos: string;
  team: string;
};

type Log = {
  names: string[];
  rows: { date: number; stats: string[] }[];
};

export type Players = {
  loadRosters: (teamNames: string[]) => Promise<{
    match: (team: string, player: string) => PlayerRef | null;
    failed: string[];
  }>;
  recentStat: (
    player: PlayerRef,
    stat: string | 'touchdowns' | 'cards',
    phrase: string,
  ) => Promise<(side: 'over' | 'under' | 'yes', point: number | null) => string>;
};

export function createPlayers(options: {
  rosterBase: string;
  gamelogBase: string;
  teamPath: (name: string) => Promise<string | null>;
  seasonLabel: string;
}): Players {
  const rosters = new Map<string, Promise<PlayerRef[]>>();
  const logs = new Map<string, Promise<Log | null>>();

  async function readJson(url: string): Promise<any | null> {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  function rosterFor(teamName: string) {
    const pending = rosters.get(teamName);
    if (pending) return pending;
    const next = (async () => {
      const path = await options.teamPath(teamName);
      if (!path) return [];
      const body = await readJson(`${options.rosterBase}/teams/${path}/roster`);
      const players: PlayerRef[] = [];
      for (const group of body?.athletes ?? []) {
        const list = Array.isArray(group?.items) ? group.items : group?.displayName ? [group] : [];
        for (const athlete of list) {
          const name = String(athlete.displayName ?? '').trim();
          const id = String(athlete.id ?? '');
          if (!name || !id) continue;
          players.push({
            id,
            name,
            pos: String(athlete.position?.abbreviation ?? ''),
            team: teamName,
          });
        }
      }
      return players;
    })();
    rosters.set(teamName, next);
    return next;
  }

  async function loadRosters(teamNames: string[]) {
    const lists = await Promise.all(teamNames.map((team) => rosterFor(team)));
    const byTeam = new Map<string, PlayerRef[]>();
    teamNames.forEach((team, index) => byTeam.set(team, lists[index]));

    const match = (team: string, playerName: string): PlayerRef | null => {
      const players = byTeam.get(team) ?? [];
      const key = nameKey(playerName);
      const exact = players.find((player) => nameKey(player.name) === key);
      if (exact) return exact;
      const last = nameKey(playerName.split(' ').at(-1) ?? '');
      if (!last) return null;
      const byLast = players.filter((player) => nameKey(player.name.split(' ').at(-1) ?? '') === last);
      return byLast.length === 1 ? byLast[0] : null;
    };

    return { match, failed: teamNames.filter((team, index) => lists[index].length === 0) };
  }

  function statNumber(raw: string | undefined): number | null {
    if (raw == null) return null;
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned || cleaned === '-') return null;
    const made = /^(\d+(?:\.\d+)?)-\d/.exec(cleaned);
    if (made) return Number(made[1]);
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  function gamelog(id: string) {
    const pending = logs.get(id);
    if (pending) return pending;
    const next = (async (): Promise<Log | null> => {
      const body = await readJson(`${options.gamelogBase}/${id}/gamelog`);
      if (!body) return null;
      const names = (body.names ?? []).map((name: unknown) => String(name));
      const seasons = (body.seasonTypes ?? []).filter((season: any) => /regular season/i.test(String(season.displayName ?? '')));
      const season = seasons[0] ?? body.seasonTypes?.[0];
      const categories = season?.categories ?? [];
      const fitting = categories.find((category: any) => category.events?.[0]?.stats?.length === names.length) ?? categories[0];
      const events = fitting?.events ?? [];
      const meta = body.events ?? {};
      const rows = events.map((event: any) => {
        const info = meta[String(event.eventId)] ?? {};
        return { date: Date.parse(info.gameDate) || 0, stats: (event.stats ?? []).map((stat: unknown) => String(stat)) };
      });
      rows.sort((a: { date: number }, b: { date: number }) => a.date - b.date);
      return { names, rows };
    })();
    logs.set(id, next);
    return next;
  }

  function formatStat(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  async function recentStat(
    player: PlayerRef,
    stat: string | 'touchdowns' | 'cards',
    phrase: string,
  ): Promise<(side: 'over' | 'under' | 'yes', point: number | null) => string> {
    const log = await gamelog(player.id);
    const empty = () => `ESPN has no ${options.seasonLabel} ${phrase} for ${player.name}.`;
    if (!log) return empty;

    const values: number[] = [];
    for (const row of log.rows) {
      if (row.stats.length !== log.names.length) continue;
      if (stat === 'touchdowns') {
        const rush = statNumber(row.stats[log.names.indexOf('rushingTouchdowns')]);
        const rec = statNumber(row.stats[log.names.indexOf('receivingTouchdowns')]);
        if (rush == null && rec == null) continue;
        values.push((rush ?? 0) + (rec ?? 0));
        continue;
      }
      if (stat === 'cards') {
        const yellow = statNumber(row.stats[log.names.indexOf('yellowCards')]);
        const red = statNumber(row.stats[log.names.indexOf('redCards')]);
        if (yellow == null && red == null) continue;
        values.push((yellow ?? 0) + (red ?? 0));
        continue;
      }
      const index = log.names.indexOf(stat);
      if (index < 0) continue;
      const value = statNumber(row.stats[index]);
      if (value == null) continue;
      values.push(value);
    }
    if (!values.length) return empty;

    return (side, point) => {
      const shown = values.slice(-5);
      const average = shown.reduce((sum, value) => sum + value, 0) / shown.length;
      const hits = side === 'yes'
        ? shown.filter((value) => value >= 1).length
        : side === 'over'
          ? shown.filter((value) => point != null && value > point).length
          : shown.filter((value) => point != null && value < point).length;
      const hitWord = stat === 'cards' ? 'with a card' : 'with a score';
      const comparison = side === 'yes'
        ? `${hits} of ${shown.length} ${hitWord}`
        : point == null
          ? `${shown.length} games`
          : `${hits} of ${shown.length} ${side} ${point}`;
      return `Last ${shown.length} games, oldest first: ${shown.map(formatStat).join(', ')} ${phrase} (average ${average.toFixed(1)}, ${comparison}).`;
    };
  }

  return { loadRosters, recentStat };
}
