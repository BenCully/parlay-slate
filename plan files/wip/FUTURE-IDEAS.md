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

The build spec is `plan files/complete/DIRECT-BOOKS.md`. DraftKings, Caesars, and BetMGM have clients in the FanDuel shape, and an unset `ODDS_SOURCE` merges all four onto `bookmakers`. The live Odds API call is gone. Old Odds API cache files stay readable with `ODDS_SOURCE=the-odds-api`.

## Later

**Decision cache, then SQLite.** JSON files keyed by model and state hash give replay for free and match the odds cache. The empty-body rule has landed. The in-memory catalog is not the index: it still parses every body, and `readFamily` ignores it. SQLite is the step after a source-aware index is in place, using the tables above. Do not migrate `odds-cache/` until `odds=YYYY-MM-DD` and `npm run odds` read the same rows the file cache reads now, including the FanDuel prefix.

**A small pool for tail-jev.** Claims are strictly one at a time, so a slate is as slow as the sum of the tailnet calls. `props/board.ts` already has `mapPool`. A pool of 2 or 3 against one box is the useful range. Unbounded parallelism will time the box out and then, once retries exist, multiply the load. Cache hits skip the pool.

## Ideas added 2026-11-20

Nothing here is scheduled. Every item keeps the three gates, moneyline-only tickets, one leg per game, the top 10 cap, and book order. None adds a paid source or a new key. ESPN's public site API stays the only evidence and results source. Items 1 through 6 and 12 depend on structured picks, described next. Build that first.

Suggested order: structured picks, then grading (1), closing line value (4), and fixture capture (9). After that, the rest in any order.

### Groundwork: structured picks in every save

**Why.** `SavedSlate` (`ui/screen.ts`) holds rendered cells: `groups: string[][][]`. A cell like `Take Chiefs -150` has no event id, kickoff, book, point, or confidence a program can read back. Grading, closing line value, export, and the model history all need those fields. Parsing rendered text would break the next time a comment changes.

**How**
1. In `ui/screen.ts`, add an optional `picks?: SavedPick[]` to `SavedBoard` and `SavedProps`. An old save without it still opens.
   ```ts
   type SavedPick = {
     id: string;            // the claim id, e.g. `${eventId}:${team}:spread`
     eventId: string;       // book or merged composite id
     sportKey: string;      // americanfootball_nfl, motorsport_f1, ...
     kickoff: string;       // ISO
     home: string; away: string;
     market: 'moneyline' | 'spread' | 'total' | 'prop';
     side: string;          // team name, 'Over', 'Under', or 'Yes'
     player?: string; stat?: string;
     point: number | null;
     price: number; book: string; implied: number;
     verdict: 'supported' | 'contradicted' | 'unsupported' | null;
     confidence: number | null;
     status: 'ready' | 'review' | null;
     decision: 'dropped' | 'missed' | 'checked';
     slip: 'Take' | 'Lean' | 'Pass';
     pricesSavedAt: string; // odds cache savedAt, or the fetch time on a live read
   };
   ```
2. Fill it in `buildBoardInner` (`slate/board.ts`) at the same place each row is built. Every value is already in scope there: `leg`, the check, `judgment`, and `pulled.cachedAt`.
3. Fill it in `props/board.ts` where each prop row is finished. Use `stat` for the market key.
4. Add `ticketPicks?: string[][]` to `SavedBoard`, holding each ticket's pick ids in order.
5. `npm run view` keeps rendering `groups`. `picks` is data only, so the screen contract doesn't change.
6. **Test:** in `test/board.test.ts`, assert that every row on the board has exactly one pick, that ids match the claim ids, and that a Ready row has `slip: 'Take'`.

**Watch out.** Keep `picks` free of secrets and URLs. A snapshot is about 30% bigger. That's fine.

### 1. Grade past slates

**Why.** Nothing shows whether `Take` beats `Lean` beats `Pass`, or whether 0.80 is the right line.

