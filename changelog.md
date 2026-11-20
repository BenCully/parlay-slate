# Changelog

Newest entries go at the top. Each heading is `YYYY-MM-DDTHH:MM:SSZ`.

## 2026-11-20T22:54:20Z

### Odds date and kickoff column

The top row shows `Odds:` and the Eastern day the prices were saved, just left of the x button. A replay uses `oddsDay`. A live save stores `oddsAt`, the latest games-odds read, and shows that day. An older save uses the Eastern day of `savedAt`. A compare screen shows both days when they differ. The odds source drops before that date, and the date drops before the model, when a sport name would not fit. Clicking the date does not close the screen.

Games rows are Team, Date, Price, Market, Decision, Slip, Comment. Props rows are Team, Date, Player, Line, Decision, Slip, Comment. Date is the Eastern kickoff, with the weekday and the time, such as `Sat Nov 21, 6:00 PM`. Spread and total rows repeat it. An old save whose rows have no date cell keeps the previous columns.

## 2026-11-20T22:30:25Z

### MLS

Soccer now has MLS after Ligue 1. The Odds key is `soccer_usa_mls` and the ESPN competition is `usa.1`. FotMob is 130. Games and Props use the same window, 3-way moneyline, and prop markets as the other domestic leagues. The empty game-log sentence says 2026 season.

FanDuel reads competition 141. DraftKings reads league 89345. BetMGM matches Major League Soccer in the USA. Caesars reads the MLS competition. Los Angeles FC maps to LAFC, Los Angeles Galaxy to LA Galaxy, New York Red Bulls to Red Bull New York, DC United to D.C. United, NYC FC to New York City FC, and Sporting KC to Sporting Kansas City. Inter still maps to Internazionale, so Inter Miami stays Inter Miami.

When FotMob posts conference tables beside a larger overall table, the brief uses the overall table. MLS does.

## 2026-11-20T19:26:01Z

### User manual

`docs/user-manual.md` is the guide for the launcher, the slate screen, tickets, props, and compare. The README keeps one picture of the NFL Games page and points at that manual. The new pictures are in `docs/screenshots/`, including the splash. Saved slips from before Lean still say `Take` in those pictures. A run today says `Lean` for a supported pick under 0.80.

## 2026-11-20T19:06:54Z

### Review 2

A Formula 1 driver with one moneyline is a leg again. `postedMarket` accepts a single moneyline when the sport is outright.

A featured extra can be priced under 0.60. A price of 0.60 or better still wins when one is posted. The missing row says no featured player had a usable extra. Football passing touchdowns and field goals skip the tiny unders.

A family cache hit is used only when the saved window covers the request. A newer save that does not cover it no longer hides an older one that does.

Alt plus a key is one ignored event. A bad `npm run slate` date prints one line and exits 1. `mapPool` stops taking new work after a failure. One listing of a game stays one game when the kickoff times disagree. A book has to list the matchup twice before those times split it. A Caesars tab path may be percent-encoded and may include a query. Book error notes go through `scrubText`.

`QUOTA_LOG` set to a file path warns once and still writes there. Use `QUOTA_LOG_PATH` for that file, and set `QUOTA_LOG=1`.

The NHL, NBA, MLB, and Formula 1 windows start one hour before the first game still ahead. A finished game does not set them. The board test builds its kickoff from the clock, so it does not expire in 2027.

## 2026-11-20T18:26:31Z

### The rest of the review

A saved Eastern day before today opens on Current slate. Alt+key is delivered instead of waiting for another key. Ctrl-C during a launcher run removes `runs/slate.lock` and exits 130. That handler is off once the slate screen opens. View, View snapshot, and Compare stay on the alternate screen. A lock older than 12 hours is taken over.

Briefs run six at a time. NFL, NCAA, and soccer use the same upcoming window as the other sports, so a finished game does not set it. Soccer still looks four days past the last game still ahead. An empty soccer board is four Eastern days. NFL and NCAA still label the week.

