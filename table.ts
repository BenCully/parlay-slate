type Align = 'left' | 'right';

function wrapText(text: string, width: number): string[] {
  const limit = Math.max(1, width);
  const indent = text.match(/^ +/)?.[0] ?? '';
  const words = text.slice(indent.length).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const push = (word: string) => {
    const prefix = current ? '' : indent;
    const next = prefix + word;
    if (!current) current = next.length <= limit ? next : word;
    else if (current.length + 1 + word.length <= limit) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  };
  for (const word of words) {
    if (word.length <= limit) push(word);
    else {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit));
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function pad(text: string, width: number, align: Align) {
  const clipped = text.length > width ? text.slice(0, width) : text;
  return align === 'right' ? clipped.padStart(width) : clipped.padEnd(width);
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
    return Math.max(header.length, ...cells.map((cell) => cell.length), 1);
  });
  const caps = natural.map((size, index) => (index === natural.length - 1 ? size : Math.min(size, 22)));
  const mins = headers.map((header, index) => Math.min(header.length, index === headers.length - 1 ? 8 : header.length));
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
  const headerFits = widths.every((size, index) => index === widths.length - 1 || size >= headers[index].length);
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

export function presentScreen(render: (width: number) => string[]): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    const width = Math.max(20, process.stdout.columns || 100);
    for (const line of render(width)) console.log(line);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let scroll = 0;
    let closed = false;
    let dragging = false;
    let pending = Buffer.alloc(0);
    let totalLines = 0;
    let viewHeight = 1;
    let screenWidth = 80;
    const stdin = process.stdin;
    const enableMouse = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
    const disableMouse = '\x1b[?1002l\x1b[?1000l\x1b[?1006l';

    const restore = () => {
      if (closed) return;
      closed = true;
      process.stdout.off('resize', draw);
      stdin.off('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write(`${disableMouse}\x1b[?25h\x1b[?1049l`);
      resolve();
    };

    const jumpTo = (row: number) => {
      const maxScroll = Math.max(0, totalLines - viewHeight);
      const span = Math.max(1, viewHeight - 1);
      scroll = Math.round(((row - 1) / span) * maxScroll);
    };

    const draw = () => {
      const width = Math.max(20, process.stdout.columns || 80);
      const height = Math.max(4, process.stdout.rows || 24);
      const body = height - 1;
      const contentWidth = Math.max(10, width - 1);
      screenWidth = width;
      viewHeight = body;
      const lines = render(contentWidth).flatMap((line) => (line.length <= contentWidth ? [line] : wrapText(line, contentWidth)));
      totalLines = lines.length;
      const maxScroll = Math.max(0, lines.length - body);
      scroll = Math.max(0, Math.min(scroll, maxScroll));
      const view = lines.slice(scroll, scroll + body);
      while (view.length < body) view.push('');
      const bar = scrollbarColumn(body, lines.length, scroll);
      const frame = view.map((line, index) => line.slice(0, contentWidth).padEnd(contentWidth) + bar[index]).join('\n');
      const button = ' x ';
      const hint = ' wheel scrolls';
      const gap = Math.max(0, width - hint.length - button.length);
      const status = `${hint}${' '.repeat(gap)}`.slice(0, Math.max(0, width - button.length)) + `\x1b[7m${button}\x1b[27m`;
      process.stdout.write(`\x1b[H\x1b[2J${frame}\n${status}`);
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
      if (!motion && y === viewHeight + 1 && x >= screenWidth - 2) {
        restore();
        return;
      }
      if (x === screenWidth && y >= 1 && y <= viewHeight) {
        dragging = !motion;
        jumpTo(y);
        draw();
      }
    };

    const onKey = (key: string) => {
      const page = Math.max(1, viewHeight - 1);
      if (key === '\u0003') {
        restore();
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

    const dropByte = (): { key: string } => {
      const key = String.fromCharCode(pending[0]);
      pending = pending.subarray(1);
      return { key };
    };

    const takeInput = (): { key: string; mouse?: [number, number, number, boolean] } | null => {
      if (!pending.length) return null;
      if (pending[0] !== 0x1b) return dropByte();
      if (pending.length < 3) return null;
      if (pending[1] === 0x5b && pending[2] === 0x3c) {
        const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(pending.toString('utf8'));
        if (!match) return pending.length > 64 ? dropByte() : null;
        pending = pending.subarray(Buffer.byteLength(match[0]));
        return { key: '', mouse: [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === 'm'] };
      }
      if (pending[1] === 0x5b && pending[2] === 0x4d) {
        if (pending.length < 6) return null;
        const pb = pending[3] - 32;
        const x = pending[4] - 32;
        const y = pending[5] - 32;
        pending = pending.subarray(6);
        return { key: '', mouse: [pb, x, y, (pb & 3) === 3 && (pb & 64) === 0] };
      }
      const match = /^\x1b\[[\d;]*[A-Za-z~]/.exec(pending.toString('utf8'));
      if (!match) return pending.length > 16 ? dropByte() : null;
      pending = pending.subarray(Buffer.byteLength(match[0]));
      return { key: match[0] };
    };

    const onData = (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const next = takeInput();
        if (!next) return;
        if (next.mouse) onMouse(...next.mouse);
        else onKey(next.key);
        if (closed) return;
      }
    };

    process.stdout.write(`\x1b[?1049h\x1b[?25l${enableMouse}`);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.on('resize', draw);
    stdin.on('data', onData);
    draw();
  });
}