**How**
1. Add `scripts/grade.ts` and `"grade": "node --import tsx scripts/grade.ts"`. The usage is `npm run grade -- 2026-11-20`, which also takes `model=` (default: every model with a snapshot that day).
2. Read `snapshots/<day>-<model>.json`. Skip a save with no `picks` and say so.
3. For each `sportKey` in the picks, fetch the ESPN scoreboard for each Eastern day the kickoffs fall on, with `?dates=YYYYMMDD`. Add a `scoreboard` URL to each `BoardSource`, which the sport files already define as `SCOREBOARD`.
4. Match a pick to an ESPN event by Eastern day plus both team names, through the same `nameKey` and alias rules in `espn/evidence.ts`. Use only events where `status.type.completed` is true. Anything else is `pending`.
5. Grade:
   - **Moneyline:** win or loss. A soccer draw is a loss for both sides.
   - **Spread:** the margin plus `point`, compared to 0. Exactly 0 is a `push`.
   - **Total:** the combined score compared to `point`. Equal is a `push`.
   - **Prop:** read the player's line from the ESPN event summary box score (`.../summary?event=<id>`). Reuse the stat keys `espn/players.ts` already reads from the gamelog, so football, soccer, NHL, NBA, and MLB stats all come from one place. A player who didn't appear is `void`.
   - **Formula 1:** finishing position from the racing scoreboard competitors. A win needs first, a top-2 needs 2nd or better, and a podium needs 3rd or better.
   - **A postponed or cancelled game** is `void`.
   - **A ticket:** every leg must win. A `void` leg drops out, the way books do it, and a ticket left with one leg is `void`.
6. Write `grades/<day>-<model>.json` (a new gitignored folder) as `{ gradedAt, picks: { id: result }[], tickets: result[] }`. Rerunning updates `pending` rows only.
7. Print a short summary: Take, Lean, and Pass hit rates, and the ticket record.
8. **Tests:** use saved ESPN scoreboard and summary fixtures in `test/fixtures/espn/`, and a fake save with one pick of each market type, including a push, a void, and a draw.

**Watch out.** ESPN summary pages don't go through `espn/cache.ts`'s same-day rule. Store final results with no expiry, because a completed game doesn't change.

### 2. Calibration report

**Why.** If verify's 0.85s only hit 60% of the time, the 0.80 gate is wrong in a way no single day shows.

**How**
1. Add `scripts/calibration.ts` and `npm run calibration`, which takes an optional `from=` and `to=`, and `model=`.
2. Read every `grades/*.json` and its snapshot's `picks`. Ignore `pending`, `void`, and `push`.
3. Group by:
   - verify confidence band, `0.50–0.60` through `0.90–1.00`
   - model
   - sport
   - market
   - slip (`Take`, `Lean`, `Pass`)
4. For each group, print the count, the hit rate, the average confidence, and the Brier score, \(\frac{1}{n}\sum (c - y)^2\). Also compare to the market: average `implied` against the hit rate, which shows whether the brief adds anything over the price.
5. Print groups with fewer than 20 picks dimmed, with a "too few to read" note.
6. **Tests:** feed a fixed grade set and check the bands, the counts, and the Brier score.

**Watch out.** This is a report. Don't let it change a gate. A gate change still needs Ben, per `AGENTS.md`.

### 3. Jev and Tail-Jev over time

**Why.** `npm run compare` shows one day side by side. It doesn't say which model is right more often, or where they disagree.

**How**
1. Add a `History` page to the compare screen (`ui/compare.ts`), and `npm run compare -- history` for text.
2. For each day with both snapshots graded, pair picks by `id`. Count:
   - both Take, and how many hit
   - only Jev Take, and how many hit
   - only Tail-Jev Take, and how many hit
   - both Pass
3. Show those counts per sport and in total, plus the days covered.
4. **Tests:** two fake graded days with a known overlap.

### 4. Closing line value

**Why.** Beating the last price before kickoff is the usual sign that a pick has real value, and it needs no results.