Board notes pass through `scrubText` before they are saved. That replaces a key, a bearer token, and `AUTOJEV_URL`. Team short names belong to the board being built.

A same-day doubleheader stays two games. FanDuel errors name the status and leave the body out. BetMGM sends the curl URL on stdin, and that host must be https. A Caesars tab path must stay on the Illinois host. Competition pages are reused until the next run. Placeholder events share one helper. A unicode minus is a price. Each book's body is checked before a merged read keeps it. `QUOTA_LOG=1` writes the default file. `QUOTA_LOG_PATH` chooses another file. `ODDS_CREDIT_FLOOR` is gone, because live reads no longer return a credit header. The 0.60 gate still reads the posted price, vig included.

CI reads Node from `.nvmrc`, which is 24. An offline test pins the favorite gate, the top 8, verify at 0.80, and the tickets.

## 2026-11-20T18:03:52Z

### Lean under 0.80

A supported verdict that clears 0.80 still says `Take`. A supported verdict under 0.80 says `Lean`, including a contradicted spread that flips to the other side. Anything else stays `Pass`. Prop slips use the same words. Tickets still use only Ready legs. A save already written keeps the slip text it stored. `Lean` is the same width as `Take`.

## 2026-11-20T17:59:57Z

### Cached windows, merged props, and extra props

A merged props read keeps every book's markets on one event. Team-name differences no longer split the game. A row with no priced market is left out.

A reused slate keeps the games whose kickoff falls in the new window. When that save had games and none remain, the run fetches again. An exact request hash still returns that file. A merged read that lost a book is stored as partial and stays fresh for 30 minutes. A partial empty slate is not stored. `odds=` still opens a partial file from that day.

BetMGM baseball keeps a fixture whose competition name is MLB. There is no saved BetMGM baseball file to read a competition id from. A sport with no competition id and no name matches nothing.

A one-sided moneyline, spread, or total does not beat a complete line from a later book. A 3-way moneyline needs three outcomes. `pickBalanced` scores a pair by its no-vig price, then by the vig. A spread pairs a team with the other team's opposite number, including a pick'em.

An extra prop outside soccer stays on a featured player at 0.60 or better. Soccer can still fall through to another posted option. An Under is not the extra for NBA blocks or steals, MLB stolen bases, or NHL power-play points.

A bad date or an unknown `--` flag throws before the sports walk. A `.json` path is still a view file. An unreadable ESPN scoreboard is an empty board.

## 2026-11-20T17:34:27Z

### Merged prop ids

A merged props read uses each book's own event id. `bookEventId` pulls `fd`, `dk`, `mgm`, or `czr` out of `fd=…,dk=…,mgm=…,czr=…`. FanDuel no longer sends that whole string to its props search. When FanDuel did not list the game, that part is empty and FanDuel makes no request. DraftKings, BetMGM, and Caesars use the same helper.

## 2026-11-20T17:31:14Z

### Splash Ctrl-C, clear confirm, and fresh book reads

Ctrl-C during the logo restores the terminal and exits 130. Any other key still skips to the options screen.

Clear snapshots opens with No focused. Enter on No cancels. Tab to Yes, typing `yes`, or clicking Yes still clears. `q` and Esc close the date picker and that confirm. The x button still leaves the launcher.

Each slate run drops the DraftKings and BetMGM prices kept in memory, and the merged-book header flags. A later run in the same process reads the books again. Soccer spreads are copied onto a new BetMGM fixture, so one league does not leave its lines on the cached object the next league reads. FanDuel and Caesars do not keep a price cache.

## 2026-11-20T16:48:48Z

### Terminal screen tests

