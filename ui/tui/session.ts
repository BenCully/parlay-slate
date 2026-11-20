import { theme, withAltScreen } from '../term.js';
import type { FormContext } from './commands.js';
import { focusedHitId, headerLine, hintFor, layoutScreen, reduceForm, type Layout, type UiState } from './options.js';

export type OptionsResult = { effect: 'quit' | 'interrupt' | 'run'; state: UiState };

function paintLine(line: string, hits: Layout['hits'], focused: string | null) {
  const marks = hits.filter((hit) => hit.id === focused).sort((a, b) => b.start - a.start);
  let next = line;
  for (const hit of marks) {
    next = `${next.slice(0, hit.start)}\x1b[7m${next.slice(hit.start, hit.end)}\x1b[27m${theme}${next.slice(hit.end)}`;
  }
  return next;
}

function reveal(scroll: number, layout: Layout, focused: string | null, bodyRows: number) {
  const hit = layout.hits.find((item) => item.id === focused);
  let next = scroll;
  const max = Math.max(0, layout.lines.length - bodyRows);
  if (hit) {
    if (hit.line < next) next = hit.line;
    if (hit.line >= next + bodyRows) next = hit.line - bodyRows + 1;
  }
  return Math.max(0, Math.min(next, max));
}

/** Options screen. Restores the terminal before resolving so the next action can print or open the slate. */
export function showOptions(state: UiState, ctx: FormContext): Promise<OptionsResult> {
  let current = state;
  let effect: OptionsResult['effect'] = 'quit';
  return withAltScreen((session) => {
    const finish = (next: OptionsResult['effect']) => {
      effect = next;
      session.restore();
    };
    const draw = () => {
      if (session.closed) return;
      const columns = Math.max(20, process.stdout.columns || 80);
      const rows = Math.max(8, process.stdout.rows || 24);
      const bodyWidth = Math.max(10, columns - 1);
      const bodyRows = Math.max(1, rows - 4);
      const layout = layoutScreen(current, ctx, bodyWidth);
      const focused = current.picker || current.list ? null : focusedHitId(current);
      current = { ...current, scroll: reveal(current.scroll, layout, focused, bodyRows) };
      const view = layout.lines.slice(current.scroll, current.scroll + bodyRows);
      while (view.length < bodyRows) view.push('');
      const body = view.map((line, index) => {
        const lineNo = current.scroll + index;
        const hits = layout.hits.filter((hit) => hit.line === lineNo);
        return paintLine(line.padEnd(bodyWidth, ' '), hits, focused);
      });
      const header = headerLine(current, bodyWidth);
      const hint = hintFor(current);
      const shownHint = hint.length > bodyWidth ? hint.slice(0, bodyWidth) : hint;
      const rule = '─'.repeat(Math.max(1, Math.min(columns, bodyWidth)));
      const frame = [header, rule, ...body, rule, shownHint].join('\n');
      process.stdout.write(`${theme}\x1b[2J\x1b[H${frame}`);
    };
    const apply = (key: { type: 'key'; key: string } | { type: 'click'; id: string } | { type: 'wheel'; delta: number }) => {
      const next = reduceForm(current, key, ctx);
      current = next.state;
      if (next.effect.type === 'quit') {
        finish('quit');
        return;
      }
      if (next.effect.type === 'run') {
        finish('run');
        return;
      }
      if (next.effect.type === 'clear') {
        void import('../../scripts/clear-snapshots.js').then(async ({ clearSnapshots }) => {
          const lines = await clearSnapshots();
          const { loadContext } = await import('./commands.js');
          const fresh = await loadContext();
          ctx.oddsDays = fresh.oddsDays;
          ctx.snapshots = fresh.snapshots;
          ctx.compareDays = fresh.compareDays;
          ctx.oddsLines = fresh.oddsLines;
          ctx.lastRun = fresh.lastRun;
          current = { ...current, confirm: false, confirmTyped: '', message: lines.at(-1) ?? 'Cleared snapshots.', scroll: 0 };
          draw();
        }).catch((error: unknown) => {
          current = { ...current, confirm: false, message: error instanceof Error ? error.message : 'Could not clear snapshots.' };
          draw();
        });
        return;
      }
      draw();
    };
    return {
      draw,
      onKey(key) {
        if (key === '\u0003') {
          finish('interrupt');
          return;
        }
        apply({ type: 'key', key });
      },
      onMouse(mouse) {
        if ((mouse.button & 64) !== 0 && !mouse.release) {
          apply({ type: 'wheel', delta: (mouse.button & 1) === 0 ? -3 : 3 });
          return;
        }
        if (mouse.release || (mouse.button & 67) !== 0) return;
        const columns = Math.max(20, process.stdout.columns || 80);
        if (mouse.y === 1 && mouse.x >= columns - 3) {
          apply({ type: 'click', id: 'header-x' });
          return;
        }
        const rows = Math.max(8, process.stdout.rows || 24);
        const bodyWidth = Math.max(10, columns - 1);
        const bodyRows = Math.max(1, rows - 4);
        const layout = layoutScreen(current, ctx, bodyWidth);
        const line = current.scroll + mouse.y - 3;
        const hit = layout.hits.find((item) => item.line === line && mouse.x - 1 >= item.start && mouse.x - 1 < item.end);
        if (hit && mouse.y >= 3 && mouse.y < 3 + bodyRows) apply({ type: 'click', id: hit.id });
      },
    };
  }).then(() => ({ effect, state: current }));
}