**How**
1. In `scripts/grade.ts`, or a separate `npm run clv -- <day>`, for each pick find the newest odds cache record for the same sport family (`oddsSlateFamily`) and source whose `savedAt` is before the pick's `kickoff`. Export the existing catalog reader in `odds/cache.ts` (`readCatalog`, now private) and use it instead of a new scan.
2. In that record, find the same event and side, matching by `eventId` and then by team names plus Eastern day. Read the price at the same `book`.
3. Report the move in implied probability, `closing implied - pick implied`, as positive when the price got shorter after the pick. Add the average move by slip and by model to the grade summary.
4. If no later save exists, report `no closing line`. Later idea: a scheduled refresh shortly before kickoff (item 13) produces one.
5. **Tests:** two cache records for one game, an hour apart, in a temp `ODDS_CACHE_DIR`.

**Watch out.** A `partial` merged record may be missing the pick's book. Fall back to `no closing line`, not to another book.

### 5. Best price across books

**Why.** Book order decides which price the gate reads, and that stays. But you should know when another book pays more for the same side.

**How**
1. In `getLegs` (`slate/board.ts`), after `postedMarket` picks the gate's book, scan every book's `h2h` for the same outcome name. Keep the best price and its book in `leg.best`.
2. When the best book differs and its price is better, add "Best price: DraftKings -135." to the moneyline comment. Do the same for spreads at the same point only, and totals at the same point only.
3. Add `bestPrice` and `bestBook` to the pick.
4. Don't use the best price for the gate, the implied column, or tickets. `AGENTS.md` fixes book order for those.
5. **Tests:** two books with different prices for one team. The gate still uses FanDuel, and the comment names DraftKings.

### 6. Stale and changed warnings

**Why.** A morning slate viewed at night shows morning prices and morning injuries, with nothing to say so.

**How**
1. **Stale prices:** `pricesSavedAt` is in every pick. In `ui/screen.ts`, compute the oldest one on the open board at view time, and add "Prices 6h old" to the board title line when it's over `STALE_HOURS`. Make that a `.env.settings` value, default 3.
2. **Changed injuries:** add `npm run recheck -- <day>`.
   - Store each side's injury text in the pick when the board is built. It's already in `brief.pick.injury`.
   - On recheck, fetch ESPN injuries for those teams with the cache bypassed (a `fresh` flag for `espn/cache.ts`).
   - Compare to the stored text, and print the rows whose injury text changed. Then open the slate with those rows marked `Changed` in the Decision cell.
3. Later, behind a flag: re-verify only the changed rows with the same model and save them as a new snapshot. That costs model calls, so keep it opt-in.
4. **Tests:** a stored injury string against a stubbed ESPN response with one new player listed.

### 7. Pick the sports to run

**Why.** Every run walks all six sports and pays model calls for all of them, even when only the NBA matters tonight.

**How**
1. Give each `Sport` and league a short id (`nfl`, `ncaa`, `epl`, `ucl`, `laliga`, `seriea`, `bundesliga`, `ligue1`, `nhl`, `nba`, `mlb`, `f1`), plus parent ids (`football`, `soccer`).
2. Parse `sports=nba,nhl` in `readStartArgs` (`decisions/judge.ts`), and reject an unknown id with the list of valid ones. `scripts/route.ts` should treat `sports=` as a slate argument.
3. In `runSlate`, filter `SPORTS` before the walk.
4. **Snapshots:** a partial run must not throw away the sports it skipped. When `snapshots/<day>-<model>.json` exists, copy the skipped sports from it into the new save, and mark each with `fromSavedAt`. The screen can show "from an earlier run" on those tabs.
5. **Launcher:** add a "Sports" checkbox row on Start and Replay in `ui/tui/options.ts`, and save the choice in `runs/tui-settings.json`. Show the `sports=` part in the command preview.
6. **Tests:**
   - `readStartArgs` parsing.
   - The snapshot merge keeps a skipped sport.
   - A launcher reducer test for the checkboxes.

**Watch out.** Compare reads the whole snapshot. A merged sport from an older run is fine there, because it's still that model's decision.

### 8. Timing in the run log

**Why.** Before any speed work, know where a run spends its time.