`npm test` drives the alt screen with `@microsoft/tui-test` 0.1.1, pinned, backend Alacritty. `test/screen.test.ts` opens the committed `test/fixtures/slate.json` through `scripts/view.ts`. It checks a league click, the Props tab, the close button, `]` and `2`, the wheel, a scrollbar drag, and the sport names at 100 columns and at 70. `q` on the launcher exits. Opening that file from the launcher, then `q`, returns to the options screen, and a second `q` exits. Ctrl-C on that slate exits. This version of the driver does not report a `run()` exit code, so the tests wait until the process is gone. Koffi loads from its optional prebuild, so `allowScripts` stays limited to esbuild and fsevents.

`npm run tui -- path.json` selects View snapshot for that file. The path is not written to `runs/tui-settings.json`.

## 2026-11-20T01:46:30Z

### Launcher click no longer flickers or sticks

A click in the last-run screen was being cut apart. The digits in the mouse report then changed tabs, and every one of those paints cleared the whole terminal. The terminal stopped accepting keys, including `q` and Ctrl-C, and stayed in raw mode. Mouse bytes now stay mouse reports, including a report whose escape byte arrived in the previous chunk. Later paints overwrite the rows in place instead of clearing the screen, and a burst of motion paints once. A draw that throws restores the terminal before the process exits. A resize that does not change the size does not paint again.

## 2026-11-20T01:14:10Z

### Terminal launcher

Bare `npm start` in a terminal plays a Parlay Slate logo, then opens the options screen. `npm run slate` is the direct run. `npm start --` with a date, `model=`, `odds=`, or `--fresh` still runs the slate and skips the launcher. `--no-splash` skips the logo. `--tui` opens the launcher and can prefill those arguments. `--slate` forces a direct run and wins over `--tui`. A pipe running `npm start` with no slate arguments still prints the slate as text. `npm run tui` needs a terminal and exits 1 without one.

After a slate, a compare, or the saved-odds list closes, the options screen comes back. `q` on those screens returns to the options. Quit, Esc when no dialog is open, `q`, or the x button leaves the launcher. Ctrl-C restores the terminal and exits. The options screen does not hold `runs/slate.lock`. Last-used options are `runs/tui-settings.json`. That file is not the saved slate.

The odds source choices are All books, FanDuel, DraftKings, BetMGM, Caesars, and The Odds API. The Odds API only opens saved files, so a live start cannot use it. Fresh rereads the books and ignores `odds-cache/`. `readStartArgs` returns `fresh`. `setOddsFresh` bypasses the cache for that run without putting `--fresh` on `process.argv`, and the flag is cleared when the run finishes. `PARLAY_SLATE_NO_ANIM` set to anything other than `0` holds a still logo.

## 2026-11-20T00:35:31Z

### The Odds API is no longer called

An unset `ODDS_SOURCE` reads FanDuel, DraftKings, BetMGM, and Caesars. `ODDS_API_KEY` is not read, and `oddsGet` does not fetch `api.the-odds-api.com`. A line the books do not post stays no line. `ODDS_SOURCE=the-odds-api` still opens files saved before this change, including a replay with `odds=YYYY-MM-DD`. A live request for that source with no saved file throws. Formula 1 still reads FanDuel. `npm run odds` prints `ODDS_SOURCE=the-odds-api` on an old day because the active source is now the books.

## 2026-11-20T00:26:44Z

### Direct book sources

`ODDS_SOURCE` now accepts `draftkings`, `betmgm`, `caesars`, and `books` in addition to `fanduel` and the default `the-odds-api`. Each direct book reads that Illinois sportsbook and normalizes moneylines, spreads, totals, and the player props the boards already ask for. `books` fetches all four, matches games by the two team names and the Eastern date, and keeps each book on its own bookmaker. A book that throws is omitted and named in the board note. The header drops a book that failed and never succeeded in that process. Cache files are prefixed `draftkings-`, `betmgm-`, `caesars-`, and `books-`, so they do not replace an Odds API file or each other. A replay miss names every other source that saved that day. Direct sources do not require `ODDS_API_KEY` and do not print a credit count. Formula 1 still reads FanDuel when the source is `books`. BetMGM loads its access id from client config at runtime. The id is not in the repo. Its fixtures calls use curl over HTTP/1.1. The Odds API stays the default, and the live fetch stays, until the exit checklist in `DIRECT-BOOKS.md` is true.

