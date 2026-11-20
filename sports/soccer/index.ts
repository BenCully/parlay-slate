import { evidenceFor, nameKey } from '../../espn/evidence.js';
import { createPlayers } from '../../espn/players.js';
import type { PropProfile } from '../../props/board.js';
import type { LeagueDef, Sport } from '../types.js';
import { upcomingWindow } from '../../slate/window.js';
import { createFotmob } from './fotmob.js';

type SoccerLeague = {
  label: string;
  short: string;
  oddsKey: string;
  espn: string;
  fotmob: number;
  props: boolean;
  /** Empty game-log sentence. MLS is one calendar year. The others span two. */
  season?: string;
};

const LEAGUES: SoccerLeague[] = [
  { label: 'Premier League', short: 'EPL', oddsKey: 'soccer_epl', espn: 'eng.1', fotmob: 47, props: true },
  { label: 'Champions League', short: 'UCL', oddsKey: 'soccer_uefa_champs_league', espn: 'uefa.champions', fotmob: 42, props: false },
  { label: 'La Liga', short: 'La Liga', oddsKey: 'soccer_spain_la_liga', espn: 'esp.1', fotmob: 87, props: true },
  { label: 'Serie A', short: 'Serie A', oddsKey: 'soccer_italy_serie_a', espn: 'ita.1', fotmob: 55, props: true },
  { label: 'Bundesliga', short: 'Bund', oddsKey: 'soccer_germany_bundesliga', espn: 'ger.1', fotmob: 54, props: true },
  { label: 'Ligue 1', short: 'Ligue 1', oddsKey: 'soccer_france_ligue_one', espn: 'fra.1', fotmob: 53, props: true },
  { label: 'MLS', short: 'MLS', oddsKey: 'soccer_usa_mls', espn: 'usa.1', fotmob: 130, props: true, season: '2026 season' },
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
    seasonLabel: league.season ?? '2026-27 season',
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
    extraFallback: true,
  };
}

function leagueDef(league: SoccerLeague): LeagueDef {
  const evidence = evidenceFor(league.espn);
  const fotmob = createFotmob(league.fotmob);
  return {
    label: league.label,
    short: league.short,
    source: {
      oddsKey: league.oddsKey,
      unit: 'goals',
      query: 'Which team is very likely to win this match?',
      threeWay: true,
      shortNames: true,
      window: (day) => upcomingWindow(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}/scoreboard`,
        league.label,
        day,
        (status) => `ESPN ${league.label} scoreboard returned ${status}`,
        { tailMs: 4 * 24 * 60 * 60 * 1000, emptyDays: 4 },
      ),
      getBrief: (leg) => fotmob.enrich(leg, evidence.getBrief),
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
