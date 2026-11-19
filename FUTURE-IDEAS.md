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

Written 2026-11-19. DraftKings, BetMGM, and Caesars are books inside a The Odds API response today. The app does not call them. `postedMarket` in `odds/books.ts` keeps the first of FanDuel, DraftKings, BetMGM, and Caesars (`williamhill_us`) that posted the market. `ODDS_SOURCE=fanduel` already skips that response and reads FanDuel's own sportsbook JSON. Formula 1 (`motorsport_f1`) always takes that FanDuel path.

The goal is the same read for the other three books, then one merged slate, then no live call to The Odds API. Each book is a file that returns the event shape `oddsGet` already parses: `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. One bookmaker on that event, with that book's key, so the row comment still names it. Illinois, same as FanDuel. Timeout 30 seconds. No new account, no new key, and no paid aggregator. SockOdds, TheRundown, OddsPapi, PropLine, and SportsGameOdds are paid sources. Leave them out.

Do this in order. A book is done when `npm test` covers its normalizer with a saved fixture and a manual live read of one league returns moneylines, spreads, and totals. `npm test` stays offline.

**1. DraftKings.** `odds/draftkings.ts`. `ODDS_SOURCE=draftkings`. The sportsbook site reads `sportsbook-nash.draftkings.com` for site `US-IL-SB`. The league page is the slate. A second request per event is the props, the same split FanDuel uses for layout then facet. American prices are already on the selection. Confirm the league ids on a live Illinois page before writing them down. The set is NFL, NCAAF, NBA, NHL, MLB, and the six soccer leagues. Skip alternates, quarters, and halves. The normalized book key is `draftkings`.

**2. BetMGM.** `odds/betmgm.ts`. `ODDS_SOURCE=betmgm`. The Illinois site reads `sports.il.betmgm.com/cds-api/bettingoffer/fixtures` for the slate and `fixture-view` for one event. The host returns 403 without the public access id that page already sends and without a browser `User-Agent`. Store that id as a constant whose name does not look like a secret, the same way the FanDuel sportsbook app id is stored. Do not put the id in a URL in the repo, the changelog, a log line, or this file. Prices are `americanOdds` on each result. Skip a runner whose visibility is not open. Their sport and competition ids are not Odds API keys. Keep that map in the client and confirm it on the fixtures call. The normalized book key is `betmgm`.

**3. Caesars.** `odds/caesars.ts`. `ODDS_SOURCE=caesars`. The Illinois site reads `api.americanwagering.com` under region `us`, location `il`, brand `czr`, sportsbook `v3`. Highlights for one competition are the slate. One GET per event is the markets. Pin the competition ids from a live highlights response. They are UUIDs and they go stale. Space the event calls. Do not fan out one request per game with no cap. The normalized book key stays `williamhill_us`, so `bookLabel` still prints Caesars. The source id is `caesars`, so the cache file and the header do not say William Hill.

Shared rules for all three:

- Cache files are `{source}-` plus the request hash. A FanDuel file stays `fanduel-`. A file with no `source` stays a The Odds API save. None of these replace each other.
- `oddsSourceLabel` prints DraftKings, BetMGM, and Caesars. The header already shows that label.
- `requireRunKeys` skips `ODDS_API_KEY` for a direct source, as it already does for FanDuel.
- Team names go through the ESPN index in `odds/fanduel.ts` (`buildTeamIndex`, `resolveTeamName`). A miss keeps the posted name. Do not copy that matcher into each file.
- Soccer spreads and totals, when the league page omits them, are the posted line closest to even. That is the FanDuel soccer rule.
- Props map onto the market keys the boards already ask for. A market the book does not post stays no line. Ask before adding a market.
- Formula 1 stays on FanDuel until one of these books posts the race. `oddsRequestSource` keeps forcing `motorsport_f1` to FanDuel.
- `replayMissError` only knows `fanduel` and `the-odds-api`. Change it to name every other source that saved that day before the second direct book lands. A copied `npm run odds` command sets `ODDS_SOURCE=` when the saved source is not the active one. That already works for two sources. Keep it for the new ones.
- Failures report status and the response message. No request URL in the message. Do not retry a priced response. A network failure before any response may be retried once.

**4. Merge, then drop the live Odds API call.** After the three clients exist, add a source that asks FanDuel, DraftKings, BetMGM, and Caesars and puts all four on `bookmakers`. `postedMarket` then keeps today's order without The Odds API. One book failing leaves the other three and names the miss in the board note. Cache that merged body under its own source, so it does not satisfy a single-book replay.

The live `fetch` to `api.the-odds-api.com` comes out only after all of these are true:

- The merged read returns moneylines, spreads, and totals for every league the slate walks, or the board note says that book does not post the league.
- Props FanDuel already maps are mapped for each book, or left as no line on purpose.
- `odds=` for an old `the-odds-api` day still opens, and `npm run odds` still lists it.
- The parser in `odds/cache.ts` stays. Old cache files stay. The screen still reads rendered cells.

Until that list is true, `ODDS_SOURCE` selects one book, and The Odds API remains the default.

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
