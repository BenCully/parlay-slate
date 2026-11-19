# FanDuel odds source — handoff

`ODDS_SOURCE=fanduel` reads FanDuel instead of The Odds API. No Odds API key, no credits. Set it in `.env`. `.env.example` documents the name.

## What it does

- `odds/fanduel.ts` normalizes FanDuel into the game and prop objects the boards already read.
- Slate: content-managed page per sport, Eastern window, moneyline, spread, and total. Team names resolve to ESPN display names.
- Soccer spreads and totals are not on that page. They come from the goal-line markets (`OVER_UNDER_*`, `HOME_TEAM_-N.N_GOALS`, `AWAY_TEAM_-N.N_GOALS`). The line closest to even is the one shown. FanDuel's soccer spreads start at 1.5.
- Props: one facet search per event, then `getMarketPrices`. Full-game markets only. Alternates, quarters, and halves are skipped so the main over/under wins.
- Mapped when FanDuel posts them: NFL and NCAAF passing, rushing, receiving, receptions, completions, rush attempts, pass touchdowns, anytime touchdown. NBA points, rebounds, assists, threes, blocks, steals. NHL anytime goal, shots on goal, saves. Soccer anytime goal, shots, shots on target, assists (anytime assist is over 0.5).
- `odds/cache.ts` stores `source`. A save with no source is The Odds API and is not reused for FanDuel. `remaining` is null.
- `decisions/judge.ts` and `props/board.ts` do not require `ODDS_API_KEY` in this mode.

## Still no line

FanDuel does not post these as the two-way markets the boards read, so the row stays "No line":

- Player kicking points and field goals.
- NHL points, assists, and power-play points (only milestone yes prices).
- Soccer cards.
- MLB. The season is over. `baseball_mlb` is in the sport table and has no competition filter.

## Checks

`npm test` and `npm run typecheck` pass. A live read on 2026-11-19 returned NFL, NCAAF, NBA, NHL, and EPL props with prices, and an EPL slate with moneylines, spreads, and totals. A second read of the same NFL prop URL was a cache hit. `npm start` was not run; that also calls the decision model and rewrites the saved slate.
