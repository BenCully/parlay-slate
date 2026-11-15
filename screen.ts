import { presentScreen, renderTable, wrapParagraph } from './table.js';

export type SavedSlate = {
  savedAt: string;
  title: string;
  groups: string[][][];
  note?: string;
  ticketGroups?: string[][][];
};

const slateAligns = ['left', 'right', 'right', 'left', 'left', 'left'] as const;

export function renderSlate(saved: SavedSlate, width: number) {
  const lines = [...wrapParagraph(saved.title, width), ''];
  if (saved.groups.length) {
    lines.push(...renderTable(
      ['Team', 'Price', 'Market', 'Decision', 'Slip', 'Comment'],
      saved.groups,
      [...slateAligns],
      width,
    ));
  }
  if (saved.note) lines.push('', ...wrapParagraph(saved.note, width));
  if (saved.ticketGroups?.length) {
    lines.push('', ...renderTable(
      ['Hit', 'Payout', 'Ticket', 'Comment'],
      saved.ticketGroups,
      ['right', 'right', 'left', 'left'],
      width,
    ));
  }
  return lines;
}

export function showSlate(saved: SavedSlate) {
  return presentScreen((width) => renderSlate(saved, width));
}
