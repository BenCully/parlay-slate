import { headerText, presentScreen, renderTable, wrapParagraph, type ScreenPage } from './table.js';

export type SavedProps = {
  title: string;
  groups: string[][][];
  note?: string;
};

export type SavedBoard = {
  title: string;
  groups: string[][][];
  note?: string;
  ticketGroups?: string[][][];
};

export type SavedLeague = {
  label: string;
  short?: string;
  games: SavedBoard;
  props: SavedBoard;
};

export type SavedSport = {
  label: string;
  leagues?: SavedLeague[];
  games?: SavedBoard;
  props?: SavedBoard;
};

export type SavedSlate = {
  savedAt: string;
  title: string;
  groups: string[][][];
  note?: string;
  ticketGroups?: string[][][];
  props?: SavedProps;
  sports?: SavedSport[];
};

const slateAligns = ['left', 'right', 'right', 'left', 'left', 'left'] as const;
const propAligns = ['left', 'left', 'left', 'left', 'left', 'left'] as const;

export function renderBoard(board: SavedBoard, width: number) {
  const lines = [...wrapParagraph(board.title, width), ''];
  if (board.groups.length) {
    lines.push(...renderTable(
      ['Team', 'Price', 'Market', 'Decision', 'Slip', 'Comment'],
      board.groups,
      [...slateAligns],
      width,
    ));
  }
  if (board.note) lines.push('', ...wrapParagraph(board.note, width));
  if (board.ticketGroups?.length) {
    lines.push('', ...renderTable(
      ['Hit', 'Payout', 'Ticket', 'Comment'],
      board.ticketGroups,
      ['right', 'right', 'left', 'left'],
      width,
    ));
  }
  return lines;
}

export function renderProps(props: SavedBoard | undefined, width: number) {
  if (!props) {
    return wrapParagraph('No props in this save. Run npm start to load anytime touchdowns, yardage, and one other likely stat for each team.', width);
  }
  const lines = [...wrapParagraph(props.title, width), ''];
  if (props.groups.length) {
    lines.push(...renderTable(
      ['Team', 'Player', 'Line', 'Decision', 'Slip', 'Comment'],
      props.groups,
      [...propAligns],
      width,
    ));
  }
  if (props.note) lines.push('', ...wrapParagraph(props.note, width));
  return lines;
}

function gamesPage(board: SavedBoard): ScreenPage {
  return { label: 'Games', render: (width) => renderBoard(board, width) };
}

function propsPage(props: SavedBoard | undefined): ScreenPage {
  return { label: 'Props', render: (width) => renderProps(props, width) };
}

const ncaaMissing = 'NCAA lines are not in this save. Run npm start to load the current college week.';

function legacySport(saved: SavedSlate): SavedSport {
  return {
    label: 'NFL',
    games: {
      title: saved.title,
      groups: saved.groups,
      note: saved.note,
      ticketGroups: saved.ticketGroups,
    },
    props: saved.props,
  };
}

function asFootball(sport: SavedSport): SavedSport {
  if (sport.label !== 'NFL' || sport.leagues?.length) return sport;
  return {
    label: 'Football',
    leagues: [{
      label: 'NFL',
      short: 'NFL',
      games: sport.games ?? { title: 'NFL', groups: [], note: 'No games in this save.' },
      props: sport.props ?? { title: 'Player props', groups: [] },
    }],
  };
}

function withNcaa(sport: SavedSport): SavedSport {
  if (sport.label !== 'Football' || !sport.leagues) return sport;
  if (sport.leagues.some((league) => league.label === 'NCAA')) return sport;
  return {
    ...sport,
    leagues: [...sport.leagues, {
      label: 'NCAA',
      short: 'NCAA',
      games: { title: 'NCAA', groups: [], note: ncaaMissing },
      props: { title: 'Player props', groups: [], note: ncaaMissing },
    }],
  };
}

export function slatePages(saved: SavedSlate): ScreenPage[] {
  const sports = (saved.sports?.length ? saved.sports : [legacySport(saved)]).map((sport) => withNcaa(asFootball(sport)));
  return sports.map((sport) => {
    if (sport.leagues?.length) {
      return {
        label: sport.label,
        children: sport.leagues.map((league) => ({
          label: league.label,
          short: league.short,
          children: [gamesPage(league.games), propsPage(league.props)],
        })),
      };
    }
    return {
      label: sport.label,
      children: [
        gamesPage(sport.games ?? { title: sport.label, groups: [], note: 'No games in this save.' }),
        propsPage(sport.props),
      ],
    };
  });
}

export function showSlate(saved: SavedSlate) {
  return presentScreen(slatePages(saved));
}

export function slateHeaders(saved: SavedSlate, width: number, indexes: number[] = []) {
  return headerText(slatePages(saved), width, indexes);
}
