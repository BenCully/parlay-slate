// One Games board and its Props board. The sport module supplies the odds key, the window, and the brief.
import { rerank, verify } from '../decisions/judge.js';
import { BOOKS } from '../odds/books.js';
import type { GameBrief } from '../espn/evidence.js';
import { ageLabel, oddsGet, oddsReplayDay } from '../odds/cache.js';
import { loadPropBoard, type SlateGame } from '../props/board.js';
import type { SavedBoard, SavedProps } from '../ui/screen.js';
import type { BoardSource } from '../sports/types.js';

const MIN_IMPLIED = 0.6;

type Quote = { point: number; price: number };

type Leg = {
  id: string;
  eventId: string;
  game: string;
  pick: string;
  team: string;
  opponent: string;
  home: boolean;
  price: number;
  implied: number;
  commence: string;
  spread: Quote | null;
  total: { point: number; overPrice: number; underPrice: number } | null;
};

function implied(american: number) {
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

function toDecimal(american: number) {
  return american < 0 ? 1 + 100 / -american : 1 + american / 100;
}

function priceText(price: number) {
  return `${price > 0 ? '+' : ''}${price}`;
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

function cacheSentence(cachedAt: string | null) {
  if (!cachedAt) return '';
  const when = `Game prices are from the odds cache, saved ${ageLabel(cachedAt)}.`;
  const replay = oddsReplayDay();
  if (replay) return `${when} Replay of odds saved on ${replay}. Games that have since kicked off stay in this slate. No Odds API request was made.`;
  return `${when} npm start -- --fresh spends credits on new lines.`;
}

function withCache(note: string | undefined, cachedAt: string | null) {
  const extra = cacheSentence(cachedAt);
  const text = [note, extra].filter(Boolean).join(' ');
  return text || undefined;
}

async function getLegs(oddsKey: string, from: string, to: string, threeWay: boolean): Promise<{ legs: Leg[]; cachedAt: string | null }> {
  const url = `https://api.the-odds-api.com/v4/sports/${oddsKey}/odds?apiKey=${process.env.ODDS_API_KEY}` +
    `&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${from}&commenceTimeTo=${to}`;
  const result = await oddsGet(url);
  const body = result.body;
  if (!Array.isArray(body)) throw new Error('Odds API returned an unexpected payload.');
  if (result.cached) console.log(`Odds cache hit for ${oddsKey} (${ageLabel(result.savedAt)}).`);
  else console.log(`Fetched ${oddsKey} odds.${result.remaining == null ? '' : ` Credits remaining: ${result.remaining}.`}`);
  const legs = body.flatMap((game: any) => {
    if (!oddsReplayDay() && Date.parse(game.commence_time) <= Date.now()) return [];
    const books: any[] = game.bookmakers ?? [];
    const moneylines = outcomesFor(books, 'h2h');
    const spreads = outcomesFor(books, 'spreads');
    const totals = outcomesFor(books, 'totals');
    const over = totals.find((outcome) => outcome.name === 'Over');
    const under = totals.find((outcome) => outcome.name === 'Under');
    const total = over && under
      ? { point: Number(over.point), overPrice: Number(over.price), underPrice: Number(under.price) }
      : null;
    return moneylines.flatMap((outcome) => {
      if (threeWay && /^(draw|tie)$/i.test(String(outcome.name))) return [];
      const spreadOutcome = spreads.find((quote) => quote.name === outcome.name);
      return [{
        id: `${game.id}:${outcome.name}`,
        eventId: String(game.id),
        game: `${game.away_team} @ ${game.home_team}`,
        pick: `${outcome.name} to win`,
        team: outcome.name,
        opponent: outcome.name === game.home_team ? game.away_team : game.home_team,
        home: outcome.name === game.home_team,
        price: outcome.price,
        implied: implied(outcome.price),
        commence: game.commence_time,
        spread: spreadOutcome ? { point: Number(spreadOutcome.point), price: Number(spreadOutcome.price) } : null,
        total,
      }];
    });
  });
  return { legs, cachedAt: result.cached ? result.savedAt : null };
}

let teamShorts: Map<string, string> | undefined;

function nick(name: string) {
  return teamShorts?.get(name) ?? name.split(' ').at(-1) ?? name;
}

function listNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function restPhrase(rest: string) {
  if (rest.startsWith('off a bye')) return 'off a bye';
  if (rest.startsWith('off a break')) return 'off a break';
  if (rest === 'season opener') return 'in their season opener';
  return `on ${rest}`;
}

type Judgment =
  | { kind: 'dropped' }
  | { kind: 'checked'; verdict: 'supported' | 'contradicted' | 'unsupported'; confidence: number; status: 'ready' | 'review' };

function decisionLabel(judgment: Judgment) {
  if (judgment.kind === 'dropped') return 'Dropped';
  const word = judgment.status === 'ready' ? 'Ready' : 'Review';
  return `${word} ${judgment.confidence.toFixed(2)}`;
}

function points(value: number) {
  return value.toFixed(1);
}

function signed(value: number) {
  const text = value.toFixed(1);
  return value > 0 ? `+${text}` : text;
}

function marginText(side: GameBrief['pick']) {
  return side.margin == null ? 'no recent games' : `${signed(side.margin)} per game over the last 5`;
}

function scoringText(side: GameBrief['pick']) {
  if (side.scored == null || side.allowed == null) return 'no recent games';
  return `${side.scored.toFixed(1)} scored and ${side.allowed.toFixed(1)} allowed`;
}

function lineContext(leg: Leg, brief: GameBrief) {
  return [
    `${brief.pick.name} are ${brief.pick.record}, ${brief.pick.rest}, margin ${marginText(brief.pick)}, scoring ${scoringText(brief.pick)}. Injury: ${brief.pick.injury}.`,
    `${brief.opponent.name} are ${brief.opponent.record}, ${brief.opponent.rest}, margin ${marginText(brief.opponent)}, scoring ${scoringText(brief.opponent)}. Injury: ${brief.opponent.injury}.`,
    leg.home ? `${leg.team} is at home.` : `${leg.team} is on the road.`,
  ].join(' ');
}

function spreadClaim(leg: Leg, unit: string) {
  const point = leg.spread!.point;
  const when = kickoffLabel(leg.commence);
  if (point < 0) return `${leg.team} wins by more than ${Math.abs(point)} ${unit} on ${when}.`;
  if (point > 0) return `${leg.team} covers ${signed(point)} on ${when}.`;
  return `${leg.team} does not lose on ${when}.`;
}

type Check = {
  verdict: 'supported' | 'contradicted' | 'unsupported';
  confidence: number;
  status: 'ready' | 'review';
  probabilities?: { supported?: number };
};

function gateSentence(check: Check, thing: string) {
  const confidence = check.confidence.toFixed(2);
  if (check.verdict === 'supported' && check.status === 'ready') return `Verify supports the ${thing} at ${confidence}, which clears 0.80.`;
  if (check.verdict === 'supported') return `Verify leans toward the ${thing} at ${confidence}, short of 0.80.`;
  if (check.verdict === 'contradicted') return `Verify says the brief cuts against the ${thing} at ${confidence}.`;
  return `Verify says the brief does not establish the ${thing} at ${confidence}.`;
}

function sideLabel(check: Check) {
  const confidence = check.confidence.toFixed(2);
  if (check.verdict === 'supported' && check.status === 'ready') return `Ready ${confidence}`;
  if (check.verdict === 'supported') return `Review ${confidence}`;
  return `Pass ${confidence}`;
}

function moneylineSlip(leg: Leg, judgment: Judgment) {
  if (judgment.kind === 'checked' && judgment.verdict === 'supported') return `Take ${nick(leg.team)} ${priceText(leg.price)}`;
  return 'Pass';
}

function spreadSlip(leg: Leg, check: Check) {
  const point = leg.spread!.point;
  if (check.verdict === 'supported') return `Take ${nick(leg.team)} ${signed(point)}`;
  if (check.verdict === 'contradicted') return `Take ${nick(leg.opponent)} ${signed(-point)}`;
  return 'Pass';
}

function totalSlip(side: 'Over' | 'Under', point: number, check: Check) {
  if (check.verdict !== 'supported') return 'Pass';
  return `Take the ${side.toLowerCase()} ${points(point)}`;
}

function decisionComment(leg: Leg, brief: GameBrief, judgment: Judgment) {
  const opp = nick(brief.opponent.name);
  const article = teamShorts ? '' : 'the ';
  const site = leg.home ? `hosting ${article}${opp}` : `at ${article}${opp}`;
  const facts = `${brief.pick.record}, ${restPhrase(brief.pick.rest)}, ${site} (${brief.opponent.record}, ${restPhrase(brief.opponent.rest)}).`;
  const notes = [brief.pick, brief.opponent]
    .filter((side) => side.injury !== 'no significant injuries listed')
    .map((side) => `${nick(side.name)}, ${side.injury}`);
  const injuries = notes.length ? `Injuries: ${notes.join('; ')}.` : 'No significant injuries on either report.';
  const call = judgment.kind === 'dropped'
    ? 'Rerank scored the brief under 0.60, so the win was never checked. Left out.'
    : judgment.verdict === 'supported' && judgment.status === 'ready'
      ? `Verify says the brief supports the win at ${judgment.confidence.toFixed(2)}, which clears 0.80. Eligible for a parlay.`
      : judgment.verdict === 'supported'
        ? `Verify leans toward the win at ${judgment.confidence.toFixed(2)}, short of 0.80. Left out.`
        : judgment.verdict === 'contradicted'
          ? `Verify says the brief cuts against the win at ${judgment.confidence.toFixed(2)}. Left out.`
          : `Verify says the brief does not establish the win at ${judgment.confidence.toFixed(2)}. Left out.`;
  return `${facts} ${injuries} ${call}`;
}

function spreadComment(leg: Leg, brief: GameBrief, check: Check) {
  const quote = leg.spread!;
  return [
    `${nick(leg.team)} ${signed(quote.point)} (${priceText(quote.price)}).`,
    `Last 5 margin: ${nick(brief.pick.name)} ${marginText(brief.pick)}; ${nick(brief.opponent.name)} ${marginText(brief.opponent)}.`,
    gateSentence(check, 'cover'),
  ].join(' ');
}

function supportChance(check: Check) {
  return check.probabilities?.supported ?? check.confidence;
}

function totalComment(leg: Leg, brief: GameBrief, side: 'Over' | 'Under', check: Check, otherSide: 'Over' | 'Under', other: Check) {
  const quote = leg.total!;
  const price = side === 'Over' ? quote.overPrice : quote.underPrice;
  return [
    `${side} ${points(quote.point)} (${priceText(price)}).`,
    `${nick(brief.pick.name)} last 5: ${scoringText(brief.pick)}. ${nick(brief.opponent.name)} last 5: ${scoringText(brief.opponent)}.`,
    `The ${side.toLowerCase()} is the stronger side (${supportChance(check).toFixed(2)} vs ${supportChance(other).toFixed(2)}).`,
    gateSentence(check, side === 'Over' ? 'over' : 'under'),
  ].join(' ');
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

function slateGames(legs: Leg[]): SlateGame[] {
  const games = new Map<string, SlateGame>();
  for (const leg of legs) {
    const home = leg.home ? leg.team : leg.opponent;
    const away = leg.home ? leg.opponent : leg.team;
    const current = games.get(leg.eventId) ?? {
      eventId: leg.eventId,
      home,
      away,
      commence: leg.commence,
      homeImplied: 0,
      awayImplied: 0,
    };
    if (leg.home) current.homeImplied = leg.implied;
    else current.awayImplied = leg.implied;
    games.set(leg.eventId, current);
  }
  return [...games.values()].sort((a, b) => Math.max(b.homeImplied, b.awayImplied) - Math.max(a.homeImplied, a.awayImplied));
}

async function verifyAll(claims: { id: string; claim: string; evidence: string }[]) {
  const checks = [];
  const size = 50;
  for (let index = 0; index < claims.length; index += size) {
    const slice = claims.slice(index, index + size);
    console.log(`Checking ${index + slice.length} of ${claims.length} claims...`);
    const result = await verify({ claims: slice, minConfidence: 0.8 });
    checks.push(...result.checks);
  }
  return checks;
}

async function propTab(pending: ReturnType<typeof loadPropBoard>): Promise<SavedProps> {
  try {
    const board = await pending;
    let problem = '';
    const checks = board.claims.length
      ? await verifyAll(board.claims).catch((error: unknown) => {
        problem = error instanceof Error ? error.message : 'The prop decision check failed.';
        return [];
      })
      : [];
    if (board.remaining != null) console.log(`Odds API credits remaining: ${board.remaining}.`);
    return board.finish(checks, problem || undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Player props failed.';
    return { title: 'Player props', groups: [], note: message };
  }
}

export type BuiltBoard = SavedBoard & { props: SavedProps };

export async function buildBoard(source: BoardSource, day: string | undefined): Promise<BuiltBoard> {
  try {
    return await buildBoardInner(source, day);
  } finally {
    teamShorts = undefined;
  }
}

async function buildBoardInner(source: BoardSource, day: string | undefined): Promise<BuiltBoard> {
  const slate = await source.window(day);
  const pulled = await getLegs(source.oddsKey, slate.from, slate.to, source.threeWay);
  const allLegs = pulled.legs;
  const cachedAt = pulled.cachedAt;
  const legs = allLegs.filter((leg) => leg.implied >= MIN_IMPLIED);
  const propBoard = source.profile === null ? null : loadPropBoard(slateGames(allLegs), source.profile);
  propBoard?.catch(() => {});
  const games = new Set(legs.map((leg) => leg.game)).size;
  const replay = oddsReplayDay();
  const title = replay
    ? `${slate.label}. Odds saved on ${replay}: ${games} game${games === 1 ? '' : 's'} with a favorite at 60% or better.`
    : `${slate.label}: ${games} upcoming game${games === 1 ? '' : 's'} with a favorite at 60% or better.`;
  const skippedProps = { title: 'Player props', groups: [] as string[][][], note: source.propsNote };
  console.log(title);
  if (!legs.length) {
    const props = propBoard ? await propTab(propBoard) : skippedProps;
    console.log('No qualifying legs.');
    return { title, groups: [], note: withCache('No qualifying legs.', cachedAt), props };
  }

  const briefs = await Promise.all(legs.map(async (leg) => ({ leg, brief: await source.getBrief(leg) })));
  if (source.shortNames) {
    teamShorts = new Map();
    for (const { leg, brief } of briefs) {
      teamShorts.set(leg.team, brief.pick.short);
      teamShorts.set(leg.opponent, brief.opponent.short);
      teamShorts.set(brief.pick.name, brief.pick.short);
      teamShorts.set(brief.opponent.name, brief.opponent.short);
    }
  }
  const ranked = await rerank({
    query: source.query,
    items: briefs.map((row) => ({ id: row.leg.id, text: `${row.leg.pick}. ${row.brief.text}` })),
    topK: 8,
    minRelevance: 0.6,
  });
  const rankedIds = new Set(ranked.items.map((item) => item.id));

  const claims = briefs.flatMap(({ leg, brief }) => {
    const rows = rankedIds.has(leg.id)
      ? [{
          id: leg.id,
          claim: `${leg.pick} on ${kickoffLabel(leg.commence)}.`,
          evidence: brief.text,
        }]
      : [];
    if (leg.spread) {
      rows.push({
        id: `${leg.id}:spread`,
        claim: spreadClaim(leg, source.unit),
        evidence: lineContext(leg, brief),
      });
    }
    if (leg.total) {
      const when = kickoffLabel(leg.commence);
      rows.push(
        {
          id: `${leg.id}:over`,
          claim: `${leg.game} goes over ${points(leg.total.point)} total ${source.unit} on ${when}.`,
          evidence: lineContext(leg, brief),
        },
        {
          id: `${leg.id}:under`,
          claim: `${leg.game} stays under ${points(leg.total.point)} total ${source.unit} on ${when}.`,
          evidence: lineContext(leg, brief),
        },
      );
    }
    return rows;
  });
  const checks = claims.length ? await verifyAll(claims) : [];
  const verdict = new Map(checks.map((check) => [check.id, check]));
  const ordered = [...briefs].sort((a, b) => b.leg.implied - a.leg.implied);

  const groups = ordered.map(({ leg, brief }) => {
      const check = verdict.get(leg.id);
      const judgment: Judgment = !rankedIds.has(leg.id) || !check
        ? { kind: 'dropped' }
        : { kind: 'checked', verdict: check.verdict, confidence: check.confidence, status: check.status };
      const moneyline = [
        leg.team,
        priceText(leg.price),
        `${(leg.implied * 100).toFixed(1)}%`,
        decisionLabel(judgment),
        moneylineSlip(leg, judgment),
        decisionComment(leg, brief, judgment),
      ];
      const spreadCheck = verdict.get(`${leg.id}:spread`);
      const spread = !leg.spread
        ? ['  Spread', 'n/a', 'n/a', 'No line', 'Pass', 'This book did not post a spread.']
        : !spreadCheck
          ? ['  Spread', signed(leg.spread.point), priceText(leg.spread.price), 'No call', 'Pass', 'Verify did not return a spread decision.']
          : [
              '  Spread',
              signed(leg.spread.point),
              priceText(leg.spread.price),
              sideLabel(spreadCheck),
              spreadSlip(leg, spreadCheck),
              spreadComment(leg, brief, spreadCheck),
            ];
      const overCheck = verdict.get(`${leg.id}:over`);
      const underCheck = verdict.get(`${leg.id}:under`);
      const total = totalRow(leg, brief, overCheck, underCheck);
      return [moneyline, spread, total];
    });

  const keep = checks
    .filter((check) => check.status === 'ready' && check.verdict === 'supported')
    .map((check) => legs.find((leg) => leg.id === check.id)!)
    .filter(Boolean);
  const props = propBoard ? await propTab(propBoard) : skippedProps;
  if (keep.length < 2) {
    const names = keep.map((leg) => nick(leg.team));
    const onlyName = names.length === 1 ? (teamShorts ? names[0] : `the ${names[0]}`) : '';
    const only = onlyName ? ` Only ${onlyName} cleared 0.80.` : '';
    const note = `No parlay. A ticket needs two legs the brief supports at 0.80 or better.${only}`;
    return { title, groups, note: withCache(note, cachedAt), props };
  }

  const combos: Leg[][] = [];
  const pick = (start: number, cur: Leg[], size: number) => {
    if (cur.length === size) return combos.push([...cur]);
    for (let i = start; i < keep.length; i++)
      if (!cur.some((leg) => leg.game === keep[i].game)) pick(i + 1, [...cur, keep[i]], size);
  };
  [2, 3].forEach((size) => pick(0, [], size));

  const tickets = combos
    .map((parlay) => ({
      parlay,
      hitProb: parlay.reduce((product, leg) => product * leg.implied, 1),
      payout: parlay.reduce((product, leg) => product * toDecimal(leg.price), 1),
    }))
    .sort((a, b) => b.hitProb - a.hitProb)
    .slice(0, 10);

  const ticketGroups = tickets.map(({ parlay, hitProb, payout }) => [[
    `${(hitProb * 100).toFixed(1)}%`,
    `${payout.toFixed(2)}x`,
    parlay.map((leg) => `${nick(leg.team)} ${priceText(leg.price)}`).join(' + '),
    `${listNames(parlay.map((leg) => nick(leg.team)))} each cleared 0.80. The hit rate multiplies their market prices. It is not a separate prediction.`,
  ]]);
  return { title, groups, ticketGroups, note: withCache(undefined, cachedAt), props };
}

function totalRow(leg: Leg, brief: GameBrief, overCheck: Check | undefined, underCheck: Check | undefined) {
  if (!leg.total) return ['  Over/Under', 'n/a', 'n/a', 'No line', 'Pass', 'This book did not post a total.'];
  if (!overCheck || !underCheck) {
    return ['  Over/Under', points(leg.total.point), 'n/a', 'No call', 'Pass', 'Verify did not return an over/under decision.'];
  }
  const overLeans = supportChance(overCheck) >= supportChance(underCheck);
  const side = overLeans ? 'Over' : 'Under';
  const check = overLeans ? overCheck : underCheck;
  const otherSide = overLeans ? 'Under' : 'Over';
  const other = overLeans ? underCheck : overCheck;
  const price = side === 'Over' ? leg.total.overPrice : leg.total.underPrice;
  return [
    `  ${side}`,
    points(leg.total.point),
    priceText(price),
    sideLabel(check),
    totalSlip(side, leg.total.point, check),
    totalComment(leg, brief, side, check, otherSide, other),
  ];
}
