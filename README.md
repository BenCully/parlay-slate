# Parlays

Finds 2- and 3-leg moneyline parlays for the NFL, NCAA football, six soccer leagues, the NHL, the NBA, and MLB. Each league has a Games board and a Props board.

The script pulls the slate from [The Odds API](https://the-odds-api.com/liveapi/guides/v4/), keeps favorites the market already prices at 60% or better, and builds a short brief for each one from ESPN's public injury report and team schedule. A decision model then drops any pick that brief does not support. The default is [jev-recipes](https://github.com/agencyenterprise/jev-recipes) on TypeSafe. `model=tail-jev` uses Autojev on the tailnet instead. It prints the ten parlays with the highest combined implied hit rate.

No extra account is required for the briefs. ESPN's public site API is unauthenticated. `model=jev` uses the TypeSafe key. `model=tail-jev` uses the Autojev address and key in `.env`.

## Requirements

- Node.js 22.23.4 or newer (`jev-recipes` requires it).
- A [TypeSafe API key](https://console.typesafe.ai/settings/keys) (`TYPESAFE_API_KEY`) for `model=jev`, the default. Those `rerank` and `verify` calls send the pick text and evidence to TypeSafe and use quota. `model=tail-jev` does not call TypeSafe. It needs `AUTOJEV_URL` and `AUTOJEV_API_KEY` in `.env`.
- An [Odds API key](https://the-odds-api.com) (`ODDS_API_KEY`). The first run for a slate spends credits. Later runs reuse `odds-cache/` for the number of hours in `ODDS_CACHE_HOURS`. `npm start -- --fresh` fetches new prices.

## Setup

```bash
cd parlay-slate
npm install
cp .env.example .env
cp .env.settings.example .env.settings
```

Put the TypeSafe and Odds API keys in `.env`. For `model=tail-jev`, also put the Autojev `/v1` base in `AUTOJEV_URL` and its bearer token in `AUTOJEV_API_KEY`. That file is gitignored. Cache settings go in `.env.settings`, which is also gitignored. `ODDS_CACHE_HOURS` is how long a saved response lasts. `ODDS_CACHE=0` ignores the cache. `ODDS_CACHE_DIR` changes the folder. `ODDS_CREDIT_FLOOR` stops live prop requests when the last credit header is under that number. The default is 30. Cached props are still read. `0` keeps fetching. A name in `.env` overrides the same name in `.env.settings`.

## Run

```bash
# Current slate: this week's NFL and NCAA, plus each other league's scoreboard window. The model is jev.
npm start
# One America/New_York day for every league. The model is jev.
npm start -- 2026-11-15
# That Eastern day, ranked with TypeSafe through jev-recipes.
npm start -- 2026-11-15 model=jev
# That Eastern day, ranked with Autojev on the tailnet.
npm start -- 2026-11-15 model=tail-jev
# Replay prices saved that Eastern day through TypeSafe. Does not call the Odds API.
npm start -- odds=2026-11-15 model=jev
# Replay prices saved that Eastern day through Autojev. Does not call the Odds API.
npm start -- odds=2026-11-15 model=tail-jev
# Ignore odds-cache and fetch new prices. This spends Odds API credits.
npm start -- --fresh
# List the Eastern days stored in odds-cache. Does not call the network.
npm run odds
# Open the jev and tail-jev snapshots for that day side by side. Does not call any API.
npm run compare -- 2026-11-15
# Delete every file in snapshots/. Leaves runs/ and odds-cache/.
npm run clear-snapshots
# Reopen runs/last-run.json. Does not call the Odds API, ESPN, or a decision model.
npm run view
# Open snapshots/2026-11-15-jev.json. Prices and decisions stay as they were on that run.
npm run view -- 2026-11-15-jev
```

`model=jev` asks TypeSafe, through jev-recipes, which briefs to keep. That is also what runs when `model=` is left off. `model=tail-jev` asks Autojev on the tailnet. `model=autojev` is the same choice. Both keep the 0.60 rerank gate and the 0.80 verify gate. Autojev answers one question per call. A choice response can include a separate confidence. The 0.80 gate reads the chosen option's probability, not that field. Relevance is the yes probability. `AUTOJEV_URL` in `.env` is the `/v1` base, and `AUTOJEV_API_KEY` is the bearer token. The repo does not keep a default address or key.

`odds=2026-11-15` replays prices saved that America/New_York day. `npm run odds` lists the days in `odds-cache/` and does not call the network. The replay still works after `ODDS_CACHE_HOURS`, keeps games that have since kicked off, and does not spend an Odds API credit. If that day has no save, the run stops instead of fetching. Do not combine `odds=` with a slate date or with `--fresh`. ESPN evidence and the decision model still run, so a replay can test `jev` against `tail-jev` on the same saved prices.

`npm start` looks up the slate, writes `runs/last-run.json` and a snapshot, then opens the screen. Odds API responses are saved in gitignored `odds-cache/` and reused for `ODDS_CACHE_HOURS` (168 by default, which is 7 days). A later run does not refetch a sport while that save is inside the lifetime, even if the kickoff window moved. A cached board says when those prices were saved. Game lines and player props both go through that cache. `npm start -- --fresh` ignores that cache and spends credits. `npm run view` opens that file again and does not call the Odds API, ESPN, or TypeSafe. The top row is Football, Soccer, Hockey, Basketball, and Baseball. The model sits just left of the x button, with a gap before it, as `Model: Jev`, `Model: Tail-Jev`, or both names on a compare screen. Football has NFL and NCAA. Soccer has Premier League, Champions League, La Liga, Serie A, Bundesliga, and Ligue 1. Hockey has NHL, Basketball has NBA, and Baseball has MLB. Every league has Games and Props. Click a tab, or press Tab, Left, Right, or 1 and 2 for Games and Props. `[` and `]` change sport. `,` and `.` change league when that sport has more than one. Resize refits the table. The scroll wheel moves the bar on the right. `q` and the x button in the top-right corner close the screen. The background is black.

With no arguments, the NFL and NCAA use the current ESPN week and skip games that have already kicked off. Each soccer league uses the games on its ESPN scoreboard and the following four days, so the rest of that matchweek is included. The NHL, NBA, and MLB use the games on that league's ESPN scoreboard, from one hour before the first to six hours after the last. A scoreboard with nothing still ahead uses one Eastern day. A `YYYY-MM-DD` argument is one America/New_York calendar day for every league, so Sunday night is included and Monday night is not.

Soccer moneylines include the draw. The draw is not a leg. A team still has to be priced at 60% or better. Spreads and totals are goals. The brief adds the FotMob league table, the home or away place, expected goals per game, and players FotMob still lists as unavailable at kickoff. A FotMob miss leaves the ESPN brief. The props are an anytime goal, shots, shots on target, assists, and a card, read from the ESPN game log. US books do not post player props for the Champions League, so that props tab says so and does not request them.

NHL, NBA, and MLB moneylines are two-way. The NHL moneyline includes overtime. A team still has to be priced at 60% or better. NHL spreads and totals are goals. NBA spreads and totals are points. MLB spreads and totals are runs. NHL props are an anytime goal, points, shots on goal, assists, and one extra of goalie saves or power-play points. NBA props are points, rebounds, assists, threes, and one extra of blocks or steals. MLB props are hits, home runs, RBIs, pitcher strikeouts, and one extra of total bases or stolen bases. MLB slips use the ESPN short name, so the Red Sox and the White Sox stay distinct.

## Where a sport lives

`sports/index.ts` is the parent-tab list, in screen order. Football is `sports/football/`, with NFL and NCAA under it. Soccer is `sports/soccer/`. Hockey, Basketball, and Baseball are `sports/hockey/`, `sports/basketball/`, and `sports/baseball/`, with NHL, NBA, and MLB under them. Shared code sits in `slate/`, `props/`, `espn/`, `odds/`, and `ui/`. A new sport is a folder there plus one line in the list. The Odds API cache in `odds/cache.ts` covers every sport, including game lines and player props.

## Saved slate

`npm start` overwrites `parlay-slate/runs/last-run.json` after the lookups finish, then prints `Saved` and the file path. It also writes `snapshots/<day>-<model>.json`. The day is the `odds=` day, the slate date, or today's Eastern date. The next run of that same day and model replaces that snapshot. Both files are gitignored.

`npm run compare -- 2026-11-15` opens `snapshots/2026-11-15-jev.json` beside `snapshots/2026-11-15-tail-jev.json`. Decision and Slip columns sit on one row. The Agree column reads 🤝 Agreed when both slips match, including when both say Pass, and ❌ Disagreed when the slips differ or one side has no row. It does not call the Odds API, ESPN, TypeSafe, or Autojev. A missing file prints the `npm start` command that writes it. `npm run clear-snapshots` deletes the files in `snapshots/` and leaves that folder, `runs/`, and `odds-cache/` in place.

The file is the finished screen, not the raw API responses. Each table cell is already decided. It stores:

- `savedAt`, the UTC time of that run.
- `model`, `jev` or `tail-jev`, which decision model produced the cells. Older files omit it.
- `oddsDay`, the Eastern day whose saved odds were replayed. A live run omits it.
- `title`, the week or Eastern day and how many favorites qualified.
- `groups`, the Games rows: each favorite, its spread, and its over/under.
- `note`, when there is no parlay or no qualifying favorite.
- `ticketGroups`, the moneyline tickets, only when at least two wins cleared 0.80.
- `props`, the Props tab: its title, one group of rows per team, and the note under that table.

`npm run view` reads `runs/last-run.json` and draws it with the same screen. `npm run view -- 2026-11-15-jev` opens that snapshot. Prices and decisions stay as they were on that run. If the file is missing, the command says so and exits. Run `npm start` when you want a new slate.

The same command without npm is:

```bash
node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx scripts/parlays.ts
node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx scripts/parlays.ts 2026-11-15
```

## What it prints

The screen opens after the lookups, on Football, then NFL, then Games. Every league has a Games page and a Props page. A Games page starts with a title such as `NFL 2026-11-15 (Eastern): 4 upcoming games with a favorite at 60% or better.` When those prices came from `odds-cache/`, a note under the table says when they were saved.

The Games columns are Team, Price, Market, Decision, Slip, and Comment. Each favorite is three rows inside one border. The moneyline names the team. Price is the American odds and Market is the implied win probability. Decision is `Ready 0.82` when verify confidence clears 0.80, `Review 0.70` when the brief was checked and the confidence is under 0.80, or `Dropped` when rerank scored the brief under 0.60. Slip is `Take Rams -510` when verify supports the win, and `Pass` when it does not. A supported win under 0.80 still shows Take, and the comment says that leg was left out of the tickets. NCAA, soccer, and MLB slips use the ESPN short name, so a slip can read `Take Man City -180` or `Take Red Sox -150`. The comment gives the record, rest, venue, the top injury on each side, and the gate.

The next row is the spread. Price is the point and Market is the juice. Decision is `Ready`, `Review`, or `Pass`, with the confidence. Slip is `Take Rams -9.5` when the brief supports the number, and `Take Cardinals +9.5` when the brief cuts against it. Anything else is `Pass`. A missing spread shows `n/a`, `No line`, and `Pass`. The third row is Over or Under, whichever side the evidence supports more. Slip is `Take the over 38.5` or `Take the under 40.5` when verify supports that side, and `Pass` otherwise. The number is points in football and the NBA, goals in soccer and the NHL, and runs in MLB. Spreads and totals stay on this page. Tickets are moneylines.

```text
┌──────────────────┬───────┬────────┬─────────────┬────────────────┬───────────────────────────────────────────────────┐
│ Team             │ Price │ Market │ Decision    │ Slip           │ Comment                                           │
├──────────────────┼───────┼────────┼─────────────┼────────────────┼───────────────────────────────────────────────────┤
│ Los Angeles Rams │  -510 │  83.6% │ Review 0.50 │ Take Rams -510 │ 5-4, on 7 days rest, at the Cardinals (3-6, on 7  │
│                  │       │        │             │                │ days rest). Injuries: Rams, Joe Cardona (LS) out  │
│                  │       │        │             │                │ (Ankle); Cardinals, Gardner Minshew II (QB) IR    │
│                  │       │        │             │                │ (Right Elbow). Verify leans toward the win at     │
│                  │       │        │             │                │ 0.50, short of 0.80. Left out.                    │
│   Spread         │  -9.5 │   -115 │ Pass 0.94   │ Pass           │ Rams -9.5 (-115). Last 5 margin: Rams +6.2 per    │
│                  │       │        │             │                │ game over the last 5; Cardinals -9.4 per game     │
│                  │       │        │             │                │ over the last 5. Verify says the brief does not   │
│                  │       │        │             │                │ establish the cover at 0.94.                      │
│   Over           │  38.5 │   -110 │ Pass 0.97   │ Pass           │ Over 38.5 (-110). Rams last 5: 25.8 scored and    │
│                  │       │        │             │                │ 19.6 allowed. Cardinals last 5: 18.2 scored and   │
│                  │       │        │             │                │ 27.6 allowed. The over is the stronger side (0.01 │
│                  │       │        │             │                │ vs 0.00). Verify says the brief does not          │
│                  │       │        │             │                │ establish the over at 0.97.                       │
└──────────────────┴───────┴────────┴─────────────┴────────────────┴───────────────────────────────────────────────────┘
```

When at least two moneylines are supported at 0.80 or better, a second table lists the tickets. Its columns are Hit, Payout, Ticket, and Comment. Hit is the product of the moneyline implied probabilities. Payout is the decimal-odds product. Prices come from FanDuel, then DraftKings, then BetMGM, then Caesars, then the first book that posted the market. A ticket reads `Rams -510 + Bills -180`. Legs never share a game. The table keeps 2-leg and 3-leg parlays, the top 10 by hit rate. The comment names the teams that cleared 0.80 and says the hit rate multiplies their market prices. Fewer than two cleared legs prints `No parlay. A ticket needs two legs the brief supports at 0.80 or better.` No favorite at 60% prints `No qualifying legs.`

The Props page is its own table: Team, Player, Line, Decision, Slip, and Comment. Each team still to play is one group. Decision is `Ready 0.82`, `Review 0.70`, or `Pass 0.61`. A missing market is `No line` and `Pass`. A check that did not come back is `No call`. Slip is filled in only when that player's ESPN game log supports the side. Those rows stay off the tickets.

Football, for the NFL and NCAA, shows an anytime touchdown, passing yards, receiving yards, rushing yards, and one extra short-priced stat. The extra comes from receptions, passing touchdowns, completions, rush attempts, kicking points, and field goals. It stays on a player already in that group, or the kicker, and it skips a tiny under such as a backup under 1.5 receptions. A supported slip reads `Take Allen anytime TD -135` or `Take Allen over 245.5 pass yds`.

Soccer shows an anytime goal, shots, shots on target, assists, and a card. A line posted on only one side is shown. A missing market reads `No line`. A supported slip reads `Take Haaland anytime goal -125` or `Take Haaland card +150`. The Champions League page says US books do not post player props for that competition, and it does not request them.

The NHL shows an anytime goal, points, shots on goal, assists, and one extra of goalie saves or power-play points. The NBA shows points, rebounds, assists, threes, and one extra of blocks or steals. MLB shows hits, home runs, RBIs, pitcher strikeouts, and one extra of total bases or stolen bases. Player props use the same Odds API key, on the per-game endpoint. Each returned market costs one credit. The player log is ESPN's public athlete gamelog.

A window too narrow for the headers stacks each row: the name, then the other fields, then the comment. The status line reads `q quits · wheel scrolls · tab games · [ ] sport · , . league`, and it drops a hint when that row has only one choice.

Before the screen, the terminal prints each league name, the board title, `Checking N of M claims...` while verify runs, `Odds cache hit` when prices were reused, the Odds API credits remaining after a live fetch, and `Saved` plus the path of `runs/last-run.json`. A shell that is not a terminal prints every sport, league, and page as text, then exits. A league that throws shows the error on that league's Games and Props pages, and the other leagues still print.

## How a leg gets in

1. Upcoming moneylines (`h2h`, US books, American odds) in that league's week or Eastern day.
2. Implied probability at least 0.60. A -150 favorite is about 60%. Closer favorites, such as -148, stay off the list.
3. `rerank` keeps up to 8 legs with relevance at least 0.60. The NFL asks which NFL team is very likely to win. NCAA asks the same about a college team. Soccer asks which team is very likely to win the match. The NHL, NBA, and MLB ask which team in that league is very likely to win the game. `model=tail-jev` scores each brief on its own and keeps the same cutoff.
4. `verify` keeps a leg only when the brief supports the pick with confidence at least 0.80. On Autojev that confidence is the probability of the chosen verdict.

## Where the brief comes from

`getEvidence` in `espn/evidence.ts` reads ESPN once per run:

- Season record and last five regular-season or playoff results, from each team's schedule.
- Days of rest, including a bye when the gap is 12 days or more.
- The injury report. Active players are skipped. Quarterbacks sort first, then Out, Doubtful, injured reserve, and Questionable. The brief keeps six listings per team, and includes the short report note for Out, injured-reserve, and quarterback listings.

Both models judge only that text. They do not look up the game themselves. If ESPN does not answer for a team, that side of the brief says there are no recent games and no significant injuries listed. The league still gets a board.

## Typecheck

```bash
npm test
npm run typecheck
```

`npm test` runs `node:test` through `tsx`. Those tests do not call The Odds API, ESPN, TypeSafe, or Autojev. `npm run typecheck` checks the TypeScript in this directory and does not emit JavaScript. The run command executes the TypeScript files directly with `tsx`.
