# Parlays

Finds 2- and 3-leg NFL moneyline parlays, and shows the same Games and Props boards for five soccer leagues.

The script pulls the slate from [The Odds API](https://the-odds-api.com/liveapi/guides/v4/), keeps favorites the market already prices at 60% or better, and builds a short brief for each one from ESPN's public injury report and team schedule. [jev-recipes](https://github.com/agencyenterprise/jev-recipes) then drops any pick that brief does not support. It prints the ten parlays with the highest combined implied hit rate.

No extra account is required for the briefs. ESPN's public site API is unauthenticated. The only keys are the two already in `.env`.

## Requirements

- Node.js 22.23.4 or newer (`jev-recipes` requires it).
- A [TypeSafe API key](https://console.typesafe.ai/settings/keys) (`TYPESAFE_API_KEY`). Live `rerank` and `verify` calls send the pick text and evidence to TypeSafe and use quota.
- An [Odds API key](https://the-odds-api.com) (`ODDS_API_KEY`). The first run for a slate spends credits. Later runs reuse `odds-cache/` for the number of hours in `ODDS_CACHE_HOURS`. `npm start -- --fresh` fetches new prices.

## Setup

```bash
cd parlays
npm install
cp .env.example .env
cp .env.settings.example .env.settings
```

Put both keys in `.env`. That file is gitignored. Cache settings go in `.env.settings`, which is also gitignored. `ODDS_CACHE_HOURS` is how long a saved response lasts. `ODDS_CACHE=0` ignores the cache. `ODDS_CACHE_DIR` changes the folder. A name in `.env` overrides the same name in `.env.settings`.

## Run

```bash
npm start
npm start -- 2026-11-15
npm start -- --fresh
npm run view
```

`npm start` looks up the slate, writes `last-run.json`, then opens the screen. Odds API responses are saved in gitignored `odds-cache/` and reused for `ODDS_CACHE_HOURS` (168 by default, which is 7 days). A cached board says when those prices were saved. `npm start -- --fresh` ignores that cache and spends credits. `npm run view` opens that file again and does not call the Odds API, ESPN, or TypeSafe. The top row is Football and Soccer. Football has NFL and NCAA, and each of those has Games and Props. Soccer has Premier League, Champions League, La Liga, Serie A, and Bundesliga, and each of those has Games and Props. Click a tab, or press Tab, Left, Right, or 1 and 2 for Games and Props. `[` and `]` change sport. `,` and `.` change league. Resize refits the table. The scroll wheel moves the bar on the right. `q` and the x button in the top-right corner close the screen. The background is black.

With no arguments the script uses the current NFL week from ESPN (Thursday through Monday) and skips games that have already kicked off. Each soccer league uses the games on its ESPN scoreboard and the following four days, so the rest of that matchweek is included. A `YYYY-MM-DD` argument is one America/New_York calendar day for the NFL and every league, so Sunday night is included and Monday night is not.

Soccer moneylines include the draw. The draw is not a leg. A team still has to be priced at 60% or better. Spreads and totals are goals. The props are an anytime goal, shots, shots on target, assists, and a card. US books do not post player props for the Champions League, so that props tab says so and does not request them.

## Where a sport lives

`sports/index.ts` is the parent-tab list, in screen order. Football is `sports/football.ts`, with NFL and NCAA under it. Soccer is `sports/soccer.ts` (one pair per league). A new sport is a file in that folder plus one line in the list. The shared slate, props, ESPN, and odds code stays where it is.

## Saved slate

`npm start` overwrites `parlays/last-run.json` after the lookups finish, then prints `Saved` and the file path. The next `npm start` replaces that file. It is gitignored.

The file is the finished screen, not the raw API responses. Each table cell is already decided. It stores:

- `savedAt`, the UTC time of that run.
- `title`, the week or Eastern day and how many favorites qualified.
- `groups`, the Games rows: each favorite, its spread, and its over/under.
- `note`, when there is no parlay or no qualifying favorite.
- `ticketGroups`, the moneyline tickets, only when at least two wins cleared 0.80.
- `props`, the Props tab: its title, one group of rows per team, and the note under that table.

`npm run view` reads `last-run.json` from the same directory as `view.ts` and draws it with the same screen. Prices and decisions stay as they were on that run. If the file is missing, the command prints `No saved slate. Run npm start once, then npm run view.` and exits. Run `npm start` when you want a new slate.

The same command without npm is:

```bash
node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx parlays.ts
node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx parlays.ts 2026-11-15
```

## What it prints

A table of every favorite. The Slip column is the bet to write down: `Take the over 46.5`, `Take Jaguars -10.5`, or `Pass` when that side is not favored. Under each team, a spread row and an over/under row give the line and the verify decision. The over/under row is the side the evidence supports more. Those two rows are not parlay legs. Tickets stay moneylines, and they print in a second table when at least two wins clear.

The view stays open after the lookups finish. Resize the window and the table redraws to the new width. The scroll wheel and ↑ ↓ move through the rows. Click a sport, a league, or Games and Props to switch. `q` and the x button close the screen.

The Props tab is the riskier board. For every team still to kick off it shows one anytime touchdown, the primary passing, receiving, and rushing yardage lines, and one extra stat. That extra row is a different market for each team, chosen from the short-priced side of receptions, passing touchdowns, completions, rush attempts, kicking points, and field goals. It uses a player already on that team’s lines, or the kicker, and it skips a tiny under such as a backup staying under 1.5 receptions. Those rows go through `verify` with the player’s ESPN game log. The slip reads `Take Allen anytime TD -135` or `Take Allen over 245.5 pass yds` when the log supports it, and `Pass` when it does not. Prop rows are not parlay legs.

Player props use the same Odds API key, on the per-game endpoint. Each returned market costs one credit, about ten credits per game. The player log is ESPN’s public athlete gamelog. No new account.

```text
┌──────────────────────┬───────┬────────┬─────────────┬──────────────────────────────────────────────────────┐
│ Team                 │ Price │ Market │ Decision    │ Comment                                              │
├──────────────────────┼───────┼────────┼─────────────┼──────────────────────────────────────────────────────┤
│ Jacksonville Jaguars │  -620 │  86.1% │ Review 0.72 │ 6-2, on 10 days rest, at the Titans (1-7, off a bye). │
│                      │       │        │             │ Verify leans toward the win at 0.72, short of 0.80.  │
│                      │       │        │             │ Left out.                                            │
└──────────────────────┴───────┴────────┴─────────────┴──────────────────────────────────────────────────────┘
```

- The percent on a parlay line is the product of each leg's moneyline implied probability. It is the market's number, not a model probability.
- The multiplier is the decimal-odds product. Prices come from FanDuel, then DraftKings, then BetMGM, then Caesars, then whichever book is listed first.
- Legs never share a game. Only 2-leg and 3-leg parlays are built, and only the top 10 by hit rate are printed.
- `No qualifying legs.` means nothing still to kick off was priced at 60% or better. `Not enough supported legs for a parlay.` means the briefs did not clear rerank and verify.

## How a leg gets in

1. Upcoming NFL moneylines (`h2h`, US books, American odds) in the week or Eastern day.
2. Implied probability at least 0.60. A -150 favorite is about 60%. Closer favorites, such as -148, stay off the list.
3. `rerank` keeps up to 8 legs with relevance at least 0.60 for "which NFL team is very likely to win this game?"
4. `verify` keeps a leg only when the brief supports the pick with confidence at least 0.80.

## Where the brief comes from

`getEvidence` in `evidence.ts` reads ESPN once per run:

- Season record and last five regular-season or playoff results, from each team's schedule.
- Days of rest, including a bye when the gap is 12 days or more.
- The injury report. Active players are skipped. Quarterbacks sort first, then Out, Doubtful, injured reserve, and Questionable. The brief keeps six listings per team, and includes the short report note for Out, injured-reserve, and quarterback listings.

Both recipes judge only that text. They do not look up the game themselves.

## Typecheck

```bash
npm run typecheck
```

This checks the TypeScript in this directory and does not emit JavaScript. The run command executes the TypeScript files directly with `tsx`.
