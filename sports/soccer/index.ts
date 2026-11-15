import { evidenceFor, nameKey } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { PropProfile } from '../../props/board.js';
import type { LeagueDef, Sport } from '../types.js';
import { easternRange, oddsStamp, scoreboardEvents, todayEastern, type OddsWindow } from '../../slate/window.js';

type SoccerLeague = {
  label: string;
  short: string;
  oddsKey: string;
  espn: string;
  props: boolean;
};

const LEAGUES: SoccerLeague[] = [
  { label: 'Premier League', short: 'EPL', oddsKey: 'soccer_epl', espn: 'eng.1', props: true },
  { label: 'Champions League', short: 'UCL', oddsKey: 'soccer_uefa_champs_league', espn: 'uefa.champions', props: false },
  { label: 'La Liga', short: 'La Liga', oddsKey: 'soccer_spain_la_liga', espn: 'esp.1', props: true },
  { label: 'Serie A', short: 'Serie A', oddsKey: 'soccer_italy_serie_a', espn: 'ita.1', props: true },
  { label: 'Bundesliga', short: 'Bund', oddsKey: 'soccer_germany_bundesliga', espn: 'ger.1', props: true },
];

const goalYes = {
  slip: (who: string, price: string) => `Take ${who} anytime goal ${price}`,
  thing: 'anytime goal',
  claim: (player: string, opponent: string, when: string) => `${player} scores a goal against ${opponent} on ${when}.`,
};

const cardYes = {
  slip: (who: string, price: string) => `Take ${who} card ${price}`,
  thing: 'card',
  claim: (player: string, opponent: string, when: string) => `${player} receives a card against ${opponent} on ${when}.`,
};

function profileFor(league: SoccerLeague): PropProfile | null {
  if (!league.props) return null;
  const evidence = evidenceFor(league.espn);
  const players = createPlayers({
    rosterBase: `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}`,
    gamelogBase: `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${league.espn}/athletes`,
    teamPath: evidence.teamPath,
    seasonLabel: '2026-27 season',
  });
  return {
    sport: league.oddsKey,
    markets: [
      'player_goal_scorer_anytime',
      'player_shots',
      'player_shots_on_target',
      'player_assists',
      'player_to_receive_card',
    ],
    core: [
      { market: 'player_goal_scorer_anytime', label: 'Anytime goal', phrase: 'goals', stat: 'totalGoals', yes: goalYes },
      { market: 'player_shots', label: 'Shots', phrase: 'shots', stat: 'totalShots' },
      { market: 'player_shots_on_target', label: 'Shots on target', phrase: 'shots on target', stat: 'shotsOnTarget' },
      { market: 'player_assists', label: 'Assists', phrase: 'assists', stat: 'goalAssists' },
    ],
    extra: [
      { market: 'player_to_receive_card', label: 'Card', phrase: 'cards', stat: 'cards', yes: cardYes },
    ],
    title: 'Player props for every team still to kick off. The last row on each team is a likely card.',
    note: 'Each team has an anytime goal, shots, shots on target, and assists. The last row is a card, chosen from the short prices and kept on a player already in that team block when one was posted. Verify reads that player’s ESPN game log. A slip is filled in only when the log supports the side. These rows are not parlay legs.',
    logLabel: league.label,
    allowOneSide: true,
    teamShort: evidence.teamShort,
    loadRosters: players.loadRosters,
    injuryFor: evidence.injuryFor,
    recentStat: players.recentStat,
    realExtra: (option) => option.side === 'Yes',
    featureExtra: (option, featured) => featured.has(nameKey(option.ref.name)),
  };
}

async function windowFor(espn: string, label: string, day: string | undefined): Promise<OddsWindow> {
  if (day) {
    const range = easternRange(day);
    return { ...range, label: `${label} ${day} (Eastern)` };
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espn}/scoreboard`;
  const { stamps } = await scoreboardEvents(url, (status) => `ESPN ${label} scoreboard returned ${status}`);
  if (!stamps.length) {
    const today = todayEastern();
    const range = easternRange(today, 4);
    return { ...range, label };
  }
  return {
    from: oddsStamp(new Date(Math.min(...stamps) - 60 * 60 * 1000).toISOString()),
    to: oddsStamp(new Date(Math.max(...stamps) + 4 * 24 * 60 * 60 * 1000).toISOString()),
    label,
  };
}

function leagueDef(league: SoccerLeague): LeagueDef {
  const evidence = evidenceFor(league.espn);
  return {
    label: league.label,
    short: league.short,
    source: {
      oddsKey: league.oddsKey,
      unit: 'goals',
      query: 'Which team is very likely to win this match?',
      threeWay: true,
      shortNames: true,
      window: (day) => windowFor(league.espn, league.label, day),
      getBrief: evidence.getBrief,
      profile: profileFor(league),
      propsNote: league.props ? '' : 'US books do not post player props for the Champions League.',
    },
  };
}

export const soccer: Sport = {
  label: 'Soccer',
  kind: 'leagues',
  leagues: LEAGUES.map(leagueDef),
};
