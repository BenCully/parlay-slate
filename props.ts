// Risky NFL props for the second tab.
// Lines come from The Odds API event odds (same key as the slate).
// The brief is the player's ESPN game log. No extra account.
import { injuryFor, nameKey } from './evidence.js';
import { loadRosters, recentStat, type PlayerRef } from './players.js';

const BOOKS = ['fanduel', 'draftkings', 'betmgm', 'williamhill_us'];
const SPORT = 'americanfootball_nfl';

const MARKETS = [
  'player_anytime_td',
  'player_pass_yds',
  'player_reception_yds',
  'player_rush_yds',
  'player_receptions',
  'player_pass_tds',
  'player_pass_completions',
  'player_rush_attempts',
  'player_kicking_points',
  'player_field_goals',
];

const CORE = [
  { market: 'player_anytime_td', label: 'Anytime TD', phrase: 'rushing or receiving touchdowns', stat: 'touchdowns' },
  { market: 'player_pass_yds', label: 'Pass yds', phrase: 'passing yards', stat: 'passingYards' },
  { market: 'player_reception_yds', label: 'Rec yds', phrase: 'receiving yards', stat: 'receivingYards' },
  { market: 'player_rush_yds', label: 'Rush yds', phrase: 'rushing yards', stat: 'rushingYards' },
] as const;

const EXTRA = [
  { market: 'player_receptions', label: 'Receptions', phrase: 'receptions', stat: 'receptions' },
  { market: 'player_pass_tds', label: 'Pass TDs', phrase: 'passing touchdowns', stat: 'passingTouchdowns' },
  { market: 'player_pass_completions', label: 'Completions', phrase: 'completions', stat: 'completions' },
  { market: 'player_rush_attempts', label: 'Rush att', phrase: 'rush attempts', stat: 'rushingAttempts' },
  { market: 'player_kicking_points', label: 'Kick pts', phrase: 'kicking points', stat: 'totalKickingPoints' },
  { market: 'player_field_goals', label: 'Field goals', phrase: 'field goals made', stat: 'fieldGoalsMade-fieldGoalAttempts' },
] as const;

type MarketInfo = { market: string; label: string; phrase: string; stat: string };

export type SlateGame = {
  eventId: string;
  home: string;
  away: string;
  commence: string;
  homeImplied: number;
  awayImplied: number;
};

export type PropCheck = {
  verdict: 'supported' | 'contradicted' | 'unsupported';
  confidence: number;
  status: 'ready' | 'review';
  probabilities?: { supported?: number };
};

type Claim = { id: string; claim: string; evidence: string };

type SideName = 'Over' | 'Under' | 'Yes';

type Posted = {
  playerName: string;
  point: number | null;
  overPrice: number | null;
  underPrice: number | null;
  yesPrice: number | null;
};

type Brief = { evidence: string; blurb: string };

type YardRow = {
  kind: 'yard';
  team: string;
  opponent: string;
  home: boolean;
  commence: string;
  player: PlayerRef;
  info: MarketInfo;
  point: number;
  overPrice: number;
  underPrice: number;
  overId: string;
  underId: string;
  overBrief: Brief;
  underBrief: Brief;
};

type SingleRow = {
  kind: 'single';
  team: string;
  opponent: string;
  home: boolean;
  commence: string;
  player: PlayerRef;
  info: MarketInfo;
  side: SideName;
  point: number | null;
  price: number;
  implied: number;
  id: string;
  extra: boolean;
  brief: Brief;
};

type MissingRow = {
  kind: 'missing';
  team: string;
  label: string;
  reason: string;
};

type Built = YardRow | SingleRow | MissingRow;

