import { evidenceFor, nameKey } from './evidence.js';
import { createPlayers } from './players.js';
import type { PropProfile } from './props.js';

export type SoccerLeague = {
  label: string;
  short: string;
  sport: string;
  espn: string;
  props: boolean;
};

export const SOCCER_LEAGUES: SoccerLeague[] = [
  { label: 'Premier League', short: 'EPL', sport: 'soccer_epl', espn: 'eng.1', props: true },
  { label: 'Champions League', short: 'UCL', sport: 'soccer_uefa_champs_league', espn: 'uefa.champions', props: false },
  { label: 'La Liga', short: 'La Liga', sport: 'soccer_spain_la_liga', espn: 'esp.1', props: true },
  { label: 'Serie A', short: 'Serie A', sport: 'soccer_italy_serie_a', espn: 'ita.1', props: true },
  { label: 'Bundesliga', short: 'Bund', sport: 'soccer_germany_bundesliga', espn: 'ger.1', props: true },
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

export function soccerTools(league: SoccerLeague) {
  const evidence = evidenceFor(league.espn);
  const players = createPlayers({
    rosterBase: `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}`,
    gamelogBase: `https://site.web.api.espn.com/apis/common/v3/sports/soccer/${league.espn}/athletes`,
    teamPath: evidence.teamPath,
    seasonLabel: '2026-27 season',
  });
  const profile: PropProfile | null = league.props ? {
    sport: league.sport,
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
  } : null;
  return { getBrief: evidence.getBrief, profile };
}
