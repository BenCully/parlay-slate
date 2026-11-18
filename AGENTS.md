# Parlays

Parlay finder for football, soccer, hockey, basketball, and baseball. Football is NFL and NCAA. Soccer is six leagues. Hockey is the NHL. Basketball is the NBA. Baseball is MLB. Private ESM package in this directory. Node `>=22.23.4`. Keys live in gitignored `.env`: `TYPESAFE_API_KEY`, `ODDS_API_KEY`, and, for `model=tail-jev`, `AUTOJEV_URL` and `AUTOJEV_API_KEY`. `npm start` checks those keys before it walks a sport. An `odds=` replay does not need `ODDS_API_KEY`. Cache settings are in gitignored `.env.settings` (`ODDS_CACHE_HOURS`, `ODDS_CACHE`, `ODDS_CACHE_DIR`, `ODDS_CREDIT_FLOOR`). See `.env.settings.example`. `ODDS_CREDIT_FLOOR` stops live prop requests once the last credit header is under that number. The default is 30. Cached props are still read. `0` keeps fetching. `.env` is loaded after `.env.settings`, so a duplicate name in `.env` wins. The shell wins over both files.

## Commands

```bash
npm start                  # current ESPN week, skip games that already kicked off
npm start -- YYYY-MM-DD   # one America/New_York calendar day
npm start -- YYYY-MM-DD model=jev       # TypeSafe through jev-recipes (also the default)
npm start -- YYYY-MM-DD model=tail-jev  # Autojev on the tailnet; model=autojev is the same
npm start -- odds=YYYY-MM-DD model=jev  # replay odds saved that Eastern day; no Odds API call
npm start -- --fresh      # ignore the odds cache and spend credits
npm run odds               # list saved odds days, no API calls
npm run compare -- YYYY-MM-DD  # jev beside tail-jev for that day, no API calls
npm run clear-snapshots    # delete snapshots/, leave runs/ and odds-cache/
npm run view               # replay runs/last-run.json, no API calls
npm run view -- YYYY-MM-DD-jev  # open one snapshot
npm test                   # node:test, no network
npm run typecheck          # tsc --noEmit
```

`model=` can sit before or after the date. `odds=` is the America/New_York day the prices were saved, not the kickoff day. `npm run odds` lists those days. A replay reads `odds-cache/` even after `ODDS_CACHE_HOURS`, keeps games that have since kicked off, and throws instead of fetching when that day has no save. Do not combine `odds=` with a slate date or with `--fresh`. `model=tail-jev` does not call TypeSafe. `AUTOJEV_URL` in `.env` is the `/v1` base. The client posts one `noul` or `choice` to `systemone` on that base and sends `AUTOJEV_API_KEY` as a bearer token. Do not put that address in the repo, and do not print it or a key. A choice response can include a separate confidence. The 0.80 gate reads the chosen option's probability, not that field. Relevance is the yes probability. Do not lower either gate.

`npm start` rewrites `runs/last-run.json` after each sport once a board exists, writes `snapshots/<day>-<model>.json` when the run finishes, then opens the screen. The snapshot day is `odds=`, or the slate date, or today's Eastern date. A later run of the same day and model copies the previous file to `snapshots/archive/<day>-<model>-<savedAt>.json`, then replaces `snapshots/<day>-<model>.json`. Compare still reads that current name. An identical rewrite does not add another archive file. `npm run compare` reads the jev and tail-jev snapshots and does not call the Odds API, ESPN, TypeSafe, or Autojev. `npm run clear-snapshots` deletes every entry in `snapshots/`, including `snapshots/archive/`, and leaves the folder. It does not touch `runs/` or `odds-cache/`. A non-TTY prints every sport, league, and page as text and exits. That is expected in an agent shell. Do not treat that as a mouse test.

Run and Debug configs are in `.vscode/launch.json`: Start slate, Start slate for an Eastern day, Replay saved odds, Compare decision snapshots, and View saved slate. They launch `node` with `--import tsx`, same as the npm scripts. Keep `console` set to `integratedTerminal`. The Debug Console is not a TTY, so the screen, mouse, and x button will not work there. `.npmrc` sets `engine-strict=true`.

## Files

`scripts/` holds the npm entry files. Saved output stays outside that folder.

