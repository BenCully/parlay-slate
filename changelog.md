# Changelog

Newest entries go at the top. Each heading is `YYYY-MM-DDTHH:MM:SSZ`.

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
