// Side-by-side decisions from two saved slates. No network calls.
import { presentScreen, renderTable, wrapParagraph, type ScreenPage } from './table.js';
import { sportsOf, type SavedBoard, type SavedLeague, type SavedSlate, type SavedSport } from './screen.js';

const sportShort: Record<string, string> = {
  Football: 'FB',
  Soccer: 'Soc',
  Hockey: 'Hockey',
  Basketball: 'Bask',
  Baseball: 'Base',
};

const gameHeaders = ['Team', 'Price', 'Market', 'jev', 'tail-jev', 'Slips'];
const propHeaders = ['Team', 'Player', 'Line', 'jev', 'tail-jev', 'Slips'];
const ticketHeaders = ['Hit', 'Payout', 'Ticket', 'Models'];
const gameAligns = ['left', 'right', 'right', 'left', 'left', 'left'] as const;
const propAligns = ['left', 'left', 'left', 'left', 'left', 'left'] as const;

function slipCell(left?: string, right?: string) {
  if (!left && !right) return '';
  if (left === right) return left ?? '';
  return `jev ${left || '—'} · tail-jev ${right || '—'}`;
}

function keyedRows(rows: string[][], keyOf: (row: string[]) => string) {
  const counts = new Map<string, number>();
  const out = new Map<string, string[]>();
  const order: string[] = [];
  for (const row of rows) {
    const base = keyOf(row);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const key = seen ? `${base}#${seen}` : base;
    order.push(key);
    out.set(key, row);
  }
  return { order, out };
}

function keyedGroups(groups: string[][][]) {
  const counts = new Map<string, number>();
  const out = new Map<string, string[][]>();
  const order: string[] = [];
  for (const group of groups) {
    const base = group[0]?.[0]?.trim() || 'row';
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const key = seen ? `${base}#${seen}` : base;
    order.push(key);
    out.set(key, group);
  }
  return { order, out };
}

function alignGroups(
  left: string[][][],
  right: string[][][],
  rowKey: (row: string[]) => string,
  join: (left?: string[], right?: string[]) => string[],
) {
  const a = keyedGroups(left);
  const b = keyedGroups(right);
  const keys = [...a.order];
  for (const key of b.order) if (!a.out.has(key)) keys.push(key);
  return keys.map((key) => {
    const leftRows = keyedRows(a.out.get(key) ?? [], rowKey);
    const rightRows = keyedRows(b.out.get(key) ?? [], rowKey);
    const rowKeys = [...leftRows.order];
    for (const rowKeyName of rightRows.order) if (!leftRows.out.has(rowKeyName)) rowKeys.push(rowKeyName);
    return rowKeys.map((rowKeyName) => join(leftRows.out.get(rowKeyName), rightRows.out.get(rowKeyName)));
  });
}

function gameRowKey(row: string[]) {
  const name = row[0]?.trim() ?? '';
  if (name === 'Over' || name === 'Under') return 'total';
  return name;
}

function propRowKey(row: string[]) {
  const line = row[2] ?? '';
  const label = line.split(/\s+(?:over|under)\s+/i)[0]?.replace(/\s+[+-]?\d.*$/, '') ?? line;
  return `${row[0] ?? ''}|${row[1] ?? ''}|${label}`;
}

function gameJoin(left?: string[], right?: string[]) {
  return [
    left?.[0] || right?.[0] || '',
    left?.[1] || right?.[1] || '',
    left?.[2] || right?.[2] || '',
    left?.[3] ?? '—',
    right?.[3] ?? '—',
    slipCell(left?.[4], right?.[4]),
  ];
}

function ticketJoin(left?: string[], right?: string[]) {
  const where = left && right ? 'both' : left ? 'jev only' : 'tail-jev only';
  return [
    left?.[0] || right?.[0] || '',
    left?.[1] || right?.[1] || '',
    left?.[2] || right?.[2] || '',
    where,
  ];
}

function differCount(groups: string[][][]) {
  let count = 0;
  for (const group of groups) {
    for (const row of group) if (row[3] !== row[4]) count += 1;
  }
  return count;
}

function stamp(saved: SavedSlate, name: string) {
  const odds = saved.oddsDay ? `, odds saved ${saved.oddsDay}` : '';
  return `${name} ${saved.savedAt}${odds}`;
}

