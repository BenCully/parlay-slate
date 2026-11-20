import { oddsSourceLabel } from '../odds/cache.js';
import { easternDay } from '../slate/window.js';
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
  /** When these games prices were read. Absent on an older save. */
  oddsAt?: string;
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
  model?: string;
  /** Price source that filled this slate. Absent on an older save. An unknown id leaves the header blank. */
  oddsSource?: string;
  /** Eastern day whose saved odds were replayed. Absent on a live run. */
  oddsDay?: string;
  /** Latest games-odds read across the sports in this save. Absent on an older save. */
  oddsAt?: string;
  title: string;
  groups: string[][][];
  note?: string;
  ticketGroups?: string[][][];
  props?: SavedProps;
  sports?: SavedSport[];
};

const slateAligns = ['left', 'right', 'right', 'left', 'left', 'left'] as const;
const slateAlignsDated = ['left', 'left', 'right', 'right', 'left', 'left', 'left'] as const;
const propAligns = ['left', 'left', 'left', 'left', 'left', 'left'] as const;
const propAlignsDated = ['left', 'left', 'left', 'left', 'left', 'left', 'left'] as const;

/** A row saved with a kickoff cell. Older rows stay six cells and keep the previous headers. */
export function rowsHaveDate(groups: string[][][]) {
  return groups.some((group) => group.some((row) => row.length >= 7));
}

export function renderBoard(board: SavedBoard, width: number) {
  const lines = [...wrapParagraph(board.title, width), ''];
  if (board.groups.length) {
    const dated = rowsHaveDate(board.groups);
    lines.push(...renderTable(
      dated
        ? ['Team', 'Date', 'Price', 'Market', 'Decision', 'Slip', 'Comment']
        : ['Team', 'Price', 'Market', 'Decision', 'Slip', 'Comment'],
      board.groups,
      [...(dated ? slateAlignsDated : slateAligns)],
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
    const dated = rowsHaveDate(props.groups);
    lines.push(...renderTable(
      dated
        ? ['Team', 'Date', 'Player', 'Line', 'Decision', 'Slip', 'Comment']
        : ['Team', 'Player', 'Line', 'Decision', 'Slip', 'Comment'],
      props.groups,
      [...(dated ? propAlignsDated : propAligns)],
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

const sportShort: Record<string, string> = {
  Football: 'FB',
  Soccer: 'Soc',
  Hockey: 'Hockey',
  Basketball: 'Bask',
  Baseball: 'Base',
  'Formula 1': 'F1',
};

export function sportsOf(saved: SavedSlate): SavedSport[] {
  return (saved.sports?.length ? saved.sports : [legacySport(saved)]).map((sport) => withNcaa(asFootball(sport)));
}

export function slatePages(saved: SavedSlate): ScreenPage[] {
  const sports = sportsOf(saved);
  return sports.map((sport) => {
    const short = sportShort[sport.label];
    if (sport.leagues?.length) {
      return {
        label: sport.label,
        short,
        children: sport.leagues.map((league) => ({
          label: league.label,
          short: league.short,
          children: [gamesPage(league.games), propsPage(league.props)],
        })),
      };
    }
    return {
      label: sport.label,
      short,
      children: [
        gamesPage(sport.games ?? { title: sport.label, groups: [], note: 'No games in this save.' }),
        propsPage(sport.props),
      ],
    };
  });
}

/** Display names for the header. One name when every save used the same source. */
export function savedOddsLabel(...sources: (string | undefined)[]) {
  const names: string[] = [];
  for (const source of sources) {
    const name = oddsSourceLabel(source);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(' · ');
}

/** Eastern day the prices were saved. A replay uses that day. An older save uses `savedAt`. */
export function oddsDayOf(saved: Pick<SavedSlate, 'savedAt' | 'oddsDay' | 'oddsAt'>) {
  if (saved.oddsDay) return saved.oddsDay;
  return easternDay(saved.oddsAt || saved.savedAt);
}

/** One day when every save shares it. A compare with two days shows both. */
export function savedOddsDate(...saves: Pick<SavedSlate, 'savedAt' | 'oddsDay' | 'oddsAt'>[]) {
  const days: string[] = [];
  for (const saved of saves) {
    const day = oddsDayOf(saved);
    if (day && !days.includes(day)) days.push(day);
  }
  return days.join(' · ');
}

export function showSlate(saved: SavedSlate) {
  return presentScreen(slatePages(saved), {
    model: saved.model,
    oddsSource: savedOddsLabel(saved.oddsSource),
    oddsDate: savedOddsDate(saved),
  });
}

export function slateHeaders(saved: SavedSlate, width: number, indexes: number[] = []) {
  return headerText(slatePages(saved), width, indexes, saved.model, savedOddsLabel(saved.oddsSource), savedOddsDate(saved));
}
