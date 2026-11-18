# Future ideas

Recommendations from a read of the code on 2026-11-17. Nothing here is scheduled. The 0.60 favorite gate, the 0.60 rerank gate, and the 0.80 verify gate stay. Do not add a paid odds or news source. `changelog.md` is only for changes that have landed.

## Done

Landed 2026-11-18. These are not open work.

**An empty odds file does not hide a slate.** `readFamily` skips an empty body when another save for that sport and markets is still inside `ODDS_CACHE_HOURS` and still has games. The empty file is used when it is the only fresh one. A hit on the exact request hash still returns that file.

**Top-level errors are scrubbed.** `main().catch` uses the same `apiKey=` scrub as a league or sport failure, and prints that message.

**The book is on the row.** Moneyline, spread, total, and prop comments name the book that posted the price. FanDuel, DraftKings, BetMGM, and Caesars use those names. Any other book uses its title, then its key. A missing spread or total says that no book posted it.

**One `npm start` at a time.** `runs/slate.lock` holds the process id. A second start exits and names that pid. A lock whose process is gone is taken over. The lock covers the walk and the screen, and it is removed when the process finishes.

**The odds body is typed at the boundary.** `oddsGet` parses a slate into events and a prop response into one event before either board sees it. Each event has `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. A different shape throws there. The cache still stores the raw response.

Sports are already the extension point that works. A new league is a `BoardSource` (`sports/types.ts`), an `EvidenceStyle` (`espn/evidence.ts`), and a `PropProfile` (`props/board.ts`), then one line in `sports/index.ts`. Do not replace that with a plugin loader.

## Database for the cache

Not a server database. Postgres or anything that needs a daemon is the wrong tool for a one-person CLI whose data is already gitignored files next to the script.

The odds cache in `odds/cache.ts` is a folder of JSON files, one per request hash. That is the right store for raw Odds API bodies. A hit spends no credit, writes are atomic (`write` then `rename`), and `apiKey` is stripped from the key. Keep that until the folder is hard to query.

Two behaviors are the actual problem, and a database does not fix them by itself:

- `readFamily` re-reads every file in `odds-cache/` on a miss. `listSavedOdds` parses the whole folder too. Prop files grow one per game. An index of `{hash, sport, markets, savedAt, games, easternDay}` removes the scan. A JSON index next to the folder is enough.
- Decisions are not cached. `odds=` replays prices and still calls TypeSafe or Autojev. A tail-jev day is one HTTP call per claim (`decisions/judge.ts` `mapInOrder`). The expensive repeat is the model, not the odds file.

Do those two in the files that exist. Move to one local SQLite file after that, and only if you want history you can query: line movement, which book posted a price, and decision reuse across runs. Node 24 on this machine already exposes `node:sqlite` (`DatabaseSync`), so that file needs no new package and no server. One gitignored database can hold the odds index, decision rows, and a short ESPN cache. Do not put API keys or request URLs in it.

What to store when that file exists:

| Table | Key | Why |
| --- | --- | --- |
| Odds responses | request hash, or sport + markets + Eastern save day | Replace the directory scan. Keep the JSON body. |
| Decisions | model + hash of kind, question, and state | Replay a tail-jev slate without another tailnet walk. Evidence text is inside the hash, so a new injury report misses. |
| ESPN pages | URL path + savedAt | Rosters, schedules, and gamelogs are fetched again on every `npm start` and have no timeout today. |

Leave `runs/last-run.json` and `snapshots/<day>-<model>.json` as the screen contract. They are rendered cells, not a cache.

## Decision providers

Yes. The two models already disagree in shape, and the branch is a module global.

`selectDecisionModel` sets `active` in `decisions/judge.ts`. `rerank` and `verify` then `if (active === 'jev')` into `jev-recipes`, else into a hand-written Autojev client. `slate/board.ts` imports those two functions and cannot see which client it is talking to. A third model means another branch in the same file, and two models cannot be compared inside one process.

Add a provider object and a map. Keep the gates, the claim shape, and the screen words in the caller. A new model is a file plus one map entry, the same way a sport is a folder plus one line in `sports/index.ts`.

```ts
type DecisionProvider = {
  id: 'jev' | 'tail-jev';
  rerank(input: {
    query: string;
    items: { id: string; text: string }[];
    topK: number;
    minRelevance: number;
  }): Promise<{ items: { id: string; text: string; relevance: number }[] }>;
  verify(input: {
    claims: { id: string; claim: string; evidence: string }[];
    minConfidence: number;
  }): Promise<{ checks: Check[] }>;
};
```

`model=autojev` stays an alias of `tail-jev`. Pass the provider into `buildBoard` instead of reading a global. `readStartArgs` can stay where it is.

Do not build a plugin directory, a config language, or a generic "HTTP decision" adapter until a third API exists. The Autojev client has opinions that should stay inside its provider: bearer token, `/systemone`, noul versus choice, the 0.80 gate reading the chosen option's probability rather than the separate confidence field, and a 120 second timeout. A fake provider that returns fixed checks is the test double. It is also how the board can be tested without TypeSafe or the tailnet.

One behavior to fix while splitting that file:

- There is no retry. A failed Autojev claim is `No call` on that row, and three failures in a row stop the rest of the calls. The Games board stays. Retry Autojev and ESPN a small number of times on timeout and 5xx before that stop. Do not retry The Odds API after a response. A retry of a priced request can spend another credit. A network failure before any response is the only odds retry that is safe.

Before a long `model=tail-jev` walk, call Autojev `/health` once. It is unauthenticated. Fail in a second if the tailnet box is down, instead of after the odds and ESPN work. Do not print the address.

## Later

**Decision cache, then SQLite.** JSON files keyed by model and state hash give replay for free and match the odds cache. The empty-body rule has landed. SQLite is the step after the index is in place, using the tables above. Do not migrate `odds-cache/` until `odds=YYYY-MM-DD` and `npm run odds` read the same rows the file cache reads now.

**A small pool for tail-jev.** Claims are strictly one at a time, so a slate is as slow as the sum of the tailnet calls. `props/board.ts` already has `mapPool`. A pool of 2 or 3 against one box is the useful range. Unbounded parallelism will time the box out and then, once retries exist, multiply the load. Cache hits skip the pool.

**Do not overwrite a snapshot without a trace.** `snapshots/<day>-<model>.json` is replaced on every matching run. `npm run compare` needs that exact name. Copy the previous file to `snapshots/archive/` before replace, or refuse when the file exists unless the run passes `--replace`. Compare keeps working. A good tail-jev day is harder to destroy.

**Cache ESPN for the process and for the day.** Teams, injuries, and schedules are already memoized in memory inside `createEvidence`. Player gamelogs are memoized in memory inside `createPlayers`. A second `npm start` the same day fetches them all again. A same-day file cache, hours not weeks, cuts that. Injuries can stay shorter than schedules. This is free data, so the win is reliability and speed, not credits.

**CI is `npm test` and `npm run typecheck`.** `test/pure.test.ts` covers the pure helpers and does not call The Odds API, TypeSafe, or Autojev. Do not add a workflow that does.

**Quota log.** One gitignored JSON line per live odds response: Eastern time, sport or event, cached or live, credits remaining. No URL and no key. That is the history that shows which sport spent the account down. The response header is already read in `oddsGet` and thrown away after the log line.

## Leave alone

- The three gates, moneyline-only tickets, one leg per game, and the top 10 ticket cap.
- Book order and the soccer draw skip.
- `jev-recipes` as the TypeSafe client. Wrapping it in a provider is enough.
- Rendering `SavedSlate` cells instead of re-deciding inside `npm run view`.
- Adding sports by folder. The decision-provider map should follow that pattern, not invent a new one.