function notes(left: SavedBoard | undefined, right: SavedBoard | undefined, width: number) {
  if (!left?.note && !right?.note) return [];
  if (left?.note === right?.note) return ['', ...wrapParagraph(left?.note ?? '', width)];
  const lines: string[] = [];
  if (left?.note) lines.push('', ...wrapParagraph(`jev: ${left.note}`, width));
  if (right?.note) lines.push('', ...wrapParagraph(`tail-jev: ${right.note}`, width));
  return lines;
}

function renderGames(left: SavedBoard | undefined, right: SavedBoard | undefined, jev: SavedSlate, tail: SavedSlate, width: number) {
  const groups = alignGroups(left?.groups ?? [], right?.groups ?? [], gameRowKey, gameJoin);
  const tickets = alignGroups(left?.ticketGroups ?? [], right?.ticketGroups ?? [], (row) => row[2] ?? '', ticketJoin);
  const differ = differCount(groups);
  const lines = [
    ...wrapParagraph(left?.title || right?.title || 'Games', width),
    '',
    ...wrapParagraph(`${stamp(jev, 'jev')} · ${stamp(tail, 'tail-jev')}. ${differ} game decision${differ === 1 ? '' : 's'} differ.`, width),
    '',
  ];
  if (groups.length) lines.push(...renderTable(gameHeaders, groups, [...gameAligns], width));
  lines.push(...notes(left, right, width));
  if (tickets.length) {
    lines.push('', ...renderTable(ticketHeaders, tickets, ['right', 'right', 'left', 'left'], width));
  }
  return lines;
}

function renderProps(left: SavedBoard | undefined, right: SavedBoard | undefined, width: number) {
  const groups = alignGroups(left?.groups ?? [], right?.groups ?? [], propRowKey, gameJoin);
  const differ = differCount(groups);
  const title = left?.title || right?.title || 'Player props';
  const lines = [
    ...wrapParagraph(title, width),
    '',
    ...wrapParagraph(`${differ} prop decision${differ === 1 ? '' : 's'} differ.`, width),
    '',
  ];
  if (groups.length) lines.push(...renderTable(propHeaders, groups, [...propAligns], width));
  lines.push(...notes(left, right, width));
  return lines;
}

function leaguePages(left: SavedLeague | undefined, right: SavedLeague | undefined, jev: SavedSlate, tail: SavedSlate): ScreenPage {
  const label = left?.label ?? right?.label ?? 'League';
  return {
    label,
    short: left?.short ?? right?.short,
    children: [
      { label: 'Games', render: (width) => renderGames(left?.games, right?.games, jev, tail, width) },
      { label: 'Props', render: (width) => renderProps(left?.props, right?.props, width) },
    ],
  };
}

function boardPages(left: SavedSport | undefined, right: SavedSport | undefined, jev: SavedSlate, tail: SavedSlate): ScreenPage[] {
  return [
    { label: 'Games', render: (width) => renderGames(left?.games, right?.games, jev, tail, width) },
    { label: 'Props', render: (width) => renderProps(left?.props, right?.props, width) },
  ];
}

function ordered<T extends { label: string }>(left: T[] | undefined, right: T[] | undefined) {
  const labels: string[] = [];
  for (const item of left ?? []) if (!labels.includes(item.label)) labels.push(item.label);
  for (const item of right ?? []) if (!labels.includes(item.label)) labels.push(item.label);
  const leftBy = new Map((left ?? []).map((item) => [item.label, item]));
  const rightBy = new Map((right ?? []).map((item) => [item.label, item]));
  return labels.map((label) => ({ label, left: leftBy.get(label), right: rightBy.get(label) }));
}

export function comparisonPages(jev: SavedSlate, tail: SavedSlate): ScreenPage[] {
  return ordered(sportsOf(jev), sportsOf(tail)).map(({ label, left, right }) => {
    const leagues = left?.leagues?.length || right?.leagues?.length
      ? ordered(left?.leagues, right?.leagues).map((pair) => leaguePages(pair.left, pair.right, jev, tail))
      : boardPages(left, right, jev, tail);
    return { label, short: sportShort[label], children: leagues };
  });
}

export function showComparison(jev: SavedSlate, tail: SavedSlate) {
  const left = jev.model?.trim() || 'jev';
  const right = tail.model?.trim() || 'tail-jev';
  const model = left === right ? left : `${left} · ${right}`;
  return presentScreen(comparisonPages(jev, tail), { model });
}
