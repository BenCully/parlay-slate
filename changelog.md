# Changelog

Newest entries go at the top. Each heading is `YYYY-MM-DDTHH:MM:SSZ`.

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