## 2026-11-19T22:55:49Z

### Formula 1

Formula 1 is the last parent tab, with one F1 league. Prices come from FanDuel even when `ODDS_SOURCE` is The Odds API, and the cache file stays a FanDuel file. The Odds API does not post this sport. Each driver priced at 60% or better is one moneyline. The bet is the race win when that price clears 0.60, otherwise a top-2 finish, otherwise a podium. A driver keeps only that bet, so two drivers from the same race can share a ticket. The Games page has no spread and no total. The brief is the ESPN championship standing and the points from the last five races. The Props tab is a note. Qualifying, fastest lap, top 10, and team markets stay off the slate. The 0.60 favorite gate, the 0.60 rerank gate, and the 0.80 verify gate are unchanged. The other sports still use the configured odds source.

## 2026-11-19T02:10:41Z

### Odds source on the header

The top row now reads `Odds Source: FanDuel` or `Odds Source: The Odds API` between the model and the x button. `runs/last-run.json` and the snapshot store `oddsSource` as `fanduel` or `the-odds-api`. A compare screen shows both names when the two saves used different sources. An older save with no `oddsSource` leaves that spot blank. A row that cannot keep the first sport drops the odds source before it drops the model.

## 2026-11-19T01:52:21Z

### Check workflow runs on Node 24 actions

`.github/workflows/check.yml` uses `actions/checkout` v6 and `actions/setup-node` v6. Those actions run on Node 24. The job still installs Node 22 for `npm ci`, `npm test`, and `npm run typecheck`.

## 2026-11-19T01:48:27Z

### Replay commands follow the active odds source

`npm run odds` prints `ODDS_SOURCE=` on a saved day when that source is not the active one. A value in `.env` no longer hides an older Odds API day, or a FanDuel day, when you copy the printed command. A replay miss names the source it searched. If that day was saved by the other source, the error names it and the override. A live save in the same process shows up in the saved-day list.

## 2026-11-19T01:14:14Z

### FanDuel team names and separate cache files

College names from FanDuel match the ESPN location, short name, and abbreviation, with the spaces kept. Sam Houston matches Bearkats. Paris St-G matches when ESPN lists that club more than once under the same name. A moneyline that posts only one side takes the other side from the event name, so Ole Miss, Mississippi State, and Alabama still match. Soccer `v` is home first. Totals stay Over and Under. A suspended runner is skipped, and a fractional American price is rounded. Team choice is not prompted. ESPN team lists use the same-day ESPN cache. A failed list keeps the FanDuel names.

FanDuel cache files are `fanduel-` plus the request hash. An Odds API file keeps the hash it already had. `npm run odds` prints `ODDS_SOURCE=fanduel` on a FanDuel day. A FanDuel cache hit does not say the run spent Odds API credits. The public sportsbook app id is no longer stored under a name the secret scan treats as a key.

## 2026-11-19T00:22:30Z

### FanDuel player props

`ODDS_SOURCE=fanduel` now fills the Props tab from FanDuel's event search, then prices those markets the same way the slate prices moneylines. Full-game lines map onto the markets the boards already ask for: football passing, rushing, receiving, and anytime touchdowns, NBA points, rebounds, assists, threes, blocks, and steals, NHL anytime goals, shots, and saves, and soccer anytime goals, shots, shots on target, and assists. Alternate and period lines are left out, so each player keeps the main over/under. A price batch that comes back short is requested again in smaller pieces. Soccer spreads and totals are the posted goal line closest to even, because the layout page does not carry those markets. A cache file with no source is an Odds API save and is not reused for FanDuel.