function implied(american: number) {
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

function priceText(price: number) {
  return `${price > 0 ? '+' : ''}${price}`;
}

function points(value: number) {
  return value.toFixed(1);
}

function nick(name: string) {
  return name.split(' ').at(-1) ?? name;
}

function kickoffLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function outcomesFor(books: any[], market: string) {
  const ordered = [
    ...BOOKS.map((key) => books.find((book) => book.key === key)).filter(Boolean),
    ...books,
  ];
  for (const book of ordered) {
    const outcomes = book.markets?.find((item: any) => item.key === market)?.outcomes;
    if (outcomes?.length) return outcomes as any[];
  }
  return [];
}

function postedLines(outcomes: any[]): Posted[] {
  const groups = new Map<string, Posted>();
  for (const outcome of outcomes) {
    const rawName = String(outcome.name ?? '');
    const playerName = String(outcome.description || (!['Over', 'Under', 'Yes', 'No'].includes(rawName) ? rawName : '')).trim();
    if (!playerName) continue;
    const point = outcome.point == null ? null : Number(outcome.point);
    const key = `${nameKey(playerName)}|${point ?? 'yes'}`;
    const row = groups.get(key) ?? { playerName, point, overPrice: null, underPrice: null, yesPrice: null };
    const price = Number(outcome.price);
    if (!Number.isFinite(price)) continue;
    if (rawName === 'Over') row.overPrice = price;
    else if (rawName === 'Under') row.underPrice = price;
    else if (rawName === 'Yes' || rawName === playerName) row.yesPrice = price;
    groups.set(key, row);
  }
  const byPlayer = new Map<string, Posted[]>();
  for (const row of groups.values()) {
    const list = byPlayer.get(nameKey(row.playerName)) ?? [];
    list.push(row);
    byPlayer.set(nameKey(row.playerName), list);
  }
  const main: Posted[] = [];
  for (const lines of byPlayer.values()) {
    const ranked = lines.slice().sort((a, b) => {
      const aPrice = a.overPrice ?? a.yesPrice ?? a.underPrice ?? 0;
      const bPrice = b.overPrice ?? b.yesPrice ?? b.underPrice ?? 0;
      return Math.abs(implied(aPrice) - 0.5) - Math.abs(implied(bPrice) - 0.5);
    });
    if (ranked[0]) main.push(ranked[0]);
  }
  return main;
}

function mix(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function pickExtra<T extends { implied: number; market: string; player: string }>(team: string, options: T[]): T | null {
  if (!options.length) return null;
  const likely = options
    .filter((option) => option.implied >= 0.6)
    .sort((a, b) => b.implied - a.implied || a.market.localeCompare(b.market) || a.player.localeCompare(b.player));
  const best = options.slice().sort((a, b) => b.implied - a.implied || a.player.localeCompare(b.player))[0];
  const pool = likely.length ? likely.slice(0, 4) : best ? [best] : [];
  if (!pool.length) return null;
  return pool[mix(team) % pool.length];
}

export function pickLayeredExtra<T extends { implied: number; market: string; player: string }>(team: string, tiers: T[][]): T | null {
  for (let index = 0; index < tiers.length; index++) {
    const tier = tiers[index];
    if (!tier.length) continue;
    const likely = tier.filter((option) => option.implied >= 0.6);
    if (likely.length) return pickExtra(team, likely);
    if (index === tiers.length - 1) return pickExtra(team, tier);
  }
  return null;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

async function fetchEvent(eventId: string, apiKey: string) {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds` +
    `?regions=us&oddsFormat=american&markets=${MARKETS.join(',')}`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  const remaining = res.headers.get('x-requests-remaining');
  const body = await res.json() as any;
  if (!res.ok) {
    const message = body?.message || body?.error || res.statusText;
    throw new Error(`Odds API ${res.status}: ${message}`);
  }
  return { body, remaining: remaining == null ? null : Number(remaining) };
}

function support(check: PropCheck) {
  return check.probabilities?.supported ?? check.confidence;
}

function sideLabel(check: PropCheck | undefined) {
  if (!check) return 'No call';
  const confidence = check.confidence.toFixed(2);
  if (check.verdict === 'supported' && check.status === 'ready') return `Ready ${confidence}`;
  if (check.verdict === 'supported') return `Review ${confidence}`;
  return `Pass ${confidence}`;
}

function gateSentence(check: PropCheck | undefined, thing: string) {
  if (!check) return 'Verify did not return a decision.';
  const confidence = check.confidence.toFixed(2);
  if (check.verdict === 'supported' && check.status === 'ready') return `Verify supports the ${thing} at ${confidence}, which clears 0.80.`;
  if (check.verdict === 'supported') return `Verify leans toward the ${thing} at ${confidence}, short of 0.80.`;
  if (check.verdict === 'contradicted') return `Verify says the log cuts against the ${thing} at ${confidence}.`;
  return `Verify says the log does not establish the ${thing} at ${confidence}.`;
}

function lineText(label: string, side: SideName, point: number | null, price: number) {
  if (point == null || side === 'Yes') return `${label} ${priceText(price)}`;
  return `${label} ${side.toLowerCase()} ${points(point)} (${priceText(price)})`;
}

function slipText(player: string, label: string, side: SideName, point: number | null, price: number, check: PropCheck | undefined) {
  if (check?.verdict !== 'supported') return 'Pass';
  const who = nick(player);
  if (point == null || side === 'Yes') return `Take ${who} anytime TD ${priceText(price)}`;
  return `Take ${who} ${side.toLowerCase()} ${points(point)} ${label.toLowerCase()}`;
}

function thingFor(label: string, side: SideName) {
  if (side === 'Yes') return 'anytime touchdown';
  return `${side.toLowerCase()} ${label.toLowerCase()}`;
}

export async function loadPropBoard(games: SlateGame[]) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY is not set.');
  const notes: string[] = [];
  let remaining: number | null = null;
  if (!games.length) {
    return {
      claims: [] as Claim[],
      remaining,
      finish(_checks: Array<PropCheck & { id: string }>, problem?: string) {
        return finishBoard([], new Map(), problem ? [problem, 'No upcoming games to price.'] : ['No upcoming games to price.']);
      },
    };
  }

  console.log(`Pulling player props for ${games.length} game${games.length === 1 ? '' : 's'}...`);
  const events = await mapPool(games, 3, async (game) => {
    try {
      const result = await fetchEvent(game.eventId, apiKey);
      if (result.remaining != null) remaining = result.remaining;
      return { game, books: (result.body.bookmakers ?? []) as any[], error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'props request failed';
      return { game, books: [] as any[], error: message };
    }
  });

  const teamNames = [...new Set(games.flatMap((game) => [game.home, game.away]))];
  const rosters = await loadRosters(teamNames);
  if (rosters.failed.length) {
    notes.push(`ESPN roster missing for ${rosters.failed.map(nick).join(', ')}.`);
  }

  const jobs = events.flatMap((event) => {
    if (event.error) {
      notes.push(`${nick(event.game.away)} at ${nick(event.game.home)}: ${event.error}.`);
      return [];
    }
    const teams = [
      { name: event.game.away, home: false, implied: event.game.awayImplied, opponent: event.game.home },
      { name: event.game.home, home: true, implied: event.game.homeImplied, opponent: event.game.away },
    ].sort((a, b) => b.implied - a.implied);
    return teams.map((team) => ({ game: event.game, team, books: event.books }));
  });
  const built = await mapPool(jobs, 6, async (job) => {
    const markets = new Map(MARKETS.map((market) => [market, postedLines(outcomesFor(job.books, market))]));
    const core = await Promise.all(CORE.map((info) => coreRow(job.game, job.team, info, markets.get(info.market) ?? [], rosters.match)));
    const featured = new Set(core.flatMap((row) => row.kind === 'missing' ? [] : [nameKey(row.player.name)]));
    const extra = await extraRow(job.game, job.team, markets, rosters.match, featured);
    return [...core, extra];
  });

  const claims = built.flat().flatMap(claimsFor);
  return {
    claims,
    remaining,
    finish(checks: Array<PropCheck & { id: string }>, problem?: string) {
      const verdicts = new Map(checks.map((check) => [check.id, check]));
      return finishBoard(built, verdicts, problem ? [problem, ...notes] : notes);
    },
  };
}

function claimsFor(row: Built): Claim[] {
  if (row.kind === 'missing') return [];
  if (row.kind === 'single') {
    return [{ id: row.id, claim: claimText(row.player.name, row.info, row.side, row.point, row.opponent, row.commence), evidence: row.brief.evidence }];
  }
  return [
    { id: row.overId, claim: claimText(row.player.name, row.info, 'Over', row.point, row.opponent, row.commence), evidence: row.overBrief.evidence },
    { id: row.underId, claim: claimText(row.player.name, row.info, 'Under', row.point, row.opponent, row.commence), evidence: row.underBrief.evidence },
  ];
}

function claimText(player: string, info: MarketInfo, side: SideName, point: number | null, opponent: string, commence: string) {
  const when = kickoffLabel(commence);
  if (info.market === 'player_anytime_td' || side === 'Yes') {
    return `${player} scores a touchdown against ${opponent} on ${when}.`;
  }
  const word = side === 'Over' ? 'more than' : 'fewer than';
  return `${player} has ${word} ${points(point ?? 0)} ${info.phrase} against ${opponent} on ${when}.`;
}

async function describe(player: PlayerRef, info: MarketInfo, side: 'over' | 'under' | 'yes', point: number | null, team: string, opponent: string, home: boolean, commence: string): Promise<Brief> {
  const [stat, injury] = await Promise.all([
    recentStat(player, info.stat, info.phrase),
    injuryFor(team, player.name),
  ]);
  const place = home ? 'at home' : 'on the road';
  const when = kickoffLabel(commence);
  const health = injury
    ? `${player.name} is ${injury} on the injury report.`
    : `${player.name} is not listed Out, Doubtful, Questionable, or on IR.`;
  const blurb = `${health} ${stat(side, point)}`;
  return {
    blurb,
    evidence: `${player.name} (${player.pos || 'player'}), ${team}, ${place} against ${opponent}, ${when}. ${blurb}`,
  };
}

async function coreRow(
  game: SlateGame,
  team: { name: string; home: boolean; opponent: string },
  info: (typeof CORE)[number],
  lines: Posted[],
  match: (team: string, player: string) => PlayerRef | null,
): Promise<Built> {
  const matched = lines.flatMap((line) => {
    const player = match(team.name, line.playerName);
    return player ? [{ line, player }] : [];
  });
  if (!matched.length) {
    return { kind: 'missing', team: team.name, label: info.label, reason: `No ${info.label.toLowerCase()} line was posted for a ${nick(team.name)} player.` };
  }
  if (info.market === 'player_anytime_td') {
    const priced = matched.flatMap((row) => {
      const yes = row.line.yesPrice;
      const touchdownOver = row.line.overPrice != null && row.line.underPrice == null ? row.line.overPrice : null;
      const price = yes ?? touchdownOver;
      return price == null ? [] : [{ row, price }];
    }).sort((a, b) => implied(b.price) - implied(a.price));
    const best = priced[0];
    if (!best) return { kind: 'missing', team: team.name, label: info.label, reason: `No anytime touchdown price was posted for the ${nick(team.name)}.` };
    const price = best.price;
    return {
      kind: 'single',
      team: team.name,
      opponent: team.opponent,
      home: team.home,
      commence: game.commence,
      player: best.row.player,
      info,
      side: 'Yes',
      point: null,
      price,
      implied: implied(price),
      id: idFor(game.eventId, info.market, best.row.player.name, 'yes'),
      extra: false,
      brief: await describe(best.row.player, info, 'yes', null, team.name, team.opponent, team.home, game.commence),
    };
  }
  const best = matched
    .filter((row) => row.line.point != null && row.line.overPrice != null && row.line.underPrice != null)
    .sort((a, b) => b.line.point! - a.line.point!)[0];
  if (!best) return { kind: 'missing', team: team.name, label: info.label, reason: `No ${info.label.toLowerCase()} over/under was posted for the ${nick(team.name)}.` };
  const [overBrief, underBrief] = await Promise.all([
    describe(best.player, info, 'over', best.line.point, team.name, team.opponent, team.home, game.commence),
    describe(best.player, info, 'under', best.line.point, team.name, team.opponent, team.home, game.commence),
  ]);
  return {
    kind: 'yard',
    team: team.name,
    opponent: team.opponent,
    home: team.home,
    commence: game.commence,
    player: best.player,
    info,
    point: best.line.point!,
    overPrice: best.line.overPrice!,
    underPrice: best.line.underPrice!,
    overId: idFor(game.eventId, info.market, best.player.name, 'over'),
    underId: idFor(game.eventId, info.market, best.player.name, 'under'),
    overBrief,
    underBrief,
  };
}

type ExtraOption = {
  implied: number;
  market: string;
  player: string;
  info: (typeof EXTRA)[number];
  posted: Posted;
  ref: PlayerRef;
  side: 'Over' | 'Under';
  price: number;
};

function isRealLine(option: ExtraOption) {
  const point = option.posted.point ?? 0;
  const over = option.side === 'Over';
  if (option.market === 'player_receptions') return over ? point >= 3.5 : point >= 4.5;
  if (option.market === 'player_pass_completions') return point >= 14.5;
  if (option.market === 'player_rush_attempts') return option.ref.pos === 'QB' ? point >= 3.5 : point >= 8.5;
  if (option.market === 'player_kicking_points') return point >= 4.5;
  if (option.market === 'player_field_goals') return point >= 1.5;
  if (option.market === 'player_pass_tds') return true;
  return false;
}

function isFeatured(option: ExtraOption, featured: Set<string>) {
  if (featured.has(nameKey(option.ref.name))) return true;
  const kicker = option.ref.pos === 'PK' || option.ref.pos === 'K';
  return kicker && (option.market === 'player_kicking_points' || option.market === 'player_field_goals');
}

async function extraRow(
  game: SlateGame,
  team: { name: string; home: boolean; opponent: string },
  markets: Map<string, Posted[]>,
  match: (team: string, player: string) => PlayerRef | null,
  featured: Set<string>,
): Promise<Built> {
  const options: ExtraOption[] = [];
  for (const info of EXTRA) {
    for (const posted of markets.get(info.market) ?? []) {
      const ref = match(team.name, posted.playerName);
      if (!ref || posted.point == null) continue;
      const sides: { side: 'Over' | 'Under'; price: number | null }[] = [
        { side: 'Over', price: posted.overPrice },
        { side: 'Under', price: posted.underPrice },
      ];
      for (const side of sides) {
        if (side.price == null) continue;
        options.push({
          implied: implied(side.price),
          market: info.market,
          player: ref.name,
          info,
          posted,
          ref,
          side: side.side,
          price: side.price,
        });
      }
    }
  }
  const real = options.filter(isRealLine);
  const picked = pickLayeredExtra(team.name, [
    real.filter((option) => isFeatured(option, featured)),
    real,
    options,
  ]);
  if (!picked) {
    return { kind: 'missing', team: team.name, label: 'Extra', reason: `No other short-priced prop was posted for the ${nick(team.name)}.` };
  }
  const sideWord = picked.side === 'Over' ? 'over' : 'under';
  return {
    kind: 'single',
    team: team.name,
    opponent: team.opponent,
    home: team.home,
    commence: game.commence,
    player: picked.ref,
    info: picked.info,
    side: picked.side,
    point: picked.posted.point,
    price: picked.price,
    implied: picked.implied,
    id: idFor(game.eventId, picked.market, picked.ref.name, sideWord),
    extra: true,
    brief: await describe(picked.ref, picked.info, sideWord, picked.posted.point, team.name, team.opponent, team.home, game.commence),
  };
}

function idFor(eventId: string, market: string, player: string, side: string) {
  return `${eventId}:${market}:${nameKey(player)}:${side}`;
}

function finishBoard(groups: Built[][], verdicts: Map<string, PropCheck>, notes: string[]) {
  const rows = groups.map((group) => group.map((row) => paint(row, verdicts)));
  const base = 'Each team has an anytime touchdown, passing yards, receiving yards, and rushing yards. The last row is another stat with a short price, chosen for that team from receptions, passing touchdowns, completions, rush attempts, kicking points, and field goals. It stays on a player already in the team block, or the kicker, and skips tiny unders such as a backup staying under 1.5 receptions. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.';
  const extra = notes.filter(Boolean);
  return {
    title: 'Player props for every team still to kick off. The last row on each team is a likely extra stat.',
    groups: rows,
    note: [base, ...extra].join(' '),
  };
}

function paint(row: Built, verdicts: Map<string, PropCheck>): string[] {
  const team = nick(row.team);
  if (row.kind === 'missing') return [team, '', row.label, 'No line', 'Pass', row.reason];
  if (row.kind === 'yard') {
    const over = verdicts.get(row.overId);
    const under = verdicts.get(row.underId);
    const underWins = (under ? support(under) : -1) > (over ? support(over) : -1);
    const side: SideName = underWins ? 'Under' : 'Over';
    const price = underWins ? row.underPrice : row.overPrice;
    const check = underWins ? under : over;
    const blurb = underWins ? row.underBrief.blurb : row.overBrief.blurb;
    return [
      team,
      row.player.name,
      lineText(row.info.label, side, row.point, price),
      sideLabel(check),
      slipText(row.player.name, row.info.label, side, row.point, price, check),
      comment(row, side, row.point, price, check, false, blurb),
    ];
  }
  const check = verdicts.get(row.id);
  const chance = row.extra ? ` Priced at ${(row.implied * 100).toFixed(1)}%, the extra stat for the ${team}.` : '';
  return [
    team,
    row.player.name,
    lineText(row.info.label, row.side, row.point, row.price),
    sideLabel(check),
    slipText(row.player.name, row.info.label, row.side, row.point, row.price, check),
    `${comment(row, row.side, row.point, row.price, check, row.extra, row.brief.blurb)}${chance}`,
  ];
}

function comment(row: YardRow | SingleRow, side: SideName, point: number | null, price: number, check: PropCheck | undefined, extra: boolean, blurb: string) {
  const place = row.home ? 'at home' : 'on the road';
  const lead = extra ? 'Extra. ' : '';
  return `${lead}${row.player.name} (${row.player.pos || 'player'}) ${lineText(row.info.label, side, point, price)}, ${place} vs the ${nick(row.opponent)}. ${blurb} ${gateSentence(check, thingFor(row.info.label, side))}`;
}
