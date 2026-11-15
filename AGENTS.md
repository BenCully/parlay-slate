# Parlays

NFL parlay finder. Private ESM package in this directory. Node `>=22.23.4`. Two keys only, both in gitignored `.env`: `TYPESAFE_API_KEY` and `ODDS_API_KEY`.

## Commands

```bash
npm start                  # current ESPN week, skip games that already kicked off
npm start -- YYYY-MM-DD   # one America/New_York calendar day
npm run view               # replay last-run.json, no API calls
npm run typecheck          # tsc --noEmit
```

`npm start` writes `last-run.json`, then opens the screen. A non-TTY prints both tabs as text and exits. That is expected in an agent shell. Do not treat that as a mouse test.

## Files

- `parlays.ts` builds the Games tab: moneylines, spreads, totals, and moneyline tickets.
- `evidence.ts` is the team brief from ESPN (record, last 5, rest, injuries). No key.
- `props.ts` builds the Props tab. `players.ts` matches roster names and reads ESPN gamelogs.
- `screen.ts` turns a `SavedSlate` into the two tabs. `view.ts` only reads `last-run.json`.
- `table.ts` is the live screen: layout, scroll, mouse, tabs, black background.

Imports are NodeNext. Local imports use a `.js` suffix. `verbatimModuleSyntax` is on. Add every new `.ts` file to `tsconfig.json` `include`.

## Do not change these rules unless asked

- NFL only (`americanfootball_nfl`). Book order is FanDuel, DraftKings, BetMGM, Caesars (`williamhill_us`), then the first book that posted the market.
- A moneyline favorite needs implied probability `>= 0.60`. `rerank` uses `minRelevance: 0.6` and `topK: 8` on "which NFL team is very likely to win". `verify` uses `minConfidence: 0.8`.
- Do not lower a gate to force a ticket. Spread, total, and prop rows are decisions, not parlay legs. Tickets are 2- and 3-leg moneylines, one leg per game, top 10 by the product of the market implied probabilities.
- Slip text is `Take ...` only when verify verdict is `supported`. A contradicted spread flips to the opponent's opposite number. Anything else is `Pass`.
- `verify` rejects an empty `claims` array and rejects more than 100 claims. Chunk at 50. Claim ids must be unique. Run the game check before the prop check so the two calls do not overlap.
- Odds API timestamps are `YYYY-MM-DDTHH:MM:SSZ` with no milliseconds (`oddsStamp`). A date argument is Eastern midnight to the next Eastern midnight, so Sunday night is in and Monday night is out.
- Props are one request per game on `/events/{id}/odds`. Cost is one credit per market returned. Ask before adding markets. Do not add a paid source or a new key. ESPN's public site API is the free evidence source.
- If a book did not post a star, show the best line that was posted for that team. Do not invent a player. The extra prop stays on a player already in that team's block, or the kicker, and it skips a tiny under such as a backup under 1.5 receptions.
- Anytime-touchdown evidence is rushing plus receiving touchdowns. Passing touchdowns are not scores for the passer. Drop healthy scratches (`Out` plus coach's decision, rest, or not injury related).

## Screen

`presentScreen` owns the alt screen. Keep every rendered line at or under the content width (`columns - 1`). A wider line soft-wraps and breaks the box. Narrow terminals use the stacked layout.

The background stays black. Tabs are Games and Props on the top row. The x button is the top-right of that row, not the status line. The wheel scrolls three lines. A click or drag on the bar jumps. `q` does not quit. Ctrl-C still restores the terminal. Parse stdin as a `Buffer`. Do not set stdin to utf8, or mouse bytes get corrupted. On exit, reset color and turn mouse tracking off.

`SavedSlate` in `screen.ts` is the `last-run.json` contract. Old files have no `props` field and must still open. The Games tab stays first.

## Secrets and git

Never print `.env`, a key, or a request URL that contains a key. Odds failures should report status and the API message only.

This repo is local and has no remote. Do not commit, push, or add a remote unless asked. `last-run.json` and `.env` stay gitignored.

## Checks

Run `npm run typecheck` after a code change. For a layout change, render at a few widths and confirm no line is longer than the width. Use `npm run view` for a screen change. Run `npm start` only when the saved slate itself must change.
