import { theme, withAltScreen, type ScreenClose } from './term.js';

type Align = 'left' | 'right';

// Terminal columns, not string length. ❌ is one code unit and two columns. 🤝 is two code units and two columns.
function wide(code: number) {
  if (code >= 0x1F300 && code <= 0x1FAFF) return true;
  return code === 0x274C || code === 0x274E;
}

function charWidth(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0x200B || code === 0x200D || code === 0xFE0F || code === 0xFE0E) return 0;
  if (code >= 0x0300 && code <= 0x036F) return 0;
  return wide(code) ? 2 : 1;
}

function cellWidth(text: string) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

function clip(text: string, width: number) {
  let out = '';
  let used = 0;
  for (const char of text) {
    const size = charWidth(char);
    if (used + size > width) break;
    out += char;
    used += size;
  }
  return out;
}

function wrapText(text: string, width: number): string[] {
  const limit = Math.max(1, width);
  const indent = text.match(/^ +/)?.[0] ?? '';
  const words = [...text.slice(indent.length).matchAll(/\S+/g)].map((match) => match[0]);
  const lines: string[] = [];
  let current = '';
  const push = (word: string) => {
    const prefix = current ? '' : indent;
    const next = prefix + word;
    if (!current) current = cellWidth(next) <= limit ? next : word;
    else if (cellWidth(current) + 1 + cellWidth(word) <= limit) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  };
  const pieces = (word: string) => {
    if (cellWidth(word) <= limit) return [word];
    const parts: string[] = [];
    let part = '';
    for (const char of word) {
      if (part && cellWidth(part) + charWidth(char) > limit) {
        parts.push(part);
        part = '';
      }
      part += char;
    }
    if (part) parts.push(part);
    return parts;
  };
  for (const word of words) {
    for (const piece of pieces(word)) push(piece);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function pad(text: string, width: number, align: Align) {
  const clipped = clip(text, width);
  const spaces = ' '.repeat(Math.max(0, width - cellWidth(clipped)));
  return align === 'right' ? spaces + clipped : clipped + spaces;
}

function fitWidths(preferred: number[], budget: number, mins: number[]) {
  const widths = preferred.map((width, index) => Math.max(mins[index], width));
  let overflow = widths.reduce((sum, width) => sum + width, 0) - budget;
  for (let pass = 0; pass < 2 && overflow > 0; pass++) {
    const floor = pass === 0 ? mins : widths.map(() => 1);
    for (let index = widths.length - 1; index >= 0 && overflow > 0; index--) {
      const cut = Math.min(Math.max(0, widths[index] - floor[index]), overflow);
      widths[index] -= cut;
      overflow -= cut;
    }
  }
  return widths;
}

function columnWidths(headers: string[], rows: string[][], width: number) {
  const chrome = headers.length * 3 + 1;
  const budget = Math.max(headers.length, width - chrome);
  const natural = headers.map((header, index) => {
    const cells = rows.map((row) => row[index] ?? '');
    return Math.max(cellWidth(header), ...cells.map((cell) => cellWidth(cell)), 1);
  });
  const caps = natural.map((size, index) => (index === natural.length - 1 ? size : Math.min(size, 22)));
  const mins = headers.map((header, index) => Math.min(cellWidth(header), index === headers.length - 1 ? 8 : cellWidth(header)));
  const fixed = fitWidths(caps.slice(0, -1), Math.max(budget - 12, 1), mins.slice(0, -1));
  const comment = budget - fixed.reduce((sum, size) => sum + size, 0);
  return fitWidths([...fixed, Math.max(mins.at(-1) ?? 1, comment)], budget, mins.map(() => 1));
}

export function renderTable(headers: string[], groups: string[][][], aligns: Align[], width: number): string[] {
  const rows = groups.flat();
  if (!rows.length) return [];
  const chrome = headers.length * 3 + 1;
  if (width < chrome + headers.length * 4) return renderStacked(headers, groups, width);

  const widths = columnWidths(headers, rows, width);
  const lineWidth = widths.reduce((sum, size) => sum + size, 0) + chrome;
  const headerFits = widths.every((size, index) => index === widths.length - 1 || size >= cellWidth(headers[index]));
  const commentFits = (widths.at(-1) ?? 0) >= 12;
  if (lineWidth > width || !headerFits || !commentFits) return renderStacked(headers, groups, width);

  const border = (left: string, mid: string, right: string) =>
    left + widths.map((size) => '─'.repeat(size + 2)).join(mid) + right;

  const paint = (cells: string[]) => {
    const wrapped = cells.map((cell, index) => wrapText(cell, widths[index]));
    const height = Math.max(...wrapped.map((lines) => lines.length));
    const out: string[] = [];
    for (let line = 0; line < height; line++) {
      const parts = wrapped.map((lines, index) => pad(lines[line] ?? '', widths[index], aligns[index]));
      out.push(`│ ${parts.join(' │ ')} │`);
    }
    return out;
  };

  const rendered = [border('┌', '┬', '┐'), ...paint(headers), border('├', '┼', '┤')];
  groups.forEach((group, index) => {
    for (const row of group) rendered.push(...paint(row));
    rendered.push(index === groups.length - 1 ? border('└', '┴', '┘') : border('├', '┼', '┤'));
  });
  return rendered;
}

function renderStacked(headers: string[], groups: string[][][], width: number): string[] {
  const lines: string[] = [];
  const rule = '─'.repeat(Math.max(1, Math.min(width, 24)));
  groups.forEach((group, groupIndex) => {
    for (const row of group) {
      lines.push(...wrapText(row[0] ?? '', width));
      const meta = headers.slice(1, -1).map((header, index) => `${header} ${row[index + 1] ?? ''}`.trim()).join('   ');
      if (meta) lines.push(...wrapText(meta, width));
      const comment = row.at(-1) ?? '';
      if (comment) lines.push(...wrapText(comment, width));
      lines.push('');
    }
    if (groupIndex !== groups.length - 1) lines.push(rule, '');
  });
  return lines;
}

export function wrapParagraph(text: string, width: number) {
  return wrapText(text, Math.max(1, width));
}

function scrollbarColumn(height: number, total: number, scroll: number) {
  if (height <= 0) return [];
  if (total <= height) return Array(height).fill('█');
  const thumb = Math.max(1, Math.min(height, Math.round((height / total) * height)));
  const travel = height - thumb;
  const maxScroll = total - height;
  const top = travel === 0 || maxScroll <= 0 ? 0 : Math.round((scroll / maxScroll) * travel);
  return Array.from({ length: height }, (_, index) => (index >= top && index < top + thumb ? '█' : '░'));
}

export type ScreenPage = {
  label: string;
  short?: string;
  render?: (width: number) => string[];
  children?: ScreenPage[];
};

type TabRow = { nodes: ScreenPage[]; index: number; depth: number };

function tabRows(pages: ScreenPage[], indexes: number[]): TabRow[] {
  const rows: TabRow[] = [];
  let nodes = pages;
  let depth = 0;
  while (nodes.length) {
    const index = Math.max(0, Math.min(nodes.length - 1, indexes[depth] ?? 0));
    const branched = nodes.some((node) => node.children?.length);
    if (nodes.length > 1 || branched) rows.push({ nodes, index, depth });
    const node = nodes[index];
    if (!node?.children?.length) break;
    nodes = node.children;
    depth += 1;
  }
  return rows;
}

function leafPage(pages: ScreenPage[], indexes: number[]): ScreenPage | undefined {
  let nodes = pages;
  let depth = 0;
  let node: ScreenPage | undefined;
  while (nodes.length) {
    const index = Math.max(0, Math.min(nodes.length - 1, indexes[depth] ?? 0));
    node = nodes[index];
    if (!node?.children?.length) return node;
    nodes = node.children;
    depth += 1;
  }
  return node;
}

function leaves(pages: ScreenPage[], prefix: string[] = []): { heading: string; render: (width: number) => string[] }[] {
  const out: { heading: string; render: (width: number) => string[] }[] = [];
  for (const page of pages) {
    const heading = [...prefix, page.label];
    if (page.children?.length) out.push(...leaves(page.children, heading));
    else if (page.render) out.push({ heading: heading.join(' / '), render: page.render });
  }
  return out;
}

function usedWidth(labels: string[]) {
  return labels.reduce((sum, label, index) => sum + label.length + 2 + (index === 0 ? 0 : 1), 0);
}

const closeButton = ' x ';
const modelGap = '  ';

function modelTitle(name: string) {
  const titled = name.replace(/(^|[^A-Za-z])([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  return `Model: ${titled}`;
}

function cornerLabel(pieces: string[], width: number) {
  const label = `${pieces.join(modelGap)}${modelGap}`;
  if (label.length + closeButton.length > width) return '';
  return label;
}

function corner(model: string | undefined, oddsSource: string | undefined, close: boolean, width: number) {
  if (!close) return { label: '', button: '', span: 0 };
  const name = (model ?? '').replace(/\s+/g, ' ').trim();
  const source = (oddsSource ?? '').replace(/\s+/g, ' ').trim();
  const pieces = [name ? modelTitle(name) : '', source ? `Odds Source: ${source}` : ''].filter(Boolean);
  let label = pieces.length ? cornerLabel(pieces, width) : '';
  // A narrow row keeps the model and drops the odds source before it drops both.
  if (!label && pieces.length > 1 && name) label = cornerLabel([modelTitle(name)], width);
  if (!label) return { label: '', button: closeButton, span: Math.min(closeButton.length, width) };
  return { label, button: closeButton, span: label.length + closeButton.length };
}

function shownSource(nodes: ScreenPage[], model: string | undefined, oddsSource: string | undefined, close: boolean, width: number) {
  if (!close || !oddsSource || !nodes.length) return oddsSource;
  const span = corner(model, oddsSource, true, width).span;
  const first = nodes[0];
  const text = ` ${first?.short || first?.label || ''} `;
  if (text.trim() && text.length > width - span) return undefined;
  return oddsSource;
}

function fitLabels(nodes: ScreenPage[], width: number, reserved: number) {
  const room = Math.max(0, width - reserved);
  const full = nodes.map((node) => node.label);
  if (usedWidth(full) <= room) return full;
  return nodes.map((node) => node.short || node.label);
}

function paintHeader(labels: string[], active: number, width: number, close: boolean, model?: string, oddsSource?: string) {
  const mark = corner(model, oddsSource, close, width);
  const room = Math.max(0, width - mark.span);
  const hits: { start: number; end: number }[] = [];
  let column = 1;
  let line = theme;
  for (let index = 0; index < labels.length; index++) {
    const text = ` ${labels[index]} `;
    const gap = index === 0 ? 0 : 1;
    if (column - 1 + gap + text.length > room) break;
    if (gap) {
      line += ' ';
      column += 1;
    }
    hits.push({ start: column, end: column + text.length - 1 });
    line += index === active ? `\x1b[7m${text}\x1b[27m${theme}` : text;
    column += text.length;
  }
  const visible = column - 1;
  const target = close ? room : width;
  if (visible < target) line += ' '.repeat(target - visible);
  if (close) line += `${mark.label}\x1b[7m${mark.button}\x1b[27m${theme}`;
  return { line, hits };
}

function visibleText(line: string) {
  return line.replace(/\x1b\[[0-9;]*m/g, '');
}

export function headerText(pages: ScreenPage[], width: number, indexes: number[] = [], model?: string, oddsSource?: string) {
  const rows = tabRows(pages, indexes);
  const lines = rows.length
    ? rows.map((row, index) => {
      const top = index === 0;
      const source = shownSource(row.nodes, model, oddsSource, top, width);
      const reserved = corner(model, source, top, width).span;
      return paintHeader(fitLabels(row.nodes, width, reserved), row.index, width, top, model, source).line;
    })
    : [paintHeader([], 0, width, true, model, oddsSource).line];
  return lines.map(visibleText);
}

export function presentScreen(input: ScreenPage[] | ((width: number) => string[]), options?: { model?: string; oddsSource?: string }): Promise<ScreenClose> {
  const model = options?.model;
  const oddsSource = options?.oddsSource;
  const pages: ScreenPage[] = typeof input === 'function' ? [{ label: 'View', render: input }] : input;
  if (!pages.length) return Promise.resolve('quit');

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    const width = Math.max(20, process.stdout.columns || 100);
    const items = leaves(pages);
    for (const item of items) {
      if (items.length > 1) console.log(`# ${item.heading}`);
      for (const line of item.render(width)) console.log(line);
      console.log('');
    }
    return Promise.resolve('quit');
  }

  let reason: ScreenClose = 'quit';
  return withAltScreen((session) => {
    let scroll = 0;
    let sport = 0;
    let league = 0;
    let leaf = 0;
    let dragging = false;
    let totalLines = 0;
    let viewHeight = 1;
    let bodyTop = 1;
    let screenWidth = 80;
    let headerCount = 1;
    let rows: TabRow[] = [];
    let rowHits: { start: number; end: number }[][] = [];

    const nestedNow = () => {
      const node = pages[Math.max(0, Math.min(pages.length - 1, sport))];
      return Boolean(node?.children?.some((child) => child.children?.length));
    };

    const cursor = () => (nestedNow() ? [sport, league, leaf] : [sport, leaf]);

    const restore = (next: ScreenClose) => {
      reason = next;
      session.restore();
    };

    const select = (depth: number, index: number) => {
      const nested = nestedNow();
      const current = nested ? [sport, league, leaf] : [sport, leaf];
      if (current[depth] === index) return;
      if (depth === 0) sport = index;
      else if (nested && depth === 1) league = index;
      else leaf = index;
      scroll = 0;
      dragging = false;
      draw();
    };

    const cycle = (depth: number, delta: number) => {
      const row = tabRows(pages, cursor()).find((item) => item.depth === depth);
      if (!row || row.nodes.length < 2) return;
      select(depth, (row.index + delta + row.nodes.length) % row.nodes.length);
    };

    const jumpTo = (row: number) => {
      const maxScroll = Math.max(0, totalLines - viewHeight);
      const span = Math.max(1, viewHeight - 1);
      scroll = Math.round(((row - 1) / span) * maxScroll);
    };

    const draw = () => {
      const width = Math.max(20, process.stdout.columns || 80);
      rows = tabRows(pages, cursor());
      headerCount = Math.max(1, rows.length);
      const height = Math.max(headerCount + 2, process.stdout.rows || 24);
      const body = height - headerCount - 1;
      const contentWidth = Math.max(10, width - 1);
      screenWidth = width;
      viewHeight = body;
      bodyTop = headerCount + 1;
      const page = leafPage(pages, cursor());
      const lines = (page?.render?.(contentWidth) ?? ['']).flatMap((line) => (cellWidth(line) <= contentWidth ? [line] : wrapText(line, contentWidth)));
      totalLines = lines.length;
      const maxScroll = Math.max(0, lines.length - body);
      scroll = Math.max(0, Math.min(scroll, maxScroll));
      const view = lines.slice(scroll, scroll + body);
      while (view.length < body) view.push('');
      const bar = scrollbarColumn(body, lines.length, scroll);
      const frame = view.map((line, index) => pad(line, contentWidth, 'left') + bar[index]).join('\n');
      const hintParts = ['q quits', 'wheel scrolls'];
      const leafRow = rows.at(-1);
      if (leafRow && leafRow.nodes.length > 1) hintParts.push('tab games');
      if (rows[0] && rows[0].nodes.length > 1) hintParts.push('[ ] sport');
      const leagueRow = rows.find((row) => row.depth === 1);
      if (leagueRow && leagueRow.nodes.length > 1 && rows.some((row) => row.depth === 2)) hintParts.push(', . league');
      const hint = hintParts.join(' · ');
      const shownHint = hint.length > width ? hint.slice(0, width) : hint;
      const status = `${theme}${shownHint}${' '.repeat(width - shownHint.length)}`;
      const headers = rows.length
        ? rows.map((row, index) => {
          const top = index === 0;
          const source = shownSource(row.nodes, model, oddsSource, top, width);
          const reserved = corner(model, source, top, width).span;
          return paintHeader(fitLabels(row.nodes, width, reserved), row.index, width, top, model, source);
        })
        : [paintHeader([], 0, width, true, model, oddsSource)];
      rowHits = headers.map((header) => header.hits);
      const painted = [...headers.map((header) => header.line), frame, status].join('\n');
      process.stdout.write(`${theme}\x1b[2J\x1b[H${painted}`);
    };

    const onMouse = (pb: number, x: number, y: number, release: boolean) => {
      if ((pb & 64) !== 0 && !release) {
        scroll += (pb & 1) === 0 ? -3 : 3;
        draw();
        return;
      }
      const motion = (pb & 32) !== 0;
      const left = (pb & 67) === 0;
      if (!left) return;
      if (release) {
        dragging = false;
        return;
      }
      if (!motion && y >= 1 && y <= headerCount) {
        if (y === 1 && x >= screenWidth - 2) {
          restore('quit');
          return;
        }
        const row = rows[y - 1];
        if (!row) return;
        const hit = rowHits[y - 1]?.findIndex((tab) => x >= tab.start && x <= tab.end) ?? -1;
        if (hit >= 0) select(row.depth, hit);
        return;
      }
      const statusRow = bodyTop + viewHeight;
      if (x === screenWidth && y >= bodyTop && y < statusRow) {
        dragging = !motion;
        jumpTo(y - bodyTop + 1);
        draw();
      }
    };

    const onKey = (key: string) => {
      const page = Math.max(1, viewHeight - 1);
      const current = tabRows(pages, cursor());
      const leafRow = current.at(-1);
      if (key === '\u0003') {
        restore('interrupt');
        return;
      }
      if (key === 'q' || key === 'Q') {
        restore('quit');
        return;
      }
      if (leafRow && leafRow.nodes.length > 1 && (key === '\t' || key === '\x1b[C')) {
        cycle(leafRow.depth, 1);
        return;
      }
      if (leafRow && leafRow.nodes.length > 1 && (key === '\x1b[Z' || key === '\x1b[D')) {
        cycle(leafRow.depth, -1);
        return;
      }
      if (leafRow && /^[1-9]$/.test(key)) {
        const index = Number(key) - 1;
        if (index < leafRow.nodes.length) select(leafRow.depth, index);
        return;
      }
      if (key === '[' || key === ']') {
        const sportRow = current[0];
        if (sportRow && sportRow.nodes.length > 1) cycle(sportRow.depth, key === ']' ? 1 : -1);
        return;
      }
      if ((key === ',' || key === '.') && current.length >= 3) {
        cycle(current[1].depth, key === '.' ? 1 : -1);
        return;
      }
      if (key === '\x1b[A' || key === 'k') scroll -= 1;
      else if (key === '\x1b[B' || key === 'j') scroll += 1;
      else if (key === '\x1b[5~') scroll -= page;
      else if (key === '\x1b[6~' || key === ' ') scroll += page;
      else if (key === 'g') scroll = 0;
      else if (key === 'G') scroll = Number.MAX_SAFE_INTEGER;
      else return;
      draw();
    };

    return {
      draw,
      onKey,
      onMouse: (mouse) => onMouse(mouse.button, mouse.x, mouse.y, mouse.release),
    };
  }).then(() => reason);
}
