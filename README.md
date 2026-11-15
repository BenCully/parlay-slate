# Parlays

Finds 2- and 3-leg NFL moneyline parlays.

The script pulls the slate from [The Odds API](https://the-odds-api.com/liveapi/guides/v4/), keeps favorites the market already prices at 60% or better, and builds a short brief for each one from ESPN's public injury report and team schedule. [jev-recipes](https://github.com/agencyenterprise/jev-recipes) then drops any pick that brief does not support. It prints the ten parlays with the highest combined implied hit rate.

No extra account is required for the briefs. ESPN's public site API is unauthenticated. The only keys are the two already in `.env`.

## Requirements

- Node.js 22.23.4 or newer (`jev-recipes` requires it).
- A [TypeSafe API key](https://console.typesafe.ai/settings/keys) (`TYPESAFE_API_KEY`). Live `rerank` and `verify` calls send the pick text and evidence to TypeSafe and use quota.
- An [Odds API key](https://the-odds-api.com) (`ODDS_API_KEY`). Each run requests one odds snapshot.

## Setup

```bash
cd parlays
npm install
cp .env.example .env
```

Put both keys in `.env`. That file is gitignored.

## Run

```bash
npm start
npm start -- 2026-11-15
npm run view
```

`npm start` saves the slate to `last-run.json`. `npm run view` opens that same screen and does not call the Odds API or TypeSafe. The screen has two tabs, Games and Props. Click a tab, or press Tab, the arrow keys, or 1 and 2. Resize refits the table. The scroll wheel moves the bar on the right, and the x button in the top-right corner closes the screen. The background is black. Run `npm start` again when you want a fresh slate.

With no arguments the script uses the current NFL week from ESPN (Thursday through Monday) and skips games that have already kicked off. A `YYYY-MM-DD` argument is one America/New_York calendar day, so Sunday night is included and Monday night is not.

The same command without npm is:

```bash
node --env-file-if-exists=.env --import tsx parlays.ts
node --env-file-if-exists=.env --import tsx parlays.ts 2026-11-15
```

## What it prints

A table of every favorite. The Slip column is the bet to write down: `Take the over 46.5`, `Take Jaguars -10.5`, or `Pass` when that side is not favored. Under each team, a spread row and an over/under row give the line and the verify decision. The over/under row is the side the evidence supports more. Those two rows are not parlay legs. Tickets stay moneylines, and they print in a second table when at least two wins clear.

The view stays open after the lookups finish. Resize the window and the table redraws to the new width. The scroll wheel and ↑ ↓ move through the rows. Click Games or Props to switch tabs. The x button closes the screen.

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

This checks `parlays.ts` and `evidence.ts` and does not emit JavaScript. The run command executes the TypeScript files directly with `tsx`.
