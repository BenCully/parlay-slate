# Parlay Slate tailnet handoff

Run commands from the `parlay-slate` directory. The app uses two separate services:

1. **Decision model.** `model=tail-jev` (alias `model=autojev`) is `decisions/judge.ts`. `AUTOJEV_URL` in gitignored `.env` is the `/v1` base. The client posts one `noul` or `choice` to `systemone` on that base and sends `AUTOJEV_API_KEY` as a bearer token. There is no committed address and no `JEV_ENDPOINT`. A missing URL or key stops before the call. This is a classifier. It does not return odds, game schedules, or chat completions. `model=jev` is the default and uses TypeSafe. It does not call Autojev.
2. **Live prices.** FanDuel, DraftKings, BetMGM, and Caesars. An unset `ODDS_SOURCE` reads all four. `slate/board.ts` requests moneylines, spreads, and totals. `props/board.ts` requests event player props. The live Odds API call is gone. `ODDS_SOURCE=the-odds-api` only replays files already in `odds-cache/`. The decision service does not supply prices.
   - `ODDS_SOURCE=fanduel` swaps in FanDuel's internal sportsbook API (`odds/fanduel.ts`). It needs no Odds API key and spends no credits. Games and player props cover NFL, NCAAF, NBA, NHL, and the six soccer leagues. A market FanDuel does not post as a two-way line stays no line. MLB is offseason.

## For another coding agent

- Join the tailnet so `AUTOJEV_URL` can reach the model server. Keep that server off the public internet. Do not put the address or the bearer token in tracked files, docs, or logs.
- Decisions stay in `decisions/judge.ts`. Rerank uses the yes probability, a 0.60 threshold, and the top eight. Verify uses the chosen option's probability and a 0.80 ready threshold. A separate confidence field is ignored. Do not lower either gate. A failed call leaves that row as `No call`. Three failures in a row stop further calls.
- For `model=tail-jev`, set `AUTOJEV_URL` and `AUTOJEV_API_KEY` in `.env`. `model=jev` needs `TYPESAFE_API_KEY` instead of the Autojev pair. Prices do not need a key.
- `npm start -- model=tail-jev` walks the current slate. `npm start -- YYYY-MM-DD model=tail-jev` is one America/New_York day. `npm start -- odds=YYYY-MM-DD model=tail-jev` replays prices saved that Eastern day and does not call The Odds API. `model=` can sit before or after the date. Do not combine `odds=` with a slate date or with `--fresh`. There is no `--league` flag and no `--games-only` flag. A token that is not `model=`, `odds=`, or `--fresh` is read as the slate day.
- A full `npm start` requests player props and can spend Odds API credits. Leave off `--fresh` to reuse `odds-cache/`. Live prop requests stop when the last credit header is under `ODDS_CREDIT_FLOOR` (default 30). Cached props are still read.
- The latest slate is `runs/last-run.json`, rewritten after each sport once a board exists. A finished run also writes `snapshots/<day>-tail-jev.json`. There is no root `last-run.json`.
- If replacing The Odds API, implement another source for game odds and event props with the fields consumed by `slate/board.ts` and `props/board.ts`. Preserve the cache, American odds format, book ordering, and the 0.60 market gate. Tail-jev stays in `decisions/judge.ts`.
  - The FanDuel source covers game lines and player props. Soccer spreads and totals are the goal line closest to even. MLB is offseason; `baseball_mlb` has no competition filter. `handoff.md` lists the markets that stay no line.
- Run `npm test` and `npm run typecheck`, then `npm start -- model=tail-jev`. Confirm `runs/last-run.json` is saved and at least one board contains real games. Report Odds API credits used and any sports with no qualifying games.
