# Future ideas

Recommendations from a read of the code on 2026-11-19. Nothing here is scheduled. The 0.60 favorite gate, the 0.60 rerank gate, and the 0.80 verify gate stay. Do not add a paid odds or news source. `ODDS_SOURCE=fanduel` is the free source that already exists. DraftKings, BetMGM, and Caesars are planned the same way under Direct book sources. `changelog.md` is only for changes that have landed.

## Done

Landed 2026-11-18. The check action pins were updated 2026-11-19. These are not open work.

**An empty odds file does not hide a slate.** `readFamily` skips an empty body when another save for that sport and markets is still inside `ODDS_CACHE_HOURS` and still has games. The empty file is used when it is the only fresh one. A hit on the exact request hash still returns that file.

**Top-level errors are scrubbed.** `main().catch` uses the same `apiKey=` scrub as a league or sport failure, and prints that message.

**The book is on the row.** Moneyline, spread, total, and prop comments name the book that posted the price. FanDuel, DraftKings, BetMGM, and Caesars use those names. Any other book uses its title, then its key. A missing spread or total says that no book posted it.

**One `npm start` at a time.** `runs/slate.lock` holds the process id. A second start exits and names that pid. A lock whose process is gone is taken over. The lock covers the walk and the screen, and it is removed when the process finishes.

**The odds body is typed at the boundary.** `oddsGet` parses a slate into events and a prop response into one event before either board sees it. Each event has `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. A different shape throws there. The cache still stores the raw response.

**A snapshot keeps a trace.** Replacing `snapshots/<day>-<model>.json` first copies the previous file to `snapshots/archive/<day>-<model>-<savedAt>.json`. Compare still reads the current name. An identical rewrite does not add another archive file. `npm run clear-snapshots` removes the archive with the rest of `snapshots/`.

**ESPN pages are cached for the Eastern day.** Teams, schedules, rosters, and gamelogs are reused for 18 hours. Injuries are reused for 3 hours. A page from a previous Eastern day is a miss. Failures are not stored. The scoreboard is still fetched on every run. Files live in gitignored `espn-cache/`. Only `site.api.espn.com` and `site.web.api.espn.com` are stored.

**CI runs the offline checks.** `.github/workflows/check.yml` runs `npm ci`, `npm test`, and `npm run typecheck` on a pull request and on a push to `main`. It does not call The Odds API, TypeSafe, or Autojev. The steps use `actions/checkout` v6 and `actions/setup-node` v6, so the action runtime is Node 24. The job still installs Node 22.

**Odds credits are logged.** Each odds response appends one JSON line to gitignored `runs/quota.jsonl`. The line is Eastern time, the sport, the event id for a prop, `cached` or `live`, and credits remaining. It has no URL and no key. `QUOTA_LOG=0` turns it off.

Sports are already the extension point that works. A new league is a `BoardSource` (`sports/types.ts`), an `EvidenceStyle` (`espn/evidence.ts`), and a `PropProfile` (`props/board.ts`), then one line in `sports/index.ts`. Do not replace that with a plugin loader.

## Database for the cache

Not a server database. Postgres or anything that needs a daemon is the wrong tool for a one-person CLI whose data is already gitignored files next to the script.

The odds cache in `odds/cache.ts` is a folder of JSON files. The Odds API file name is the request hash. A FanDuel file is `fanduel-` plus that hash, so it does not replace a paid save. Each record stores `source`. A save with no source is The Odds API and must not be reused for FanDuel. A hit spends no credit, writes are atomic (`write` then `rename`), and `apiKey` is stripped from the key. Keep the JSON bodies until the folder is hard to query.

Two behaviors are still the problem, and a database does not fix them by itself:

- `readFamily` does not use the in-memory catalog. On a miss it reads every `.json` file in `odds-cache/`, then keeps the matching source, sport, and markets. `listSavedOdds` and an `odds=` replay use `readCatalog`, which parses the whole folder once per process and again after a write. Prop files still grow one per game. An index of `{hash, source, sport, markets, savedAt, games, easternDay}` removes the scan. A JSON index next to the folder is enough. The index has to carry `source`, or a FanDuel file can satisfy an Odds API lookup.
- Decisions are not cached. `odds=` replays prices and still calls TypeSafe or Autojev. A tail-jev day is one HTTP call per claim (`decisions/judge.ts` decides each claim in order). The expensive repeat is the model, not the odds file.

Do those two in the files that exist. Move to one local SQLite file after that, and only if you want history you can query: line movement, which book posted a price, and decision reuse across runs. The check workflow installs Node 22, so `DatabaseSync` has to import there before that job can use it. Node 24 on this machine already exposes `node:sqlite` (`DatabaseSync`). That file needs no new package and no server. One gitignored database can hold the odds index, decision rows, and a short ESPN cache. Do not put API keys or request URLs in it.

What to store when that file exists:

| Table | Key | Why |
| --- | --- | --- |
| Odds responses | request hash and source, or source + sport + markets + Eastern save day | Replace the directory scan. Keep the JSON body. Keep FanDuel rows off the Odds API hash. |
| Decisions | model + hash of kind, question, and state | Replay a tail-jev slate without another tailnet walk. Evidence text is inside the hash, so a new injury report misses. |
| ESPN pages | URL path + savedAt | The same-day file cache already covers these pages. A database row is only useful if that folder gets hard to query. |

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

- Autojev and ESPN still have no retry. A failed Autojev claim is `No call` on that row, and three failures in a row stop the rest of the calls. The Games board stays. Retry Autojev and ESPN a small number of times on timeout and 5xx before that stop. Do not retry The Odds API after a response. A retry of a priced request can spend another credit. A network failure before any response is the only odds retry that is safe. FanDuel already asks again, in smaller chunks, for market ids a short price response left out. That split is not this retry.

Before a long `model=tail-jev` walk, call Autojev `/health` once. It is unauthenticated. Fail in a second if the tailnet box is down, instead of after the odds and ESPN work. Do not print the address.

## Direct book sources

The build spec is `DIRECT-BOOKS.md`. It was checked against live Illinois responses on 2026-11-19. DraftKings, BetMGM, and Caesars each get a client in the FanDuel shape. A later merged read fills `bookmakers` so `postedMarket` can keep FanDuel, DraftKings, BetMGM, Caesars without a live call to The Odds API. Until that file's exit checklist is true, The Odds API stays the default.

## Later

**Decision cache, then SQLite.** JSON files keyed by model and state hash give replay for free and match the odds cache. The empty-body rule has landed. The in-memory catalog is not the index: it still parses every body, and `readFamily` ignores it. SQLite is the step after a source-aware index is in place, using the tables above. Do not migrate `odds-cache/` until `odds=YYYY-MM-DD` and `npm run odds` read the same rows the file cache reads now, including the FanDuel prefix.

**A small pool for tail-jev.** Claims are strictly one at a time, so a slate is as slow as the sum of the tailnet calls. `props/board.ts` already has `mapPool`. A pool of 2 or 3 against one box is the useful range. Unbounded parallelism will time the box out and then, once retries exist, multiply the load. Cache hits skip the pool.

## Leave alone

- The three gates, moneyline-only tickets, one leg per game, and the top 10 ticket cap.
- Book order and the soccer draw skip.
- `jev-recipes` as the TypeSafe client. Wrapping it in a provider is enough.
- Rendering `SavedSlate` cells instead of re-deciding inside `npm run view`.
- Adding sports by folder. The decision-provider map should follow that pattern, not invent a new one.
- Odds API and FanDuel cache files stay separate. A file with no `source` stays an Odds API save.