- `scripts/parlays.ts` walks `sports/index.ts`. Once any board has been built, it rewrites `runs/last-run.json` after each sport, by writing a temp file and renaming it. `runs/slate.lock` holds the process id for the whole run, including the screen. A second `npm start` exits and names that pid. A lock whose process is gone is taken over. The lock is removed when the process finishes. The snapshot is written when the run finishes, so a kill mid-run keeps the finished sports and leaves the previous snapshot in place. It then opens the screen. A failed decision call leaves that row as `No call` and keeps the board. The error is in the board note. Tail-jev stops after three failures in a row. ESPN reads time out after 10 seconds. A failed team, injury, or schedule read becomes "no recent games" and "no significant injuries listed". A failed scoreboard uses the empty-board window. The Odds API times out after 30 seconds. `scripts/view.ts` reads `runs/last-run.json`, or `snapshots/<name>.json` when given a name. `scripts/compare.ts` reads the jev and tail-jev snapshots for one day. `scripts/clear-snapshots.ts` empties `snapshots/`. `scripts/odds-days.ts` lists saved odds days. None of those four call an API. `runs/last-run.json` is the latest slate.
- `slate/board.ts` builds one Games board: moneylines, spreads, totals, and moneyline tickets. `slate/window.ts` is the Eastern day and the scoreboard fetch.
- `decisions/judge.ts` is `model=jev` or `model=tail-jev`. It parses those args and runs rerank and verify.
- `props/board.ts` builds a Props tab from a `PropProfile`.
- `espn/evidence.ts` is `createEvidence(base, style)`. `NFL_EVIDENCE`, `NCAA_EVIDENCE`, `SOCCER_EVIDENCE`, `HOCKEY_EVIDENCE`, `BASKETBALL_EVIDENCE`, and `BASEBALL_EVIDENCE` are the styles in use. Copy the closer one for a new sport and change the fields that differ. Do not add a sport branch in the middle of the client. `espn/players.ts` is `createPlayers` for one competition. `espn/cache.ts` stores successful ESPN JSON in gitignored `espn-cache/`. Teams, schedules, rosters, and gamelogs are reused for 18 hours on the same Eastern day. Injuries are reused for 3 hours. A page from a previous Eastern day is a miss. Failures are not stored. The scoreboard is fetched on every run. Only `site.api.espn.com` and `site.web.api.espn.com` are stored.
- `odds/cache.ts` stores successful Odds API responses in gitignored `odds-cache/` at the package root. The cache key is the path and query with `apiKey` removed. A slate for the same sport and markets is reused until `ODDS_CACHE_HOURS` even when `commenceTimeFrom` and `commenceTimeTo` move. An empty slate does not win that lookup while another fresh file for the same sport and markets still has games. The empty file is used when it is the only fresh one. A hit on the exact request hash still returns that file. `oddsGet` parses the body before it returns. A slate is an array of events. A prop response is one event. Each event has `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. A different shape throws. The cache still stores the raw response. The lifetime is 168 hours if unset. `--fresh` or `ODDS_CACHE=0` fetches again. `odds=YYYY-MM-DD` reads saves from that Eastern day after the lifetime and does not fetch. Do not log or store the key. Each odds response also appends one JSON line to gitignored `runs/quota.jsonl`: Eastern time, sport, event id for a prop, `cached` or `live`, and credits remaining. The line has no URL and no key. `QUOTA_LOG=0` turns that log off. `odds/books.ts` is the book order.
- `ui/screen.ts` turns a `SavedSlate` into tabs. `ui/table.ts` is the live screen: layout, scroll, mouse, tabs, black background.

A parent tab is a folder under `sports/`:

- `sports/index.ts` is the list. Append a sport there. Screen order is that list. `sports/types.ts` is `Sport` and `BoardSource`.
- `sports/football/` is the Football parent. `nfl.ts` and `ncaa.ts` are its children, each with Games and Props. `props.ts` is the shared football prop list. NCAA is `americanfootball_ncaaf` (FBS), not the FCS key.
- `sports/soccer/` is six leagues, each with Games and Props. `fotmob.ts` adds the league table, expected goals, and unavailable players to the ESPN brief.
- `sports/hockey/` is the NHL (`icehockey_nhl`). `sports/basketball/` is the NBA (`basketball_nba`). `sports/baseball/` is MLB (`baseball_mlb`). Each is one league with Games and Props. A parent with one league still shows that league tab.

Imports are NodeNext. Local imports use a `.js` suffix. `verbatimModuleSyntax` is on. `tsconfig.json` includes every `.ts` file outside `node_modules`.

## Adding a sport

Add `sports/<name>.ts` that exports a `Sport`, then append it in `sports/index.ts`.

- `kind: 'board'` is one parent tab with Games and Props. Use it for a single Odds API sport key.
- `kind: 'leagues'` is a parent tab whose children are leagues. Each league has its own odds key, window, brief, and props.
- `BoardSource.profile` is the prop markets. `null` shows `propsNote` and makes no prop request.
- `shortNames` uses the ESPN short name in slips. Leave it false when the last word of the team name is already unique.
- A dated run is one Eastern day for every sport. Build that with `easternRange`. The no-date window belongs in the sport file.
- A thrown board becomes an error tab and the run continues with the next sport or league. `runs/last-run.json` is left unchanged when every board throws.
- The NFL league is copied to the top-level fields of `runs/last-run.json` so an old reader still opens. If there is no NFL league, the first board is copied.

## Do not change these rules unless asked

- Football is the parent of NFL (`americanfootball_nfl`) and NCAA (`americanfootball_ncaaf`). Soccer is Premier League (`soccer_epl`), Champions League (`soccer_uefa_champs_league`), La Liga (`soccer_spain_la_liga`), Serie A (`soccer_italy_serie_a`), Bundesliga (`soccer_germany_bundesliga`), and Ligue 1 (`soccer_france_ligue_one`, ESPN `fra.1`). Hockey is the NHL (`icehockey_nhl`). Basketball is the NBA (`basketball_nba`). Baseball is MLB (`baseball_mlb`). Book order is FanDuel, DraftKings, BetMGM, Caesars (`williamhill_us`), then the first book that posted the market. The Games and Props comments name that book.
- NCAA uses the same prop markets as the NFL. Slips use the ESPN short name, so Tigers and Bulldogs stay distinct. The no-date window is the ESPN college scoreboard, from one hour before the first kickoff to six hours after the last. A date argument is still one Eastern day.
- Soccer moneylines are 3-way. Skip Draw and Tie. The 0.60 favorite gate stays. Spread and total copy says goals. A date argument is still one Eastern day for every sport. With no date, each soccer league uses its ESPN scoreboard, then four days past the last listed kickoff so the rest of that matchweek is included. Each brief also asks FotMob for that league's table, home or away place, expected goals per game, and players still unavailable at kickoff. FotMob ids are 47, 42, 87, 55, 54, and 53. There is no key. A miss leaves the ESPN brief. The previous match lineup is not used as a projected team. Player props still use the ESPN game log.
- Soccer props are anytime goal, shots, shots on target, assists, and one card. US books do not post player props for the Champions League, so that props tab is a note and makes no prop request.
- NHL props are anytime goal, points, shots on goal, assists, and one extra of goalie saves or power-play points. The puck line and the total are goals. NBA props are points, rebounds, assists, threes, and one extra of blocks or steals. MLB props are hits, home runs, RBIs, pitcher strikeouts, and one extra of total bases or stolen bases. The run line and the total are runs. Slips use the ESPN short name so Red Sox and White Sox stay distinct. Moneylines are 2-way, including overtime for the NHL. With no date, each of these uses the ESPN scoreboard, from one hour before the first listed game to six hours after the last. A scoreboard with nothing still ahead uses one Eastern day. A date argument is still one Eastern day.
- Odds API spells the Canadiens as Montréal. ESPN does not. `norm` folds accents before it matches. Odds API says Los Angeles Clippers. ESPN says LA Clippers. That alias lives with the other name aliases.
- A moneyline favorite needs implied probability `>= 0.60`. `rerank` uses `minRelevance: 0.6` and `topK: 8`. A favorite that clears 0.60 and misses the top 8 says so, and the Decision cell includes the relevance. A missing score or a missing verify result is `No call`, not a failed gate. The NFL query is "which NFL team is very likely to win". NCAA asks which college football team is very likely to win. Soccer asks which team is very likely to win this match. NHL, NBA, and MLB ask which team in that league is very likely to win this game. `verify` uses `minConfidence: 0.8`. `model=jev` and `model=tail-jev` both use those numbers.
- Do not lower a gate to force a ticket. Spread, total, and prop rows are decisions, not parlay legs. Tickets are 2- and 3-leg moneylines, one leg per game, top 10 by the product of the market implied probabilities.
- Slip text is `Take ...` only when verify verdict is `supported`. A contradicted spread flips to the opponent's opposite number. Anything else is `Pass`.
- `verify` rejects an empty `claims` array and rejects more than 100 claims. Chunk at 50. Claim ids must be unique. Run the game check before the prop check so the two calls do not overlap.
- Odds API timestamps are `YYYY-MM-DDTHH:MM:SSZ` with no milliseconds (`oddsStamp`). A date argument is Eastern midnight to the next Eastern midnight, so Sunday night is in and Monday night is out.
- Props are one request per game on `/events/{id}/odds`. Cost is one credit per market returned. Ask before adding markets. Do not add a paid source or a new key. ESPN's public site API is the free evidence source. Repeat runs must use `odds/cache.ts` instead of calling The Odds API again.
- If a book did not post a star, show the best line that was posted for that team. Do not invent a player. The extra prop stays on a player already in that team's block, or the kicker, and it skips a tiny under such as a backup under 1.5 receptions.
- Anytime-touchdown evidence is rushing plus receiving touchdowns. Passing touchdowns are not scores for the passer. Drop healthy scratches (`Out` plus coach's decision, rest, or not injury related).

## Screen

`presentScreen` owns the alt screen. Keep every rendered line at or under the content width (`columns - 1`). A wider line soft-wraps and breaks the box. Narrow terminals use the stacked layout.

The background stays black. The top row is the sport (Football, Soccer, Hockey, Basketball, Baseball), the model name, and the x button. The label is `Model: Jev` or `Model: Tail-Jev`, from the `model` on the save, with a gap before the x. A compare screen shows both names. A save with no `model` leaves that spot blank. Clicking the name does not close the screen. When that row does not fit, the labels shorten to FB, Soc, Hockey, Bask, and Base. Football then shows NFL and NCAA, and each of those shows Games and Props. Soccer shows the league row, then Games and Props. Hockey shows NHL, Basketball shows NBA, and Baseball shows MLB, and each of those shows Games and Props. A parent with one league still shows that league. Tab, Shift-Tab, Left, Right, 1, and 2 move Games and Props. `[` and `]` move the sport. `,` and `.` move the league when that row has more than one league. The wheel scrolls three lines. A click or drag on the bar jumps. `q` and the x button close the screen. Ctrl-C still restores the terminal. Parse stdin as a `Buffer`. Do not set stdin to utf8, or mouse bytes get corrupted. On exit, reset color and turn mouse tracking off.

`SavedSlate` in `screen.ts` is the `runs/last-run.json` contract. `sports` holds Football (NFL and NCAA) plus the soccer leagues. An old file with a direct NFL board opens as Football, with that board under NFL, and an NCAA tab that says to run `npm start`. A file with no `sports` does the same from its top-level NFL board. The Games page stays first under each league.

## Secrets and git

Never print `.env`, a key, or a request URL that contains a key. Odds failures should report status and the API message only.

`origin` is `gh:BenCully/parlay-slate.git` (https://github.com/BenCully/parlay-slate) and `main` tracks `origin/main`. Pull requests get labels from `.github/labeler.yml` through `.github/workflows/label.yml`. That workflow reads the config from `main` and does not check out the pull request. Do not commit or push unless asked. `runs/`, `snapshots/`, `odds-cache/`, `espn-cache/`, `.env`, and `.env.settings` stay gitignored. A root `last-run.json` stays ignored too. `.env.example` and `.env.settings.example` stay in git.

## Changelog

`changelog.md` is the log of changes that have landed. After you implement a change, add an entry at the top. The heading is the UTC time the change landed, `YYYY-MM-DDTHH:MM:SSZ`, with no milliseconds.

- Say what changed and anything a later session needs, including a behavior change.
- Keep one entry per change. A docs-only tweak, a typecheck, or a comment edit does not get its own entry.
- Keep secrets, keys, and request URLs out of the log.
- The `2026-11-15T19:52:50Z` sport-module entry is the first one. Later work goes above it.

## Checks

Run `npm test` and `npm run typecheck` after a code change. `.github/workflows/check.yml` runs those two after `npm ci` on a pull request and on a push to `main`. That workflow does not call The Odds API, TypeSafe, or Autojev. `.github/workflows/secrets.yml` runs gitleaks on a pull request and scans the commits in that pull request. A finding fails the check. The report is redacted and is not uploaded. This repo is a personal account, so the action does not need a license. An organization account needs a `GITLEAKS_LICENSE` secret. For a layout change, render at a few widths and confirm no line is longer than the width. Use `npm run view` for a screen change. Run `npm start` only when the saved slate itself must change. Update `changelog.md` in the same turn as the change.
