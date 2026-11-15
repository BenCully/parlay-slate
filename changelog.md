# Changelog

Newest entries go at the top. Each heading is `YYYY-MM-DDTHH:MM:SSZ`.

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
