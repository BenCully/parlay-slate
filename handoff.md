# Direct odds sources — handoff

`ODDS_SOURCE=fanduel` reads FanDuel instead of The Odds API. `draftkings`, `betmgm`, and `caesars` do the same for those Illinois sportsbooks. `books` reads all four and puts each book on `bookmakers`, so `postedMarket` still prefers FanDuel, then DraftKings, then BetMGM, then Caesars. No Odds API key and no credits for any of those. Set the name in `.env`. `.env.example` documents it. The Odds API stays the default until the exit checklist in `DIRECT-BOOKS.md` is true. Formula 1 stays on FanDuel even when the source is `books`.

## What FanDuel does

- `odds/fanduel.ts` normalizes FanDuel into the game and prop objects the boards already read.
- Slate: content-managed page per sport, Eastern window, moneyline, spread, and total. Team names resolve to ESPN display names with no prompt. College names match ESPN location and short name. A moneyline that posts only one side takes the other from the event name. Soccer `Home v Away` keeps the home team on the left. A miss keeps the FanDuel name.
- Soccer spreads and totals are not on that page. They come from the goal-line markets (`OVER_UNDER_*`, `HOME_TEAM_-N.N_GOALS`, `AWAY_TEAM_-N.N_GOALS`). The line closest to even is the one shown. FanDuel's soccer spreads start at 1.5.
- Props: one facet search per event, then `getMarketPrices`. Full-game markets only. Alternates, quarters, and halves are skipped so the main over/under wins.
- Mapped when FanDuel posts them: NFL and NCAAF passing, rushing, receiving, receptions, completions, rush attempts, pass touchdowns, anytime touchdown. NBA points, rebounds, assists, threes, blocks, steals. NHL anytime goal, shots on goal, saves. Soccer anytime goal, shots, shots on target, assists (anytime assist is over 0.5).
- Formula 1 (`motorsport_f1`) is on this source even when `ODDS_SOURCE` is The Odds API. Each driver keeps the hardest bet that still clears 0.60: race win, then top 2, then podium. The Games page is that moneyline. The brief is the ESPN championship standing.
- `odds/cache.ts` stores `source`. A save with no source is The Odds API and is not reused for a direct book. Direct files are named `{source}-` plus the request hash, so they do not replace an Odds API file. `npm run odds` prints `ODDS_SOURCE=` when that day was saved by a different source than the one in `.env`. A replay miss names every other source that saved that day. `remaining` is null. ESPN team lists use the same-day ESPN cache. A failed team list keeps the posted names.
- `decisions/judge.ts` and `props/board.ts` do not require `ODDS_API_KEY` for any direct source.

DraftKings, Caesars, and BetMGM use the same event shape. DraftKings and Caesars answer Node `fetch`. BetMGM's fixtures host does not, so that client uses `curl --http1.1` and loads the access id from client config at runtime. The id is not committed. A book that throws is left off the merged slate and named in the board note.

## Still no line

FanDuel does not post these as the two-way markets the boards read, so the row stays "No line":

- Player kicking points and field goals.
- NHL points, assists, and power-play points (only milestone yes prices).
- Soccer cards.
- MLB. The season is over. `baseball_mlb` is in the sport table and has no competition filter.

## Checks

`npm test` and `npm run typecheck` pass. A live read on 2026-11-19 returned NFL, NCAAF, NBA, NHL, and EPL props with prices, and an EPL slate with moneylines, spreads, and totals. A second read of the same NFL prop URL was a cache hit. `npm start` was not run; that also calls the decision model and rewrites the saved slate.
