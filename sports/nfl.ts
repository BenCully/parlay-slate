import { injuryFor, nameKey, teamAbbr, getBrief } from '../evidence.js';
import { createPlayers } from '../players.js';
import type { MarketInfo, PropProfile } from '../props.js';
import type { LeagueDef } from './types.js';
import { easternRange, oddsStamp, scoreboardEvents, todayEastern, type OddsWindow } from '../window.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const players = createPlayers({
  rosterBase: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
  gamelogBase: 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes',
  teamPath: async (name) => {
    const abbr = await teamAbbr(name);
    return abbr ? abbr.toLowerCase() : null;
  },
  seasonLabel: '2026 regular-season',
});

const markets = [
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

const core: MarketInfo[] = [
  {
    market: 'player_anytime_td',
    label: 'Anytime TD',
    phrase: 'rushing or receiving touchdowns',
    stat: 'touchdowns',
    yes: {
      slip: (who, price) => `Take ${who} anytime TD ${price}`,
      thing: 'anytime touchdown',
      claim: (player, opponent, when) => `${player} scores a touchdown against ${opponent} on ${when}.`,
    },
  },
  { market: 'player_pass_yds', label: 'Pass yds', phrase: 'passing yards', stat: 'passingYards' },
  { market: 'player_reception_yds', label: 'Rec yds', phrase: 'receiving yards', stat: 'receivingYards' },
  { market: 'player_rush_yds', label: 'Rush yds', phrase: 'rushing yards', stat: 'rushingYards' },
];

const extra: MarketInfo[] = [
  { market: 'player_receptions', label: 'Receptions', phrase: 'receptions', stat: 'receptions' },
  { market: 'player_pass_tds', label: 'Pass TDs', phrase: 'passing touchdowns', stat: 'passingTouchdowns' },
  { market: 'player_pass_completions', label: 'Completions', phrase: 'completions', stat: 'completions' },
  { market: 'player_rush_attempts', label: 'Rush att', phrase: 'rush attempts', stat: 'rushingAttempts' },
  { market: 'player_kicking_points', label: 'Kick pts', phrase: 'kicking points', stat: 'totalKickingPoints' },
  { market: 'player_field_goals', label: 'Field goals', phrase: 'field goals made', stat: 'fieldGoalsMade-fieldGoalAttempts' },
];

function realExtra(option: { market: string; side: 'Over' | 'Under' | 'Yes'; posted: { point: number | null }; ref: { pos: string } }) {
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

function featureExtra(option: { market: string; ref: { name: string; pos: string } }, featured: Set<string>) {
  if (featured.has(nameKey(option.ref.name))) return true;
  const kicker = option.ref.pos === 'PK' || option.ref.pos === 'K';
  return kicker && (option.market === 'player_kicking_points' || option.market === 'player_field_goals');
}

export function footballProfile(sport: string, tools: {
  loadRosters: PropProfile['loadRosters'];
  injuryFor: PropProfile['injuryFor'];
  recentStat: PropProfile['recentStat'];
  teamShort?: PropProfile['teamShort'];
}): PropProfile {
  return {
    sport,
    markets,
    core,
    extra,
    title: 'Player props for every team still to kick off. The last row on each team is a likely extra stat.',
    note: 'Each team has an anytime touchdown, passing yards, receiving yards, and rushing yards. The last row is another stat with a short price, chosen for that team from receptions, passing touchdowns, completions, rush attempts, kicking points, and field goals. It stays on a player already in the team block, or the kicker, and skips tiny unders such as a backup staying under 1.5 receptions. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.',
    loadRosters: tools.loadRosters,
    injuryFor: tools.injuryFor,
    recentStat: tools.recentStat,
    teamShort: tools.teamShort,
    realExtra,
    featureExtra,
  };
}

const profile = footballProfile('americanfootball_nfl', {
  loadRosters: players.loadRosters,
  injuryFor,
  recentStat: players.recentStat,
});

async function windowFor(day: string | undefined): Promise<OddsWindow> {
  if (day) {
    const range = easternRange(day);
    return { ...range, label: `NFL ${day} (Eastern)` };
  }
  const { board, stamps } = await scoreboardEvents(SCOREBOARD, (status) => `ESPN scoreboard returned ${status}`);
  if (!stamps.length) return windowFor(todayEastern());
  const week = board.week?.number;
  return {
    from: oddsStamp(new Date(Math.min(...stamps) - 60 * 60 * 1000).toISOString()),
    to: oddsStamp(new Date(Math.max(...stamps) + 6 * 60 * 60 * 1000).toISOString()),
    label: week ? `NFL week ${week}` : 'NFL current week',
  };
}

export const nflLeague: LeagueDef = {
  label: 'NFL',
  short: 'NFL',
  source: {
    oddsKey: 'americanfootball_nfl',
    unit: 'points',
    query: 'Which NFL team is very likely to win this game?',
    threeWay: false,
    shortNames: false,
    window: windowFor,
    getBrief,
    profile,
    propsNote: '',
  },
};
