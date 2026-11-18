# Parlay Slate tailnet handoff

The local checkout is `/Users/vikrambhaduri/occ/parlay-slate`. It uses two separate services:

1. **Decision model:** AutoTrust JEV on `users-mac-mini`, reachable on the tailnet at `http://100.87.236.63:11435/v1/decide`. `slate/jev.ts` sends each candidate as a yes/no relevance decision and each claim as a supported/contradicted/unsupported decision. The environment variable `JEV_ENDPOINT` overrides that URL. This is a classifier; it does not return odds, game schedules, or chat completions.
2. **Live prices:** The Odds API. `odds/cache.ts` requires `ODDS_API_KEY` on a cache miss. `slate/board.ts` requests moneylines, spreads, and totals; `props/board.ts` requests event player props. Put the key in the gitignored `.env`. The JEV endpoint cannot replace this data source.

The JEV service has been tested from this machine: `/health` returned HTTP 200, a real `/v1/decide` request returned a choice, and the TypeScript adapter returned a supported claim decision. `npm run typecheck` passes. A valid Odds API key is now in the gitignored `.env`. On 2026-11-16, `npm start -- --league NFL` completed using cached odds and saved `last-run.json` with one qualifying game, one Games group, and two Props groups. There was no two-leg parlay because only one game qualified. The unscoped run was stopped after reaching NCAA's 59-game props queue to limit credit use.

## For another coding agent

- Join the same tailnet and verify `curl -fsS http://100.87.236.63:11435/health` returns JSON. Keep the model server bound to that tailnet IP; do not expose it publicly.
- Inspect `slate/jev.ts`. Its `rerank` uses the probability of `yes` with a 0.60 threshold and keeps the top eight. Its `verify` maps the three response probabilities to the existing verdict, confidence, and 0.80 ready threshold. Preserve the app's market and evidence gates when changing this mapping.
- Provide a valid `ODDS_API_KEY` in `.env` to run against The Odds API. Do not put it in tracked files or logs. Run `npm start -- --league NFL` to scope a live run, without `--fresh` so existing odds cache entries can be reused. The unscoped run can spend substantial credits on NCAA player props.
- For Games and moneyline parlays only, add `--games-only`. This skips player prop odds requests and JEV checks, while leaving Games checks intact.
- If replacing The Odds API, implement another source for game odds and event props with the fields consumed by `slate/board.ts` and `props/board.ts`; preserve the cache, American odds format, book ordering, and 60% market gate. JEV remains the decision service.
- Run `npm run typecheck`, then `npm start`; confirm `last-run.json` is saved, at least one board contains real games, and the JEV service receives actual rerank and verify requests. Report API credits used and any sports with no qualifying games.