**How**
1. Add `slate/timing.ts` with `timed(stage, sport, fn)`, which wraps a promise with `performance.now()`.
2. Wrap these: the window, the odds read (noting cached or live), the briefs, rerank, verify, props odds, the props verify, and the snapshot write.
3. At the end of `runSlate`, append one JSON line per run to gitignored `runs/timing.jsonl`, as `{ at, model, day, sport, stage, ms, cached }[]`. `TIMING_LOG=0` turns it off, the same way `QUOTA_LOG` works.
4. Print a one-line total per sport at the end of the run log.
5. Add `npm run timing`, which prints the median and the slowest stages over the last N runs.
6. **Tests:** `timed` records a stage, and a thrown error still records the time and rethrows.

### 9. Capture fixtures from real book responses

**Why.** The FanDuel, DraftKings, BetMGM, and Caesars APIs are unofficial. When one changes shape, the board quietly loses a book. Fixtures from real traffic make `npm test` catch it, and they unblock checks like the Caesars sign.

**How**
1. In `odds/http.ts` `fetchJson`, and in the BetMGM curl path, when `CAPTURE_DIR` is set, write each raw response to `CAPTURE_DIR/<book>-<sport>-<kind>.json` before parsing.
2. Add `npm run capture -- <book> <sport>`. It sets `CAPTURE_DIR` to a temp folder and makes one slate read and one props read through the book client directly, with the cache bypassed and nothing stored.
3. **Sanitize before saving.** Remove every query string, every header, any field named like `token`, `access`, `session`, `cookie`, or `id` on account objects, and any URL. Trim to the first 3 events. Then save to `test/fixtures/books/`.
4. Print a short diff of the changed keys against the existing fixture, so a shape change is visible.
5. Add tests that run `normalizeDraftKings`, `normalizeBetMgm`, and `normalizeCaesars` on each fixture. They assert at least one event, two team names, finite prices, and paired spreads and totals. FanDuel has no pure normalizer: `fanduelSlate` fetches and parses in one function. Split its parsing out first as `normalizeFanDuel(pages, options)`, the way the other three are built.
6. Refresh fixtures monthly, or when a book fails in a run. That's a manual step. Don't call the books from CI.

**Watch out.** Read each sanitized file before committing it. A captured response is the most likely place for a token to end up in git, and gitleaks only catches known patterns.

### 10. `npm run doctor`

**Why.** One command that says what's broken before a long run, instead of finding out sport by sport.

**How**
1. Add `scripts/doctor.ts` and `npm run doctor`. Each check prints `ok`, `warn`, or `fail` with one line of detail, and the exit code is 1 when anything fails.
2. Checks:
   - **Node:** `process.version` against `.nvmrc` and `engines`.
   - **Keys:** each name is set or missing. Never print a value or its length.
   - **Books:** one small slate read per book, through the client, with the cache bypassed and not stored, for a sport that's in season. Report the event count and time.
   - **ESPN:** one scoreboard read.
   - **Autojev:** `GET /health` when `AUTOJEV_URL` is set, with a 5-second timeout. Print "reachable" or "not reachable", never the address.
   - **TypeSafe:** key presence only. A real call costs money.
   - **Lock:** whether `runs/slate.lock` exists, and whether its pid is alive.
   - **Caches:** file count, size, and newest save for `odds-cache/`, `espn-cache/`, and `snapshots/`.
3. Add a "Doctor" action to the launcher that prints the same lines in a list view, like List saved odds.
4. **Tests:** stub `fetch` for each check, assert a failure gives exit 1, and assert no key value ever appears in the output.

### 11. Filter in the screen

**Why.** A full Saturday slate is long. Usually you want one team, or only the Take rows.

**How**
1. In `presentScreen` (`ui/table.ts`), `/` opens a one-line input in the status row. Typing filters, Enter keeps the filter, and Esc clears it. `t` toggles "Take only".
2. Change `ScreenPage.render(width)` to `render(width, filter)`, with `filter: { text: string; takeOnly: boolean }`. In `ui/screen.ts`, `renderBoard` keeps a group when any cell contains the text, case-insensitive, and, with `takeOnly`, when any row's Slip starts with `Take`.
3. Show the active filter in the hint line, plus "0 rows match" when it's empty.
4. Keep every line within `columns - 1`, per `AGENTS.md`, and test at 70 and 120 columns.
5. **Tests:**
   - Unit tests on `renderBoard` with a filter.
   - A `test/screen.test.ts` case that types `/chiefs` and checks only that group is shown.

