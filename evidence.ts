// Team form and injuries from ESPN's public site API. No key.
// NFL uses football/nfl. Soccer leagues use their own competition path.
// The league news feed is unused.

const NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

export type EvidenceLeg = {
  team: string;
  opponent: string;
  home: boolean;
  commence: string;
};

type EspnTeam = { name: string; abbr: string; id: string; short: string };
type Played = {
  date: number;
  win: boolean;
  tie: boolean;
  pointsFor: number;
  pointsAgainst: number;
  opp: string;
  home: boolean;
};
type Season = { name: string; abbr: string; games: Played[] };
type Injury = { player: string; pos: string; status: string; detail: string };
type Mode = 'football' | 'soccer';

const DROP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'sv', 'fsv', 'fk', 'vfb', 'tsg', 'rb', 'de', 'and']);

const ALIASES: Record<string, string> = {
  'koln': 'cologne',
  'bayern munchen': 'bayern munich',
  'sporting lisbon': 'sporting cp',
  'athletic bilbao': 'athletic club',
  'hamburger': 'hamburg',
  'club bruges': 'club brugge',
  'inter': 'internazionale',
  'inter milan': 'internazionale',
  'slavia praha': 'slavia prague',
};

function fold(name: string) {
  return name
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[åÅ]/g, 'a')
    .replace(/ß/g, 'ss')
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function nameKey(name: string) {
  return fold(name).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function norm(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function canon(name: string) {
  return fold(name).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token && !DROP.has(token) && !/^\d+$/.test(token)).join(' ');
}

function createClient(base: string, mode: Mode) {
  let teamsPromise: Promise<Map<string, EspnTeam>> | undefined;
  let injuriesPromise: Promise<Map<string, Injury[]>> | undefined;
  const seasons = new Map<string, Promise<Season | null>>();

  async function espn(path: string): Promise<any> {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) throw new Error(`ESPN ${path} returned ${res.status}`);
    return res.json();
  }

  function loadTeams() {
    return (teamsPromise ??= (async () => {
      const limit = mode === 'football' ? 32 : 200;
      const body = await espn(`/teams?limit=${limit}`);
      const rows = body.sports?.[0]?.leagues?.[0]?.teams ?? [];
      const map = new Map<string, EspnTeam>();
      for (const row of rows) {
        const team = row.team ?? row;
        const entry = {
          name: String(team.displayName),
          abbr: String(team.abbreviation),
          id: String(team.id),
          short: mode === 'soccer'
            ? String(team.shortDisplayName || team.displayName)
            : String(team.displayName).split(' ').at(-1) ?? String(team.displayName),
        };
        if (mode === 'football') {
          map.set(norm(entry.name), entry);
          continue;
        }
        const keys = [canon(entry.name), canon(String(team.shortDisplayName ?? '')), canon(String(team.name ?? ''))];
        for (const key of keys) {
          if (key && !map.has(key)) map.set(key, entry);
        }
      }
      return map;
    })());
  }

  function findTeam(teams: Map<string, EspnTeam>, name: string) {
    if (mode === 'football') return teams.get(norm(name));
    const key = canon(name);
    const direct = teams.get(key) ?? teams.get(ALIASES[key] ?? '');
    if (direct) return direct;
    if (key.length < 4) return undefined;
    const hits = new Map<string, EspnTeam>();
    for (const [teamKey, team] of teams) {
      if (teamKey.length < 4) continue;
      if (teamKey.includes(key) || key.includes(teamKey)) hits.set(team.id, team);
    }
    return hits.size === 1 ? [...hits.values()][0] : undefined;
  }

  function injuryRank(injury: Injury) {
    const quarterback = injury.pos === 'QB' ? 0 : 5;
    const status = injury.status === 'Out' ? 0
      : injury.status === 'Doubtful' ? 1
      : injury.status === 'Questionable' ? 2
      : injury.status === 'Injured Reserve' ? 3
      : 4;
    return quarterback + status;
  }

  // NFL reports list a lot of healthy scratches as Out, Coach's Decision.
  // Those are not injuries. Keep real designations and injured reserve.
  function isScratch(raw: any) {
    const type = String(raw.details?.type ?? '');
    return /coach'?s decision|not injury related|^rest$/i.test(type);
  }

  function injuryDetail(raw: any): string {
    const side = raw.details?.side;
    const type = raw.details?.type;
    const bits = [side, type].filter((part: string) => part && part !== 'Not Specified');
    let text = bits.join(' ');
    const notable = raw.status === 'Out' || raw.status === 'Injured Reserve' || raw.athlete?.position?.abbreviation === 'QB';
    const comment = String(raw.shortComment ?? '').replace(/\s+/g, ' ').trim();
    if (notable && comment) {
      const clip = comment.length > 140 ? `${comment.slice(0, 137)}...` : comment;
      text = text ? `${text}. ${clip}` : clip;
    }
    return text;
  }

  function loadInjuries() {
    return (injuriesPromise ??= (async () => {
      const body = await espn('/injuries');
      const map = new Map<string, Injury[]>();
      for (const group of body.injuries ?? []) {
        const list: Injury[] = [];
        for (const raw of group.injuries ?? []) {
          const status = String(raw.status ?? '');
          if (!status || status === 'Active') continue;
          if (status === 'Out' && isScratch(raw)) continue;
          list.push({
            player: String(raw.athlete?.displayName ?? 'Unknown'),
            pos: String(raw.athlete?.position?.abbreviation ?? ''),
            status,
            detail: injuryDetail(raw),
          });
        }
        list.sort((a, b) => injuryRank(a) - injuryRank(b));
        const label = String(group.displayName ?? '');
        map.set(mode === 'football' ? norm(label) : canon(label), list);
      }
      return map;
    })());
  }

  function points(score: any): number {
    if (typeof score === 'number') return score;
    if (typeof score === 'string') return Number(score);
    return Number(score?.value ?? score?.displayValue ?? NaN);
  }

  function loadSeason(team: EspnTeam) {
    const cached = seasons.get(team.id);
    if (cached) return cached;
    const pending = (async (): Promise<Season | null> => {
      const route = mode === 'football' ? team.abbr.toLowerCase() : team.id;
      const body = await espn(`/teams/${route}/schedule`);
      const games: Played[] = [];
      for (const event of body.events ?? []) {
        if (mode === 'football') {
          const seasonType = event.seasonType?.type;
          if (seasonType !== 2 && seasonType !== 3) continue;
        }
        const comp = event.competitions?.[0];
        if (!comp?.status?.type?.completed) continue;
        const sides = comp.competitors ?? [];
        const us = sides.find((side: any) => side.team?.abbreviation === team.abbr || String(side.team?.id ?? '') === team.id);
        const them = sides.find((side: any) => side !== us);
        if (!us || !them) continue;
        const pointsFor = points(us.score);
        const pointsAgainst = points(them.score);
        const tie = pointsFor === pointsAgainst;
        games.push({
          date: Date.parse(event.date),
          win: us.winner === true || (!tie && pointsFor > pointsAgainst),
          tie,
          pointsFor,
          pointsAgainst,
          opp: String(them.team?.abbreviation ?? 'OPP'),
          home: us.homeAway === 'home',
        });
      }
      games.sort((a, b) => a.date - b.date);
      return { name: team.name, abbr: team.abbr, games };
    })();
    seasons.set(team.id, pending);
    return pending;
  }

  function recordOf(games: Played[]) {
    let wins = 0, losses = 0, ties = 0;
    for (const game of games) {
      if (game.tie) ties += 1;
      else if (game.win) wins += 1;
      else losses += 1;
    }
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  }

  function lastFive(games: Played[]) {
    const recent = games.slice(-5).reverse();
    if (!recent.length) return 'no completed games';
    return recent.map((game) => {
      const mark = game.tie ? 'T' : game.win ? 'W' : 'L';
      const where = game.home ? 'vs' : 'at';
      return `${mark} ${game.pointsFor}-${game.pointsAgainst} ${where} ${game.opp}`;
    }).join(', ');
  }

  function restLabel(games: Played[], commence: number) {
    const previous = [...games].reverse().find((game) => game.date < commence);
    if (!previous) return 'season opener';
    const days = Math.round((commence - previous.date) / 86_400_000);
    if (days >= 12) {
      const gap = mode === 'soccer' ? 'off a break' : 'off a bye';
      return `${gap}, ${days} days rest`;
    }
    return `${days} days rest`;
  }

  function recentForm(games: Played[]) {
    const recent = games.slice(-5);
    if (!recent.length) return { margin: null, scored: null, allowed: null, sentence: '' };
    const margin = recent.reduce((sum, game) => sum + game.pointsFor - game.pointsAgainst, 0) / recent.length;
    const scored = recent.reduce((sum, game) => sum + game.pointsFor, 0) / recent.length;
    const allowed = recent.reduce((sum, game) => sum + game.pointsAgainst, 0) / recent.length;
    const sign = margin > 0 ? '+' : '';
    const noun = mode === 'soccer' ? 'goals' : 'points';
    const sentence = `Last ${recent.length} games: average margin ${sign}${margin.toFixed(1)}, ${scored.toFixed(1)} ${noun} scored, ${allowed.toFixed(1)} allowed.`;
    return { margin, scored, allowed, sentence };
  }

  function shortInjury(list: Injury[]) {
    if (!list.length) return 'no significant injuries listed';
    const injury = list[0];
    const who = injury.pos ? `${injury.player} (${injury.pos})` : injury.player;
    const status = injury.status === 'Injured Reserve' ? 'IR' : injury.status.toLowerCase();
    const type = injury.detail.split('.')[0]?.trim() ?? '';
    const body = type.length > 48 ? `${type.slice(0, 45)}...` : type;
    return body ? `${who} ${status} (${body})` : `${who} ${status}`;
  }

  function injuryText(name: string, list: Injury[]) {
    if (!list.length) return `${name} injury report: nobody listed Out, Doubtful, Questionable, or on injured reserve.`;
    const lines = list.slice(0, 6).map((injury) => {
      const who = injury.pos ? `${injury.player} (${injury.pos})` : injury.player;
      const detail = injury.detail.replace(/\.+$/, '');
      return detail ? `${who} ${injury.status}, ${detail}` : `${who} ${injury.status}`;
    });
    const extra = list.length - lines.length;
    const more = extra > 0 ? `, and ${extra} other${extra === 1 ? '' : 's'} on the report` : '';
    return `${name} injury report: ${lines.join('; ')}${more}.`;
  }

  async function teamBrief(name: string, commence: number, teams: Map<string, EspnTeam>, injuries: Map<string, Injury[]>): Promise<{ prose: string; side: SideBrief }> {
    const unknown = (label: string): { prose: string; side: SideBrief } => ({
      prose: `${name}: ${label}.`,
      side: { name, short: name, record: 'record unavailable', rest: 'rest unavailable', injury: label, margin: null, scored: null, allowed: null },
    });
    const team = findTeam(teams, name);
    if (!team) return unknown('no ESPN team match');
    const season = await loadSeason(team);
    const reportKey = mode === 'football' ? norm(team.name) : canon(team.name);
    const report = injuries.get(reportKey) ?? [];
    if (!season) return unknown('schedule unavailable');
    const record = recordOf(season.games);
    const rest = restLabel(season.games, commence);
    const form = recentForm(season.games);
    return {
      prose: `${team.name} are ${record}, last 5: ${lastFive(season.games)}, ${rest}. ${form.sentence} ${injuryText(team.name, report)}`,
      side: { name: team.name, short: team.short, record, rest, injury: shortInjury(report), margin: form.margin, scored: form.scored, allowed: form.allowed },
    };
  }

  async function getBrief(leg: EvidenceLeg): Promise<GameBrief> {
    const [teams, injuries] = await Promise.all([loadTeams(), loadInjuries()]);
    const commence = Date.parse(leg.commence);
    const kick = new Date(commence).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    const site = leg.home ? `${leg.team} hosting ${leg.opponent}` : `${leg.team} playing at ${leg.opponent}`;
    const [ours, theirs] = await Promise.all([
      teamBrief(leg.team, commence, teams, injuries),
      teamBrief(leg.opponent, commence, teams, injuries),
    ]);
    return {
      text: `${leg.team} to win, ${site}. Kickoff ${kick}. ${ours.prose} ${theirs.prose}`,
      pick: ours.side,
      opponent: theirs.side,
    };
  }

  async function getEvidence(leg: EvidenceLeg): Promise<string> {
    return (await getBrief(leg)).text;
  }

  async function teamAbbr(name: string): Promise<string | null> {
    const teams = await loadTeams();
    return findTeam(teams, name)?.abbr ?? null;
  }

  async function teamShort(name: string): Promise<string | null> {
    const teams = await loadTeams();
    return findTeam(teams, name)?.short ?? null;
  }

  async function teamPath(name: string): Promise<string | null> {
    const teams = await loadTeams();
    const team = findTeam(teams, name);
    if (!team) return null;
    return mode === 'football' ? team.abbr.toLowerCase() : team.id;
  }

  async function injuryFor(teamName: string, playerName: string): Promise<string | null> {
    const [teams, injuries] = await Promise.all([loadTeams(), loadInjuries()]);
    const team = findTeam(teams, teamName);
    const reportKey = mode === 'football' ? norm(team?.name ?? teamName) : canon(team?.name ?? teamName);
    const list = injuries.get(reportKey) ?? [];
    const key = nameKey(playerName);
    const hit = list.find((injury) => nameKey(injury.player) === key);
    if (!hit) return null;
    const status = hit.status === 'Injured Reserve' ? 'IR' : hit.status;
    const detail = hit.detail.split('.')[0]?.trim();
    return detail ? `${status} (${detail})` : status;
  }

  return { getBrief, getEvidence, teamAbbr, teamPath, teamShort, injuryFor };
}

export type SideBrief = {
  name: string;
  short: string;
  record: string;
  rest: string;
  injury: string;
  margin: number | null;
  scored: number | null;
  allowed: number | null;
};

export type GameBrief = {
  text: string;
  pick: SideBrief;
  opponent: SideBrief;
};

const nfl = createClient(NFL_BASE, 'football');
const soccerClients = new Map<string, ReturnType<typeof createClient>>();

export const getBrief = nfl.getBrief;
export const getEvidence = nfl.getEvidence;
export const teamAbbr = nfl.teamAbbr;
export const injuryFor = nfl.injuryFor;

export function evidenceFor(espnSlug: string) {
  const cached = soccerClients.get(espnSlug);
  if (cached) return cached;
  const client = createClient(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}`, 'soccer');
  soccerClients.set(espnSlug, client);
  return client;
}
