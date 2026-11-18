# FanDuel odds source — handoff

## Done

- `odds/fanduel.ts` (new): FanDuel's internal sportsbook API, normalized into the shape the boards read from The Odds API.
  - Slate: fetches the content-managed-page layout per sport (`CUSTOM`/`customPageId` for NFL, NCAAF, NBA, NHL, MLB; `SPORT`/`eventTypeId=1` for soccer), filters events by competition and by the requested Eastern window, then fetches moneyline/spread/total prices from `smp.il.sportsbook.fanduel.com/.../getMarketPrices`.
  - Emits the same game objects the boards expect: `id`, `commence_time` (from the layout event `openDate`), `home_team`/`away_team`, and one `fanduel` bookmaker with `h2h`, `spreads`, and `totals` markets.
  - Team names are resolved to ESPN display names at runtime (exact normalized match, alias table, then unique word-prefix for football / unique contains for clubs, with a TTY picker when ambiguous). The alias table covers the FanDuel/ESPN gaps found earlier: Sam Houston State, Appalachian State, Connecticut, Hawaii, Miami Florida, Paris St-G.
  - `fanduelFetch(url)` dispatches either a slate URL or an events URL from the The Odds API shape.
- `odds/cache.ts`: `oddsGet` routes to `fanduelFetch` when `ODDS_SOURCE=fanduel`. Cache records now carry a `source`, and hits from the other source are ignored, so Odds API and FanDuel saves never mix. `remaining` is `null` (FanDuel has no credits).
- `decisions/judge.ts` and `props/board.ts`: `ODDS_API_KEY` is no longer required when `ODDS_SOURCE=fanduel`.
- Live-verified with `fanduelSlate`: NFL 29 games, NCAAF 74, NBA 12, NHL 15, EPL 19. Moneyline, spread, and total all populated; soccer Draw skipped; names resolve (Man Utd → Manchester United, Nottm Forest → Nottingham Forest).

## Not done

- **Player props.** `fanduelProps()` returns `[]`, so the Props tab renders every row as "No line". This is the main remaining piece. Earlier probing:
  - The layout only carries a few prop markets (NFL: 6 passing yards, 10 receiving yards, 13 anytime TD; NCAAF/NBA/NHL: none).
  - `boapi.sportsbook.fanduel.com/betting-opportunities/all` is partial (10 NFL games, current week only).
  - CHAPI `/chapi/{experience}/card/{id}?data=<base64 JSON>` is the likely full source. The `data` param is base64 of `{ highWaterMark, sportexEventId, card: { id, type } }` and the experience path map found in the bundle only covers Labs (`head-to-head`, `player-combos`, `yourway`, `bullseye`, `player-podium`, `or-bets`). The OBP experience keys the app uses are not identified yet.
  - `eventpage/tabs` returns 500 `TabsController ... No fallback cache value found` for tested events.
  - Suggested next step: find the OBP experience key (search the bundle for how `obp.experiences` is populated), then map FanDuel prop market types (`PLAYER_X_ALT_PASSING_YARDS_HIGH`, `ANY_TIME_TOUCHDOWN_SCORER`, etc.) onto the market keys in `sports/*/index.ts` and `sports/football/props.ts`.
- **MLB** is offseason (layout has only futures) and was left out of active work per the last instruction. The `baseball_mlb` entry exists but has no competition filter.
- **Soccer spreads/totals**: FanDuel's soccer layout has no `MATCH_HANDICAP_(2-WAY)` or `TOTAL_POINTS_(OVER/UNDER)`, so those rows show "No line". Soccer moneylines work.
- `.env.example` does not document `ODDS_SOURCE=fanduel` yet.
- `npm test` has not been run. `tsc --noEmit` passes except for two pre-existing errors: `jev-recipes/rerank` and `jev-recipes/verify` cannot be found because `jev-recipes` is not installed in `node_modules` in this environment (`npm install` needed).
- `npm start` has not been run end-to-end (needs `TYPESAFE_API_KEY` and the `jev-recipes` install).
- `changelog.md` has no entry for this change.