**Watch out.** Typing in the input must not trigger the screen's keys, such as `q`, `[`, or `1`. Route keys to the input while it's open.

### 12. Export a ticket sheet

**Why.** Get the day's picks into a note, a message, or a spreadsheet without screenshots.

**How**
1. Add `scripts/export.ts` and `npm run export -- <day>`, which also takes `model=` and `format=md|csv`, default `md`.
2. Read the snapshot's `picks` and `ticketPicks`. A save without `picks` exits with a message.
3. **Markdown:** a section per sport, a table of Take rows (game, side, price, book, confidence), then the tickets with hit rate and payout. **CSV:** one row per pick, with every `SavedPick` field.
4. Write to stdout, or to `runs/exports/<day>-<model>.<ext>` with `--out`.
5. Add an "Export" action to the launcher next to View snapshot.
6. **Tests:** a fake save with picks produces fixed Markdown and CSV.

### 13. A scheduled morning run

**Why.** The slate is ready when you sit down, with no screen to babysit.

**How**
1. Add `runSlate({ screen: false })`, which saves the run and the snapshot and returns without calling `showSlate`. A non-TTY run today prints the whole slate as text, which would fill the log.
2. Add `scripts/scheduled.ts`. It runs the slate with `screen: false`, then sends a macOS notification with `osascript -e 'display notification ...'`, for example "NBA, NHL: 3 tickets, 7 Take rows". If the lock is held, it notifies "skipped, a run is in progress" and exits 0.
3. Ship `scripts/launchd/com.bencully.parlay-slate.plist.example`.
   - Set `WorkingDirectory` to the project, because `.env` is read relative to it.
   - Use an absolute path to `node` from `.nvmrc`'s version, because launchd has no shell `PATH`.
   - Use `StartCalendarInterval` for the time, and send stdout and stderr to `runs/scheduled.log`.
4. Document install and uninstall in the README: copy the file to `~/Library/LaunchAgents/`, then `launchctl load` or `unload`.
5. Optional second job: a refresh an hour before the first kickoff, with `--fresh`, which gives item 4 a closing line.
6. **Tests:** `runSlate` with `screen: false` returns without opening a screen, and `scheduled.ts` builds the notification text from a fake result.

**Watch out.** Keys stay in `.env`. The plist must not contain them. A sleeping Mac skips the job; `launchd` runs it at wake only for `StartCalendarInterval`, which is the behavior you want.

### 14. Snapshot retention

**Why.** Today the choice is keeping every snapshot and archive forever, or Clear snapshots wiping all of them, including the days grading needs.

**How**
1. Add `SNAPSHOT_KEEP_DAYS` (default unset, meaning keep all) and `ARCHIVE_KEEP_DAYS` (default 14) to `.env.settings.example`.
2. After `saveDecisionSnapshot` in `scripts/snapshot.ts`, prune `snapshots/archive/` files older than `ARCHIVE_KEEP_DAYS` by their stamp. When `SNAPSHOT_KEEP_DAYS` is set, also prune snapshots whose day is older than that. Never touch today's or the current run's day.
3. Don't prune a snapshot that has a `grades/` file when the grade still has `pending` rows.
4. In the launcher, change Clear snapshots to offer "Older than N days" and "Everything". Keep the typed `yes` for Everything.
5. `npm run clear-snapshots -- older-than=30` gives the same choice from the command line.
6. **Tests:** a temp snapshot folder with dated files, checking what's kept and removed, and that the pending-grade guard holds.

## Leave alone

- The three gates, moneyline-only tickets, one leg per game, and the top 10 ticket cap.
- Book order and the soccer draw skip.
- `jev-recipes` as the TypeSafe client. Wrapping it in a provider is enough.
- Rendering `SavedSlate` cells instead of re-deciding inside `npm run view`.
- Adding sports by folder. The decision-provider map should follow that pattern, not invent a new one.
- Odds API and FanDuel cache files stay separate. A file with no `source` stays an Odds API save.
