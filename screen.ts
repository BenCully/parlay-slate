import { presentScreen, renderTable, wrapParagraph } from './table.js';

export type SavedProps = {
  title: string;
  groups: string[][][];
  note?: string;
};

export type SavedSlate = {
  savedAt: string;
  title: string;
  groups: string[][][];
  note?: string;
  ticketGroups?: string[][][];
  props?: SavedProps;
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

const propAligns = ['left', 'left', 'left', 'left', 'left', 'left'] as const;

export function renderProps(saved: SavedSlate, width: number) {
  if (!saved.props) {
    return wrapParagraph('No props in this save. Run npm start to load anytime touchdowns, yardage, and one other likely stat for each team.', width);
  }
  const lines = [...wrapParagraph(saved.props.title, width), ''];
  if (saved.props.groups.length) {
    lines.push(...renderTable(
      ['Team', 'Player', 'Line', 'Decision', 'Slip', 'Comment'],
      saved.props.groups,
      [...propAligns],
      width,
    ));
  }
  if (saved.props.note) lines.push('', ...wrapParagraph(saved.props.note, width));
  return lines;
}

export function showSlate(saved: SavedSlate) {
  return presentScreen([
    { label: 'Games', render: (width) => renderSlate(saved, width) },
    { label: 'Props', render: (width) => renderProps(saved, width) },
  ]);
}
