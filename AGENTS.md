# Parlays

Parlay finder for the NFL and five soccer leagues. Private ESM package in this directory. Node `>=22.23.4`. Two keys only, both in gitignored `.env`: `TYPESAFE_API_KEY` and `ODDS_API_KEY`. Cache settings are in gitignored `.env.settings` (`ODDS_CACHE_HOURS`, `ODDS_CACHE`, `ODDS_CACHE_DIR`). See `.env.settings.example`. `.env` is loaded after `.env.settings`, so a duplicate name in `.env` wins. The shell wins over both files.

## Commands

```bash
npm start                  # current ESPN week, skip games that already kicked off
npm start -- YYYY-MM-DD   # one America/New_York calendar day
npm start -- --fresh      # ignore the odds cache and spend credits
npm run view               # replay last-run.json, no API calls
npm run typecheck          # tsc --noEmit
```

`npm start` writes `last-run.json`, then opens the screen. A non-TTY prints every sport, league, and page as text and exits. That is expected in an agent shell. Do not treat that as a mouse test.

Run and Debug configs are in `.vscode/launch.json`: Start slate, Start slate for an Eastern day, and View saved slate. They launch `node` with `--import tsx`, same as the npm scripts. Keep `console` set to `integratedTerminal`. The Debug Console is not a TTY, so the screen, mouse, and x button will not work there. `.npmrc` sets `engine-strict=true`.

## Files

Shared pipeline, used by every sport:

- `parlays.ts` walks `sports/index.ts`, saves `last-run.json`, and opens the screen. It does not know a sport's markets or ESPN path.
- `board.ts` builds one Games board: moneylines, spreads, totals, and moneyline tickets. It also starts that board's props.
- `props.ts` builds a Props tab from a `PropProfile`. `players.ts` is `createPlayers` for one ESPN competition. `books.ts` is the book order.
- `evidence.ts` is `createEvidence(base, style)`. `NFL_EVIDENCE` and `SOCCER_EVIDENCE` are the styles in use. Copy the closer one for a new sport and change the fields that differ. Do not add a sport branch in the middle of the client.
- `window.ts` is the Eastern day range and the scoreboard fetch. Each sport decides its own kickoff window.
- `odds-cache.ts` stores successful Odds API responses in gitignored `odds-cache/`. The cache key is the path and query with `apiKey` removed. `ODDS_CACHE_HOURS` in `.env.settings` is the lifetime, 168 if unset. `--fresh` or `ODDS_CACHE=0` fetches again. Do not log or store the key.
- `screen.ts` turns a `SavedSlate` into the sport, league, and page tabs. `view.ts` only reads `last-run.json`.
- `table.ts` is the live screen: layout, scroll, mouse, tabs, black background.

A parent tab is a module under `sports/`:

- `sports/index.ts` is the list. Append a sport there. Screen order is that list.
- `sports/nfl.ts` is one Games and Props pair (`kind: 'board'`).
- `sports/soccer.ts` is five leagues (`kind: 'leagues'`), each with Games and Props.
- `sports/types.ts` is `Sport` and `BoardSource`.

Imports are NodeNext. Local imports use a `.js` suffix. `verbatimModuleSyntax` is on. `tsconfig.json` includes every `.ts` file outside `node_modules`.

## Adding a sport

Add `sports/<name>.ts` that exports a `Sport`, then append it in `sports/index.ts`.

- `kind: 'board'` is one parent tab with Games and Props. Use it for a single Odds API sport key.
- `kind: 'leagues'` is a parent tab whose children are leagues. Each league has its own odds key, window, brief, and props.
- `BoardSource.profile` is the prop markets. `null` shows `propsNote` and makes no prop request.
- `shortNames` uses the ESPN short name in slips. Leave it false when the last word of the team name is already unique.
- A dated run is one Eastern day for every sport. Build that with `easternRange`. The no-date window belongs in the sport file.
- A thrown board becomes an error tab and the run continues with the next sport or league. `last-run.json` is left unchanged when every board throws.
- The first `kind: 'board'` sport is also copied to the top-level fields of `last-run.json` so an old reader still opens.

## Do not change these rules unless asked