FanDuel does not post a two-way line for player kicking, hockey points, hockey assists, power-play points, or soccer cards, so those rows stay no line. MLB is still offseason and has no competition filter.

## 2026-11-18T19:30:35Z

### Pull request secret scan

`.github/workflows/secrets.yml` runs gitleaks on a pull request. It scans the commits in that pull request and fails the check when it finds a secret. The finding is redacted and the report is not uploaded. This repo is a personal account, so the action does not need a license. An organization account needs a `GITLEAKS_LICENSE` secret.

## 2026-11-18T19:25:54Z

### Offline CI and an odds quota log

`.github/workflows/check.yml` runs `npm ci`, `npm test`, and `npm run typecheck` on a pull request and on a push to `main`. It does not call The Odds API, TypeSafe, or Autojev.

Each odds response appends one JSON line to gitignored `runs/quota.jsonl`. The line is the Eastern time, the sport, the event id when the request is a prop, `cached` or `live`, and the credits remaining. A cache hit records `remaining` as null. The line has no URL and no key. `QUOTA_LOG=0` turns the log off. A write failure does not fail the slate.

## 2026-11-18T19:07:33Z

### Snapshot archive and a same-day ESPN cache

Replacing `snapshots/<day>-<model>.json` copies the previous file to `snapshots/archive/` first. The archive name is that day, model, and the previous `savedAt` with the colons removed, such as `2026-11-15-tail-jev-2026-11-18T150000Z.json`. Compare still reads the current name. An identical rewrite does not add another archive file. `npm run clear-snapshots` removes the archive with the rest of `snapshots/`.

Teams, schedules, rosters, and gamelogs from ESPN are reused for 18 hours when they were saved on the same Eastern day. Injuries are reused for 3 hours. A page from a previous Eastern day is a miss. A failed response is not stored. The scoreboard is still fetched on every run, because it chooses the slate window. The files are in gitignored `espn-cache/`. Only `site.api.espn.com` and `site.web.api.espn.com` are stored.

## 2026-11-18T18:57:13Z

### One start at a time, and a typed odds body

`npm start` takes `runs/slate.lock` for the whole run, including the screen, and removes it when the process finishes. A second start exits and names the process id that holds the lock. A lock whose process is gone is taken over. A lock file that has no process id is left in place, and the message says to remove `runs/slate.lock`.