- NFL (`americanfootball_nfl`) plus Premier League (`soccer_epl`), Champions League (`soccer_uefa_champs_league`), La Liga (`soccer_spain_la_liga`), Serie A (`soccer_italy_serie_a`), and Bundesliga (`soccer_germany_bundesliga`). Book order is FanDuel, DraftKings, BetMGM, Caesars (`williamhill_us`), then the first book that posted the market.
- Soccer moneylines are 3-way. Skip Draw and Tie. The 0.60 favorite gate stays. Spread and total copy says goals. A date argument is still one Eastern day for every sport. With no date, each soccer league uses its ESPN scoreboard, then four days past the last listed kickoff so the rest of that matchweek is included.
- Soccer props are anytime goal, shots, shots on target, assists, and one card. US books do not post player props for the Champions League, so that props tab is a note and makes no prop request.
- A moneyline favorite needs implied probability `>= 0.60`. `rerank` uses `minRelevance: 0.6` and `topK: 8`. The NFL query is "which NFL team is very likely to win". Soccer uses "which team is very likely to win this match". `verify` uses `minConfidence: 0.8`.
- Do not lower a gate to force a ticket. Spread, total, and prop rows are decisions, not parlay legs. Tickets are 2- and 3-leg moneylines, one leg per game, top 10 by the product of the market implied probabilities.
- Slip text is `Take ...` only when verify verdict is `supported`. A contradicted spread flips to the opponent's opposite number. Anything else is `Pass`.
- `verify` rejects an empty `claims` array and rejects more than 100 claims. Chunk at 50. Claim ids must be unique. Run the game check before the prop check so the two calls do not overlap.
- Odds API timestamps are `YYYY-MM-DDTHH:MM:SSZ` with no milliseconds (`oddsStamp`). A date argument is Eastern midnight to the next Eastern midnight, so Sunday night is in and Monday night is out.
- Props are one request per game on `/events/{id}/odds`. Cost is one credit per market returned. Ask before adding markets. Do not add a paid source or a new key. ESPN's public site API is the free evidence source. Repeat runs must use `odds-cache.ts` instead of calling The Odds API again.
- If a book did not post a star, show the best line that was posted for that team. Do not invent a player. The extra prop stays on a player already in that team's block, or the kicker, and it skips a tiny under such as a backup under 1.5 receptions.
- Anytime-touchdown evidence is rushing plus receiving touchdowns. Passing touchdowns are not scores for the passer. Drop healthy scratches (`Out` plus coach's decision, rest, or not injury related).

## Screen

`presentScreen` owns the alt screen. Keep every rendered line at or under the content width (`columns - 1`). A wider line soft-wraps and breaks the box. Narrow terminals use the stacked layout.

The background stays black. The top row is the sport (NFL, Soccer) and the x button. NFL then shows Games and Props. Soccer shows the league row, then Games and Props. Tab, Shift-Tab, Left, Right, 1, and 2 move Games and Props. `[` and `]` move the sport. `,` and `.` move the league. The wheel scrolls three lines. A click or drag on the bar jumps. `q` and the x button close the screen. Ctrl-C still restores the terminal. Parse stdin as a `Buffer`. Do not set stdin to utf8, or mouse bytes get corrupted. On exit, reset color and turn mouse tracking off.

`SavedSlate` in `screen.ts` is the `last-run.json` contract. `sports` holds NFL plus the soccer leagues. Old files have no `sports` or `props` and must still open as the NFL parent. The Games page stays first under each sport or league.

## Secrets and git

Never print `.env`, a key, or a request URL that contains a key. Odds failures should report status and the API message only.

This repo is local and has no remote. Do not commit, push, or add a remote unless asked. `last-run.json`, `odds-cache/`, `.env`, and `.env.settings` stay gitignored. `.env.example` and `.env.settings.example` stay in git.

## Changelog

`changelog.md` is the log of changes that have landed. After you implement a change, add an entry at the top. The heading is the UTC time the change landed, `YYYY-MM-DDTHH:MM:SSZ`, with no milliseconds.

- Say what changed and anything a later session needs, including a behavior change.
- Keep one entry per change. A docs-only tweak, a typecheck, or a comment edit does not get its own entry.
- Keep secrets, keys, and request URLs out of the log.
- The `2026-11-15T19:52:50Z` sport-module entry is the first one. Later work goes above it.

## Checks

Run `npm run typecheck` after a code change. For a layout change, render at a few widths and confirm no line is longer than the width. Use `npm run view` for a screen change. Run `npm start` only when the saved slate itself must change. Update `changelog.md` in the same turn as the change.