`oddsGet` parses the Odds API body before the Games or Props board sees it. A slate is an array of events. A prop response is one event. Each event keeps `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. A different shape throws. The cache still stores the raw response. A missing bookmaker list is an empty list. A game with no bookmakers still counts as a game.

## 2026-11-18T18:48:45Z

### Empty odds files, scrubbed errors, and the book on the row

Family lookup skips an empty Odds API body when another save for that sport and markets is still inside `ODDS_CACHE_HOURS` and still has games. The empty file is used when it is the only fresh one. A hit on the exact request hash still returns that file, including an empty one. `odds=` still reads the saves from that Eastern day.

`main().catch` scrubs `apiKey=` the same way a league or sport failure does, and prints that message instead of the raw error.

Moneyline, spread, total, and prop comments name the book that posted the price. FanDuel, DraftKings, BetMGM, and Caesars use those names. Any other book uses its title, then its key. A missing spread or total says that no book posted it.

## 2026-11-18T18:05:00Z

### FanDuel odds source

`ODDS_SOURCE=fanduel` replaces The Odds API with FanDuel's internal sportsbook API. `odds/fanduel.ts` reads the content-managed-page layout and FanDuel's fixed-odds prices, then normalizes moneyline, spread, and total into the shape the boards already read. Slate requests use the Eastern window; team names resolve to ESPN display names at runtime. The Odds API key is no longer required in that mode and no credits are spent. The disk cache records which source filled it, so Odds API and FanDuel saves do not mix. Games work for NFL, NCAAF, NBA, NHL, and the six soccer leagues. Player props are not fetched yet, so the Props tab shows no line; `handoff.md` lists what is left.

## 2026-11-18T17:31:28Z

### Tail-jev stays in decisions/judge.ts

Removed the unused `slate/jev.ts` client. Nothing imported it, and `npm start` never called it. `model=tail-jev` still posts one `noul` or `choice` from `decisions/judge.ts` to `systemone` on `AUTOJEV_URL`, with `AUTOJEV_API_KEY` as the bearer token. There is no second endpoint and no address in the repo. `TAILNET-HANDOFF.md` now matches those commands. It no longer documents `--league`, `--games-only`, or a root `last-run.json`.

## 2026-11-18T02:17:08Z

### Pull request labels

`.github/workflows/label.yml` runs `actions/labeler` v7 on a pull request. `.github/labeler.yml` maps changed paths to labels: each sport, the shared sports files, and ui, odds, espn, decisions, slate, props, scripts, tests, docs, dependencies, tooling, and ci. A label is removed when the pull request no longer touches that path. The workflow reads the config from `main` and does not check out the pull request. `issues: write` lets the action create a label the first time it is needed.

## 2026-11-18T01:43:05Z

### FotMob on every soccer brief

Each soccer league now adds the FotMob table to the ESPN brief. The line is place, record, goal difference, expected goals per game, and the home or away split. Players FotMob still lists as unavailable at kickoff fill an empty ESPN injury line. Premier League is 47, Champions League 42, La Liga 87, Serie A 55, Bundesliga 54, and Ligue 1 53. There is no key. A miss leaves the ESPN brief. The previous match lineup is not used as a projected team. Player props still read the ESPN game log.

## 2026-11-18T01:28:19Z

### Ligue 1

Soccer now has Ligue 1 after Bundesliga. The Odds key is `soccer_france_ligue_one` and the ESPN competition is `fra.1`. Games and Props use the same window, 3-way moneyline, and prop markets as the other domestic leagues.

The sports list had the league active. ESPN matched every Odds club name, including Paris FC, Paris Saint Germain, RC Lens, Le Mans FC, and Rennes, with no new alias. US books posted moneylines, spreads, and totals for the scoreboard window. On the first match they posted anytime goal, shots, and shots on target. Assists and cards were not posted, so those rows stay No line.

## 2026-11-17T23:06:55Z

### A failed check keeps the slate

One Autojev timeout no longer replaces that league's Games tab with an error. The failed row is `No call`, the error is in the board note, and three failures in a row stop the rest of the calls. Props already kept their rows. They now keep the checks that succeeded too.

A favorite that clears 0.60 and loses the top-8 cut says so. The Decision cell includes the relevance. It is no longer described as a score under 0.60. A missing score is `No call`.

`npm start` checks `ODDS_API_KEY`, and `TYPESAFE_API_KEY` or the Autojev pair, before it walks a sport. An `odds=` replay does not need `ODDS_API_KEY`.

Live prop requests stop when the last Odds API credit header is under `ODDS_CREDIT_FLOOR`. The default is 30. Cached props are still read. `0` keeps fetching. Requests already in flight can finish, so the account can land a few credits under the floor.

ESPN requests time out after 10 seconds. The Odds API times out after 30 seconds. A failed team list, injury report, or schedule becomes "no recent games" and "no significant injuries listed" for that side. A failed scoreboard uses the same window as an empty scoreboard. Player roster and gamelog failures stay on that player.

`runs/last-run.json` is rewritten after each sport once any board has been built. The write is a temp file renamed into place. The snapshot is written when the run finishes, so a kill mid-run leaves the previous snapshot alone.

`npm test` runs `test/pure.test.ts` with `node:test`. It does not call The Odds API, TypeSafe, or Autojev.

## 2026-11-17T22:27:27Z

### Emoji columns keep their width

The screen pads and wraps by terminal columns. 🤝 and ❌ each take two columns, so a compare row stays inside the width and the later columns line up. Scrolling follows those rows again. The zero-width space in front of the cancel mark is gone.

## 2026-11-17T22:20:30Z

### Agree marks

A compare row now reads 🤝 Agreed or ❌ Disagreed. The count under the title uses the same marks. The cancel mark is two columns wide, and a zero-width space keeps that cell the same width as the box.

## 2026-11-17T22:16:08Z

### Compare rows say Agreed or Disagreed

The Games, Props, and ticket tables on a compare screen have an Agree column. Agreed means both slips are the same text, including when both say Pass. Disagreed means the slips differ, or one snapshot has no row. The count under the title uses that column.

## 2026-11-17T22:06:32Z

### Latest slate and npm entries leave the package root

`npm start` writes `runs/last-run.json`. `npm run view` reads that file. The npm entry files live in `scripts/`: `parlays.ts`, `view.ts`, `compare.ts`, `odds-days.ts`, and `clear-snapshots.ts`. `snapshots/` and `odds-cache/` stay at the package root. `npm run clear-snapshots` still deletes only `snapshots/`.

## 2026-11-17T22:02:42Z

### Clear saved decision snapshots

`npm run clear-snapshots` deletes every entry in `snapshots/` and leaves the folder. It does not call an API. `last-run.json` and `odds-cache/` stay in place. A symlink in that folder is removed without following it.

## 2026-11-17T21:51:12Z

### Model label beside the close button

The name just left of the x button now reads `Model: Jev` or `Model: Tail-Jev`. A compare screen reads `Model: Jev · Tail-Jev`. Two spaces sit between that label and the x button.

## 2026-11-17T21:48:58Z

### Model name beside the close button

The top header row shows the decision model just left of the x button. A slate shows `jev` or `tail-jev` from the save. A compare screen shows both names. A save with no `model` leaves that spot blank. The x button is still the last three columns, and a click on the name does not close the screen.

## 2026-11-17T00:03:32Z

### Autojev base URL and API key

`model=tail-jev` reads `AUTOJEV_URL` as the `/v1` base and posts one `noul` or `choice` to `systemone` on that base. The call sends `AUTOJEV_API_KEY` as a bearer token. A missing URL or key stops before the call. A rejected key stops with that name and does not print the token. A choice response can include a separate confidence. The 0.80 gate still reads the chosen option's probability. Relevance is still the yes probability. `model=jev` is unchanged.

## 2026-11-16T23:18:49Z

### Replay saved odds and compare decisions

`npm run odds` lists Eastern days that have saved Odds API responses and does not call the network. `npm start -- odds=YYYY-MM-DD` builds the slate from that day's saves, including games that have since kicked off. A miss throws and does not fetch. `--fresh` and a slate date cannot be combined with `odds=`. Each finished run still writes `last-run.json` and also `snapshots/<day>-<model>.json`. `npm run compare -- YYYY-MM-DD` opens the jev and tail-jev snapshots for that day and does not call the Odds API, ESPN, TypeSafe, or Autojev. `npm run view -- <day>-<model>` opens one snapshot.

## 2026-11-16T22:42:37Z

### Autojev address stays in .env

`model=tail-jev` reads the decide endpoint from `AUTOJEV_URL` in `.env`. The repo no longer has a default address. A run without that variable stops before the call and asks for it. `model=jev` is unchanged and still uses jev-recipes on TypeSafe.

## 2026-11-16T22:23:30Z

### Pick jev or tail-jev

`npm start` takes `model=jev` or `model=tail-jev`. `model=autojev` is the same as `model=tail-jev`. With no `model=`, the run still uses jev-recipes on TypeSafe. `model=tail-jev` sends each rerank and each verify claim to Autojev, one decision at a time. The 0.60 rerank gate and the 0.80 verify gate stay. Autojev returns a probability for the chosen option and no separate confidence, so that probability is what the 0.80 gate reads. Relevance is the yes probability. `AUTOJEV_URL` overrides the decide endpoint. `last-run.json` stores `model` as `jev` or `tail-jev`. The terminal prints `Decisions:` and that name before the slate.

## 2026-11-15T20:45:00Z

### Slate cache holds for the TTL

A saved Odds API slate is reused until `ODDS_CACHE_HOURS` even when `commenceTimeFrom` and `commenceTimeTo` change. The sport, markets, region, and odds format still have to match. The newest save inside that lifetime wins. `--fresh` and `ODDS_CACHE=0` still fetch. Player props stay keyed by event. A failed response is still not cached.

## 2026-11-15T20:31:21Z

### Hockey, Basketball, and Baseball

Hockey, Basketball, and Baseball are parent tabs after Soccer. Hockey’s child is the NHL (`icehockey_nhl`). Basketball’s is the NBA (`basketball_nba`). Baseball’s is MLB (`baseball_mlb`). Each league has Games and Props. A parent with one league still shows that league. When the sport row does not fit, the labels shorten to FB, Soc, Hockey, Bask, and Base.

Game lines and prop lines for these leagues go through `odds/cache.ts`, the same cache as football and soccer. With no date, the window is the ESPN scoreboard, from one hour before the first game still ahead to six hours after the last. A stale scoreboard uses one Eastern day. A date argument is still one Eastern day. Moneylines are 2-way. NHL spreads and totals are goals. NBA uses points. MLB uses runs, and slips use the ESPN short name so the Red Sox and the White Sox stay distinct.

NHL props are an anytime goal, points, shots on goal, assists, and one extra of goalie saves or power-play points. NBA props are points, rebounds, assists, threes, and one extra of blocks or steals. MLB props are hits, home runs, RBIs, pitcher strikeouts, and one extra of total bases or stolen bases. `norm` folds accents, so Montréal matches Montreal. Los Angeles Clippers matches ESPN’s LA Clippers.

## 2026-11-15T20:14:29Z

### Folders

`parlays.ts` and `view.ts` stay at the package root. The Games board and windows are `slate/`. Props are `props/`. ESPN evidence and players are `espn/`. The odds cache and book order are `odds/`, and saved responses stay in `odds-cache/` at the root. The screen is `ui/`. Football is `sports/football/` (NFL, NCAA, and the shared prop list). Soccer is `sports/soccer/`.

## 2026-11-15T20:07:35Z

### Football parent, with NFL and NCAA

The NFL parent tab is now Football. NFL and NCAA sit under it, and each has Games and Props. NCAA is `americanfootball_ncaaf` (FBS) and uses the same prop markets as the NFL. Slips use the ESPN short name. The no-date window is the ESPN college scoreboard, from one hour before the first kickoff to six hours after the last.

A save from before this change opens as Football, with the old NFL board under NFL. Its NCAA tab says to run `npm start`. The top-level fields of a new `last-run.json` stay the NFL board.

## 2026-11-15T19:57:45Z

### q closes the screen

`q` and `Q` leave the screen through the same restore path as the x button and Ctrl-C. The x button stays. The status line starts with `q quits`.

## 2026-11-15T19:52:50Z

### Sport modules

NFL and soccer now live under `sports/`, and `sports/index.ts` is the parent-tab list. A new sport is a file in that folder plus one line in the list.

`parlays.ts` walks that list, saves `last-run.json`, and opens the screen. `board.ts` builds one Games board. `props.ts` and `players.ts` take the markets and ESPN lookups from the sport. `books.ts` holds the book order. `window.ts` holds the Eastern day and the scoreboard fetch. `evidence.ts` exposes `createEvidence(base, style)`, with `NFL_EVIDENCE` and `SOCCER_EVIDENCE` as the two styles in use.

Gates, book order, the odds cache, and the saved-slate shape are the same. The first single-board sport is still copied onto the top of `last-run.json`, so an older reader still opens the NFL board.

A sport or league that throws becomes an error tab, and the run continues. `last-run.json` is left unchanged when every board throws.
