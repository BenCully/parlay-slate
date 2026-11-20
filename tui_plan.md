# Parlay Slate terminal launcher plan

Implementation plan for a coding agent. Read this file, then implement in [BenCully/parlay-slate](https://github.com/BenCully/parlay-slate) on `main`. This is the final plan. Decisions in [Decisions (final)](#decisions-final) are settled; do not reopen them.

This plan is based on a read-only clone of `main` at commit `97eb0f0f3596fc3bd16d0806f9b9d4218b25d750` (2026-11-19, 5:07 PM America/Chicago). Library versions and publish dates were verified against the npm registry and official docs on 2026-11-19. The "Parlay Slate" figlet art was generated with [figlet](https://www.npmjs.com/package/figlet) 1.12.0 (Standard and Small fonts) on 2026-11-19. Publish timestamps below are converted to America/Chicago.

## Decisions (final)

These answers from Ben replace earlier open questions.

1. **Bare `npm start` opens the TUI** (animated splash, then the options screen). The old direct-run path stays reachable: `npm run slate` always runs the slate, `npm start -- <slate args>` bypasses the TUI, and a non-TTY `npm start` falls back to the old CLI. Details are in [Entry routing](#entry-routing).
2. **After any action finishes or its screen closes, return to the options screen.** Do not exit the process. The only way out of the launcher is an explicit quit, defined in [How the user quits](#how-the-user-quits).
3. **Logo wording is `Parlay Slate`.** The splash plays a left-to-right column reveal of the checked-in figlet art, about 1.5s at 30 fps, skippable, with static fallbacks. Art and animation are specified in [Splash and animated logo](#splash-and-animated-logo).
4. **Last-used settings are cached in a new dedicated file:** project-local [`runs/tui-settings.json`](#tui-settings-file). Not `~/.parlay-slate.json`, and not `runs/last-run.json`. Schema, versioning, and corrupt-file handling are specified there.

## Goal

Replace typing the README npm commands with a clickable terminal UI:

1. A splash screen with an animated ASCII-art "Parlay Slate" logo on first boot.
2. An options screen where Ben can click or use the keyboard to choose a command and edit date, model, odds source, and related options.
3. Run the chosen pipeline and show progress, then open the existing slate screen, then return to the options screen.

## Current repo structure

Private ESM package (`"type": "module"` in [`package.json`](https://github.com/BenCully/parlay-slate/blob/main/package.json)). Node `>=22.23.4` with `engine-strict=true` in [`.npmrc`](https://github.com/BenCully/parlay-slate/blob/main/.npmrc). TypeScript is `module`/`moduleResolution` `NodeNext` and `verbatimModuleSyntax` in [`tsconfig.json`](https://github.com/BenCully/parlay-slate/blob/main/tsconfig.json). Runtime dependency is only `jev-recipes`. Scripts run TypeScript directly with `tsx`. There is **already a custom full-screen TUI** for the finished slate.

### Entry points and scripts (today, before this work)

| npm script | File | What it does today |
| --- | --- | --- |
| `npm start` | [`scripts/parlays.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/parlays.ts) | Walks every sport in [`sports/index.ts`](https://github.com/BenCully/parlay-slate/blob/main/sports/index.ts), writes `runs/last-run.json` and `snapshots/<day>-<model>.json`, then calls `showSlate`. Loads `.env.settings` then `.env`. **After this work, bare TTY `npm start` opens the TUI. Direct runs move to `npm run slate` and to `npm start -- <slate args>`.** |
| `npm run view` | [`scripts/view.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/view.ts) | Opens `runs/last-run.json`, or `snapshots/<name>.json` when given a name. No API calls. Unchanged. |
| `npm run compare` | [`scripts/compare.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/compare.ts) | Opens `snapshots/<day>-jev.json` beside `snapshots/<day>-tail-jev.json`. No API calls. Unchanged. |
| `npm run odds` | [`scripts/odds-days.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/odds-days.ts) | Lists Eastern days in `odds-cache/` via `listSavedOdds()`. No API calls. Unchanged. |
| `npm run clear-snapshots` | [`scripts/clear-snapshots.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/clear-snapshots.ts) | Deletes everything in `snapshots/`, including `snapshots/archive/`. Leaves `runs/` and `odds-cache/`. Unchanged. |
| `npm test` / `npm run typecheck` | [`test/pure.test.ts`](https://github.com/BenCully/parlay-slate/blob/main/test/pure.test.ts) / `tsc --noEmit` | Offline checks. Not part of the launcher menu. |

Debug launch configs that must keep working are in [`.vscode/launch.json`](https://github.com/BenCully/parlay-slate/blob/main/.vscode/launch.json). They require `console: integratedTerminal` because the Debug Console is not a TTY. After this work, retarget the no-arg **Start slate** config at the TUI entry, and add a **Run slate** config that launches `scripts/parlays.ts` the way **Start slate** does today. Configs that already pass a date, `odds=`, or `model=` stay direct runs.

### How options are parsed today

CLI args for a start are parsed in [`readStartArgs`](https://github.com/BenCully/parlay-slate/blob/main/decisions/judge.ts) (`decisions/judge.ts`). Order does not matter. `--` is ignored.

- Positional `YYYY-MM-DD`: one America/New_York calendar day for every league. Date format is enforced later by [`easternRange`](https://github.com/BenCully/parlay-slate/blob/main/slate/window.ts) in `slate/window.ts`. With no date, each league uses its ESPN scoreboard window and skips games that have already kicked off.
- `model=jev` (default) or `model=tail-jev`. `model=autojev` is an alias for `tail-jev`. Also accepts `--model=...`.
- `odds=YYYY-MM-DD`: replay prices saved that Eastern day. Calls `setOddsReplay(odds)` in [`odds/cache.ts`](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts). Cannot be combined with a slate date or with `--fresh`.
- `--fresh`: ignore `odds-cache/` for this run. Parsed inside `readStartArgs` only to reject `odds=` + `--fresh`, and **is not returned**. The cache actually honors it via `process.argv.includes('--fresh')` or `ODDS_CACHE=0` in `cacheBypass()` ([`odds/cache.ts` around line 183](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts)).

Environment (not CLI flags):

- `ODDS_SOURCE=fanduel` or unset/`the-odds-api`, read by `oddsSource()` in [`odds/cache.ts`](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts). Formula 1 always reads FanDuel.
- Keys in gitignored `.env`: `TYPESAFE_API_KEY`, `ODDS_API_KEY`, and for `tail-jev` `AUTOJEV_URL` plus `AUTOJEV_API_KEY`. Checked by `requireRunKeys` before any sport is walked. An `odds=` replay does not need `ODDS_API_KEY`. FanDuel does not need `ODDS_API_KEY`.
- Cache settings in gitignored `.env.settings`: `ODDS_CACHE_HOURS` (default 168), `ODDS_CACHE`, `ODDS_CACHE_DIR`, `ODDS_CREDIT_FLOOR` (default 30). A name in `.env` overrides `.env.settings`. The shell overrides both.

There is **no** CLI option for stake, number of legs, output path, or sport/league filter. Tickets are hardcoded as 2- and 3-leg moneylines, top 10, one leg per game, with 0.60 favorite / 0.60 rerank / 0.80 verify gates. [`scripts/parlays.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/parlays.ts) always walks the full `SPORTS` list: Football (NFL, NCAA), Soccer (Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1), Hockey (NHL), Basketball (NBA), Baseball (MLB), Formula 1.

### Existing TUI (important)

[`ui/table.ts`](https://github.com/BenCully/parlay-slate/blob/main/ui/table.ts) `presentScreen` already owns the terminal:

- Alternate screen (`\x1b[?1049h`), hidden cursor, black background / white text (`theme` at line 170).
- Mouse tracking: X10 + button-event + SGR (`\x1b[?1000h\x1b[?1002h\x1b[?1006h`).
- Stdin is raw and parsed as a `Buffer`. [AGENTS.md](https://github.com/BenCully/parlay-slate/blob/main/AGENTS.md) is explicit: do not set stdin to utf8, or mouse bytes get corrupted. On exit, reset color and turn mouse tracking off. Ctrl-C still restores the terminal.
- Clickable sport / league / Games-Props tabs, clickable `x` close button, click or drag on the scrollbar, wheel scrolls three lines.
- Keyboard: `q` quits the current screen, Tab / arrows / `1` `2` change Games and Props, `[` `]` change sport, `,` `.` change league, `j` `k` / arrows / PgUp / PgDn / space / `g` `G` scroll.
- Non-TTY fallback prints every page as text and exits.

[`ui/screen.ts`](https://github.com/BenCully/parlay-slate/blob/main/ui/screen.ts) `showSlate` and [`ui/compare.ts`](https://github.com/BenCully/parlay-slate/blob/main/ui/compare.ts) `showComparison` both go through `presentScreen`. A second direct slate run is blocked by [`scripts/lock.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/lock.ts) (`runs/slate.lock`) for the whole walk **and** while the slate screen is open. The options screen must **not** hold this lock; acquire it only when Start or Replay actually begins.

## README commands mapped to UI controls

Every command in the README [Run](https://github.com/BenCully/parlay-slate/blob/main/README.md) section becomes a control on the options screen. After this work, the README must show bare `npm start` as the TUI, and show `npm run slate` (and `npm start -- <args>`) for a direct run. The table below maps the *behaviors*; update example command strings in the README and in preview/error text so a no-arg `npm start` is not described as starting a live slate.

`npm test` and `npm run typecheck` stay off the menu.

| Behavior (today's command) | UI control | Notes |
| --- | --- | --- |
| Current slate (`npm start` today; `npm run slate` after) | Action **Start slate** + Date mode **Current slate** | Default model `jev`. Uses each league's ESPN window. |
| One Eastern day (`npm start -- YYYY-MM-DD`) | Action **Start slate** + Date mode **Eastern day** + date field/picker | One America/New_York day. Sunday night included, Monday night not. Direct: `npm run slate -- YYYY-MM-DD` or `npm start -- YYYY-MM-DD`. |
| `… model=jev` | **Model** radio: Jev | Default. Needs `TYPESAFE_API_KEY`. |
| `… model=tail-jev` | **Model** radio: Tail-Jev | Alias `autojev`. Needs `AUTOJEV_URL` and `AUTOJEV_API_KEY`. Does not call TypeSafe. |
| Replay (`… odds=YYYY-MM-DD model=…`) | Action **Replay saved odds** + odds-day picker + Model | Picker is filled from `listSavedOdds()` in [`odds/cache.ts`](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts). `--fresh` is disabled. |
| `--fresh` | **Fresh prices** checkbox | Disabled for replay. On The Odds API this spends credits. On FanDuel it rereads FanDuel. Also true when `ODDS_CACHE=0`. |
| `ODDS_SOURCE=fanduel …` | **Odds source** radio: FanDuel / The Odds API | Today this is env-only. The TUI sets `process.env.ODDS_SOURCE` for the run, and does not rewrite `.env`. Replay of a day saved by the other source must set the matching source (same rule as `oddsReplayCommand`). |
| `npm run odds` | Action **List saved odds** | Offline. Show the list in the TUI (or a scrollable page), including the printed replay commands, then return to the options screen. |
| `npm run compare -- YYYY-MM-DD` | Action **Compare snapshots** + compare-day picker | Needs both `snapshots/<day>-jev.json` and `snapshots/<day>-tail-jev.json`. Model and odds source are not inputs; they come from the saves. |
| `npm run clear-snapshots` | Action **Clear snapshots** + confirm | Destructive. Confirm with a typed or clickable yes. Leaves `runs/` and `odds-cache/`. |
| `npm run view` | Action **View last run** | Opens `runs/last-run.json`. |
| `npm run view -- 2026-11-15-jev` | Action **View snapshot** + snapshot picker | Name without `.json` under `snapshots/`, or a path ending in `.json`, matching [`scripts/view.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/view.ts). |

Options the CLI does **not** expose, so the first version of the UI should not invent them: stake, leg count, output path, sport/league filter, and live edits of `.env.settings` (`ODDS_CACHE_HOURS`, `ODDS_CREDIT_FLOOR`). Sport/league filter remains an [open question](#open-questions); it would require changing the walk in `scripts/parlays.ts`.

The live command preview on the options screen should show the **direct-run** equivalent, using `npm run slate` as the canonical script, for example `npm run slate -- 2026-11-15 model=jev`. Note in docs that `npm start --` with the same args also bypasses the TUI and does that run.

## Library comparison (verified 2026-11-19)

The repo is ESM, Node `>=22.23.4`, no React, and already has a mouse-capable alt-screen. The comparison is against that fit, not a greenfield CLI.

| Library | Latest (npm) | Published (America/Chicago) | Mouse click | Date picker | TypeScript / module | Fit with this repo |
| --- | --- | --- | --- | --- | --- | --- |
| Existing `presentScreen` in [`ui/table.ts`](https://github.com/BenCully/parlay-slate/blob/main/ui/table.ts) | in-repo | — | Yes: SGR + X10, tab clicks, `x`, scrollbar, wheel | Not yet; a month grid is straightforward on this mouse parser | Native TS, ESM, NodeNext | Already used by `showSlate` / `showComparison`. Same theme, same stdin rules. |
| [Ink](https://www.npmjs.com/package/ink) 8.0.0 | requires [React](https://www.npmjs.com/package/react) 19.3+ | 2026-10-03, 6:23 AM | **No first-party mouse.** [Ink 8 changelog](https://github.com/vadimdemedes/ink/releases/tag/v8.0.0): `useInput` now **drops** mouse reports. Official [`onClick` PR #955](https://github.com/vadimdemedes/ink/pull/955) was rejected over coordinate-origin and wheel-parsing issues. Third-party [`@ink-tools/ink-mouse`](https://www.npmjs.com/package/@ink-tools/ink-mouse) 2.1.0 (2026-01-22, 9:58 AM) exists but last targeted Ink `^6.6.0`, not 8. | No built-in calendar; would be a custom component | Excellent. Ink 8 is ESM, `engines.node >= 22` | Heavy: adds React. Hand-off to `presentScreen` means unmounting Ink and fully releasing stdin/raw mode or the two will fight. [`ink-select-input`](https://www.npmjs.com/package/ink-select-input) 6.2.0 (2025-04-29) and [`ink-text-input`](https://www.npmjs.com/package/ink-text-input) 6.0.0 (2024-05-14) are keyboard-oriented and have not had a 2026 release. |
| [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) 1.9.0 | — | 2026-11-09, 7:07 AM | No. Sequential keyboard wizard, not a persistent clickable form. | Yes: built-in [`date`](https://github.com/bombshell-dev/clack/blob/main/packages/prompts/src/date.ts) prompt (arrow through year/month/day segments). | ESM, official types, Node `>=20.12.0` | Nice prompts, but not "click to choose." Would still leave the existing slate TUI as a second system. |
| [Inquirer](https://www.npmjs.com/package/inquirer) 14.3.0 / [`@inquirer/prompts`](https://www.npmjs.com/package/@inquirer/prompts) 8.8.0 | — | 2026-11-10, 4:14 PM | No. Keyboard prompts only. The inquirer package README itself calls the 14.x entry the legacy wrapper and points new work at `@inquirer/prompts`. | No first-party date prompt (older `inquirer-date-prompt` last published 2022). | ESM, types, engines `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` (compatible with this repo's Node 22.23.4) | Same limitation as Clack: not a clickable options screen. |
| [blessed](https://www.npmjs.com/package/blessed) 0.1.81 | — | 2015-09-02, 8:33 PM | Yes | Widgets possible | CJS, no bundled types | Unmaintained since 2015–2016. Do not add. |
| [neo-blessed](https://www.npmjs.com/package/neo-blessed) 0.2.0 | — | 2018-06-13, 10:10 AM | Yes | Widgets possible | CJS, no bundled types | Inactive. Do not add. |
| [reblessed](https://www.npmjs.com/package/reblessed) 0.2.1 | — | 2023-02-12, 10:41 AM | Yes | Widgets possible | Ships typings, still CJS | Last npm release is 2023. Better than blessed, still stale next to a working in-repo screen. |
| [terminal-kit](https://www.npmjs.com/package/terminal-kit) 3.1.4 | — | 2026-07-19, 10:51 AM | Yes (docs advertise keys and mouse, input fields, menus, progress bars) | No first-party calendar; input field plus custom grid | CJS. Community [`@types/terminal-kit`](https://www.npmjs.com/package/@types/terminal-kit) 2.5.7 (2025-01-11, 5:32 PM) | Maintained, but would replace or fight `presentScreen` and is not ESM-native. |
| [`@opentui/core`](https://www.npmjs.com/package/@opentui/core) 0.9.5 | — | 2026-11-19, 3:05 PM | Yes, first-party, enabled by default ([interaction docs](https://opentui.com/docs/core-concepts/interaction/)) | Buildable | TypeScript, ESM | **Incompatible engines:** npm metadata is `node: >=26.4.0` and `bun: >=1.3.14`. This repo pins Node `>=22.23.4` and `engine-strict=true`. Native Zig core is also a bigger operational surface than this CLI needs. |

### ASCII logo libraries

| Library | Latest | Published (America/Chicago) | Notes |
| --- | --- | --- | --- |
| [figlet](https://www.npmjs.com/package/figlet) 1.12.0 | — | 2026-09-27, 4:54 PM | ESM + CJS, TypeScript types, promise API. Used once to generate the art below. Do not add it as a runtime dependency. |
| [cfonts](https://www.npmjs.com/package/cfonts) 3.3.1 | — | 2025-09-05, 6:37 PM | Block/filled fonts. Not needed; Standard figlet already fits an 80-column terminal. |
| [gradient-string](https://www.npmjs.com/package/gradient-string) 3.0.0 | — | 2024-09-27, 4:01 PM | Color gradients. The existing slate theme is plain white on black. The splash uses only dim / normal / bold white, not a color library. |
| [oh-my-logo](https://www.npmjs.com/package/oh-my-logo) 0.5.0 | — | 2026-05-19, 2:54 AM | Pretty CLI wrapper around figlet + cfonts + gradient-string, but it depends on Ink 5 and React 18. Do not take it as a runtime dependency. |

## Recommended stack

**Extend the existing custom TUI in `ui/table.ts` / `ui/screen.ts`. Check in the figlet "Parlay Slate" art from this plan as a static string array. Animate the splash with ANSI cursor positioning and a 30 fps timer, no extra animation library. Add no React, Ink, blessed, Clack, OpenTUI, figlet, or gradient-string runtime dependency.**

Reasons:

1. The slate and compare screens already take over stdin, raw mode, the alt screen, and mouse tracking. A second TUI library would have to fully unmount before `showSlate`, or the two would corrupt mouse bytes and leave the terminal unrestored.
2. Clickable controls, wheel, and the black theme already exist and are documented in AGENTS.md. The launcher should look like the same app.
3. The package currently has one runtime dependency. Ink 8 would add React 19.3. OpenTUI cannot install under Node 22. Blessed-family packages are unmaintained.
4. Date picking is a small month-grid widget on the existing SGR mouse parser.
5. Tests can stay on `node:test` like [`test/pure.test.ts`](https://github.com/BenCully/parlay-slate/blob/main/test/pure.test.ts). Do not add `ink-testing-library`.

Figlet 1.12.0 was used to produce the art in this plan. If the art is edited later, regenerate with `npx figlet@1.12.0 -f Standard "Parlay Slate"` (and `-f Small` for the compact variant) and check the new strings in. Do not add figlet to `dependencies`.

## Entry routing

Bare `npm start` is the TUI. The old direct-run behavior must stay one command away.

### Scripts after this work

In `package.json`:

```json
"start": "node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx scripts/start.ts",
"slate": "node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx scripts/parlays.ts",
"tui": "node --env-file-if-exists=.env.settings --env-file-if-exists=.env --import tsx scripts/tui.ts"
```

| Command | TTY | Result |
| --- | --- | --- |
| `npm start` (no args) | yes | TUI: animated splash, then options. |
| `npm start -- --no-splash` | yes | TUI, skip the splash. |
| `npm start -- --tui` and optional prefill args | yes | Force the TUI, even if slate args are also present. Prefill the form from `readStartArgs`. |
| `npm start -- 2026-11-15`, `model=…`, `odds=…`, and/or `--fresh` | yes | **Bypass the TUI.** Direct run, same as today's `npm start -- …`. |
| `npm start -- --slate` (with or without other slate args) | yes | Force a direct run. |
| `npm start` or `npm start -- --tui` | no | **Fall back to the old CLI:** direct `runSlate` with current-slate defaults, which already prints every page as text and exits when stdin/stdout is not a TTY. Do not hang and do not exit 1 just because there is no TTY. |
| `npm run slate` / `npm run slate -- <args>` | any | Always a direct run. This is the stable name for the old `npm start`. |
| `npm run tui` / `npm run tui -- --no-splash` or prefill args | yes | Always the TUI. |
| `npm run tui` | no | Print that `npm run tui` needs a terminal, and that `npm start` or `npm run slate` will run the slate, then exit 1. |

`scripts/start.ts` is the router. `scripts/tui.ts` always launches the TUI. `scripts/parlays.ts` stays the direct-run entry (thin wrapper around `runSlate`).

Treat these as **TUI flags**, not slate args: `--no-splash`, `--tui`, `--slate`. Strip them before calling `readStartArgs`.

A command has **slate args** (and therefore bypasses the TUI when it is `npm start` without `--tui`) if any remaining argument is `--fresh`, matches `/^(?:--)?model=/`, matches `/^(?:--)?odds=/`, or is a positional `YYYY-MM-DD`. Do not treat a defaulted `model: 'jev'` from `readStartArgs` as a user-supplied arg: that function always returns `model: 'jev'` even when the user passed nothing.

If `--slate` and `--tui` are both present, `--slate` wins and the run is direct.

`ODDS_SOURCE` in the environment is not a bypass trigger: it may already be set in `.env`.

## UX flow

```text
npm start                    (TTY, no slate args)
npm run tui
    │
    ├─ splash (~1.5s column-reveal, or until any key / click / --no-splash
    │          / PARLAY_SLATE_NO_ANIM static fallback)
    │     ASCII "Parlay Slate" logo
    │
    └─ options screen  ←──────────────────────────────────────────┐
          edit fields, click Run                                  │
          │                                                       │
          ├─ validation errors stay                               │
          │                                                       │
          ├─ Start / Replay ──► restore alt screen                │
          │                      print progress to the normal     │
          │                      terminal (league names,          │
          │                      "Checking N of M claims...",     │
          │                      Saved paths)                     │
          │                      acquire runs/slate.lock          │
          │                      showSlate(...)                   │
          │                      slate q / x closes that screen   │
          │                      return ──────────────────────────┘
          │
          ├─ View / Compare ──► showSlate / showComparison        │
          │                      q / x returns ───────────────────┘
          ├─ List saved odds ─► scrollable list, q / x returns ───┘
          └─ Clear snapshots ─► confirm, then stay on options
                                 with a status line ──────────────┘

    Quit the launcher (restore terminal, exit 0):
      on the options screen only: q, Esc (no dialog open),
      click x, click Quit, or Ctrl-C (any screen).
```

Direct runs (`npm run slate`, `npm start -- <slate args>`, non-TTY `npm start`) skip this loop and behave like today's `npm start`.

### How the user quits

This is the contract. Implement it exactly.

| Context | Input | Result |
| --- | --- | --- |
| Options screen | `q` or `Q` | Quit the launcher. Restore the terminal, exit 0. |
| Options screen, no date picker or confirm dialog open | `Esc` | Same: quit the launcher. |
| Options screen, date picker or confirm dialog open | `Esc` | Close that overlay only. Stay on the options screen. |
| Options screen | Click **Quit**, click the header `x`, or Ctrl-C | Quit the launcher. Restore the terminal. Ctrl-C exits with the usual SIGINT status. |
| Splash | Any key, left click | Skip the rest of the animation and go to the options screen. Does **not** quit. |
| Slate, compare, or list-odds screen opened from the TUI | `q`, click `x` | Close that screen and **return to the options screen**. Does not quit the launcher. |
| Slate / compare / list opened from the TUI | Ctrl-C | Restore the terminal and exit the process. Do not return to the form. This is the escape hatch if the loop misbehaves. |
| Direct `npm run slate` / bypassed `npm start -- …` | `q` / `x` / Ctrl-C | Unchanged from today: close the slate and exit the process. There is no options screen to return to. |

The options-screen hint line should read: `enter runs · tab / arrows move · click selects · q / esc quits · ctrl-c exits`.

### Splash and animated logo

Wording is **Parlay Slate** (not `PARLAYS`, not all-caps `PARLAY SLATE`). The art below was produced with `npx figlet@1.12.0 -f Standard "Parlay Slate"` and `-f Small "Parlay Slate"` on 2026-11-19 and must be checked in as string arrays in `ui/tui/logo.ts`.

**Standard font** (primary). 6 rows, 56 columns. Fits an 80-column terminal.

```text
  ____            _               ____  _       _       
 |  _ \ __ _ _ __| | __ _ _   _  / ___|| | __ _| |_ ___ 
 | |_) / _` | '__| |/ _` | | | | \___ \| |/ _` | __/ _ \
 |  __/ (_| | |  | | (_| | |_| |  ___) | | (_| | ||  __/
 |_|   \__,_|_|  |_|\__,_|\__, | |____/|_|\__,_|\__\___|
                          |___/                         
```

**Small font** (narrow-terminal fallback). 5 rows, 48 columns. Use when `columns < 56` and `columns >= 48`.

```text
  ___          _             ___ _      _       
 | _ \__ _ _ _| |__ _ _  _  / __| |__ _| |_ ___ 
 |  _/ _` | '_| / _` | || | \__ \ / _` |  _/ -_)
 |_| \__,_|_| |_\__,_|\_, | |___/_\__,_|\__\___|
                      |__/                      
```

If `columns < 48` or `rows` is too short for the chosen art plus a one-line hint (Standard needs 8 rows, Small needs 7), draw the single centered line `Parlay Slate` and do not animate.

Pad every stored line to the stated width so column reveal does not shift the block. Keep the trailing spaces from the figlet output.

#### Animation: left-to-right column reveal with a bold leading edge

This is the required approach: a **column wipe** of the figlet block on the alt screen, using only ANSI cursor positioning and the existing black/white theme. No animation library, no `gradient-string`, no figlet at runtime.

Why this, not the alternatives:

- Character-by-character typewriter looks broken on figlet art (holes open inside letters).
- Line-by-line drop-in is simpler but less of an entrance.
- A multi-color gradient sweep would fight the existing `\x1b[48;2;0;0;0m\x1b[38;2;255;255;255m` theme and needs extra color dependencies. A **bold leading edge** on otherwise normal white is enough motion.

Timing (total **1500 ms**, skippable the whole time):

| Phase | Duration | Frames at 30 fps |
| --- | --- | --- |
| Reveal | **1200 ms** | 36 frames, one every **33 ms** (`1000 / 30`) |
| Hold of the completed logo, plus the hint `press any key` | **300 ms** | 9 frames, static |

At reveal frame `i` (`i` from 0 to 36 inclusive), `visible = Math.round((i / 36) * width)` columns of each logo line are drawn. Columns `max(0, visible - 3) .. visible - 1` are **bold** (`\x1b[1m`) unless `NO_COLOR` is set; earlier columns are normal white; later columns are spaces. After frame 36, clear bold, draw the full logo, add the hint, and hold.

Implementation rules:

- Enter the same alt screen, hidden cursor, mouse tracking, and `theme` as `presentScreen`. Parse stdin as a `Buffer`.
- Do not call `console.log` during the splash (it will scroll the alt screen). Write with `process.stdout.write`.
- **Avoid flicker:** clear once at the start (`\x1b[2J\x1b[H` with theme). Each frame, move to the logo's top-left with `\x1b[<row>;<col>H` and rewrite only the logo rows (and the hint row once the hold starts). On resize, full clear, re-center, and redraw the current frame.
- **Centering:** `left = max(1, floor((columns - logoWidth) / 2) + 1)`, `top = max(1, floor((rows - logoHeight - 2) / 2) + 1)` (ANSI 1-based). Recompute on `stdout` `resize`. Keep reveal **progress as a fraction** of elapsed reveal time so a resize does not restart the wipe.
- Use `setTimeout` (or a `performance.now()` scheduled loop) so stdin stays free to accept a skip. Do not busy-wait.
- **Skip:** any key or left click ends the splash immediately and opens the options screen. Do not force the user to watch the remaining frames or the hold.
- `--no-splash` skips the splash entirely (no static logo either) and goes to options.

Fallbacks — show a **static** centered logo (no wipe), still for 1500 ms and still skippable, or skip entirely as noted:

| Condition | Behavior |
| --- | --- |
| `PARLAY_SLATE_NO_ANIM` is set to a non-empty value other than `0` | Static logo for 1500 ms, then options. This is the reduced-motion switch. Terminals do not expose `prefers-reduced-motion`; this env name is the hook. |
| `--no-splash` | No splash. Options immediately. |
| [`NO_COLOR`](https://no-color.org/) is set | Still allow the column reveal, but emit **no** color, bold, or dim codes. Use the same theme reset only. |
| Terminal narrower than the Standard art but at least 48 columns | Use the Small art, same animation. |
| Terminal too small for Small, or too short | Static one-line `Parlay Slate`, no animation, still skippable, 1500 ms or key. |
| Non-TTY | No splash. Routing above applies (`npm start` runs the slate; `npm run tui` exits 1). |

After the hold (or a skip, or a static fallback timer), transition to the options screen **without** leaving the alt screen if both are using `withAltScreen`. If that is awkward, restore and re-enter once is acceptable, but do not flash the user's shell prompt in between if it can be avoided.

#### Animation-loop sketch

Check this into `ui/tui/splash.ts`, adapted to the shared `withAltScreen` helper and the Buffer stdin parser. This is a sketch of the timing and drawing contract, not a license to bypass those helpers.

```ts
const FPS = 30;
const FRAME_MS = 1000 / FPS; // 33.333...
const REVEAL_MS = 1200;
const HOLD_MS = 300;
const EDGE = 3;

function sliceLogo(lines: string[], visible: number, boldEdge: boolean): string[] {
  return lines.map((line) => {
    const shown = line.slice(0, visible).padEnd(line.length, ' ');
    if (!boldEdge || visible <= 0) return shown;
    const edgeStart = Math.max(0, visible - EDGE);
    return shown.slice(0, edgeStart) + '\x1b[1m' + shown.slice(edgeStart, visible) + '\x1b[22m' + shown.slice(visible);
  });
}

function origin(columns: number, rows: number, width: number, height: number) {
  return {
    left: Math.max(1, Math.floor((columns - width) / 2) + 1),
    top: Math.max(1, Math.floor((rows - height - 2) / 2) + 1),
  };
}

function paint(lines: string[], left: number, top: number, hint?: string) {
  let out = '';
  for (const [i, line] of lines.entries()) out += `\x1b[${top + i};${left}H${line}`;
  if (hint) out += `\x1b[${top + lines.length + 1};${left}H${hint}`;
  process.stdout.write(out);
}

// inside the alt-screen session:
const started = performance.now();
let skipped = false;
const tick = () => {
  if (skipped) return;
  const elapsed = performance.now() - started;
  const { columns, rows } = process.stdout;
  const { left, top } = origin(columns, rows, logo[0].length, logo.length);
  if (elapsed >= REVEAL_MS + HOLD_MS) {
    finishToOptions();
    return;
  }
  if (elapsed >= REVEAL_MS) {
    paint(logo, left, top, 'press any key');
  } else {
    const visible = Math.round((elapsed / REVEAL_MS) * logo[0].length);
    paint(sliceLogo(logo, visible, process.env.NO_COLOR == null), left, top);
  }
  setTimeout(tick, FRAME_MS);
};
setTimeout(tick, 0);
```

On skip, set `skipped = true`, cancel the next timer, and call `finishToOptions()`. On resize, full clear with theme, then draw the frame for the current `elapsed` (do not reset `started`).

### Options screen layout

```text
 Parlay Slate                                          Model: —    Odds Source: —    x
────────────────────────────────────────────────────────────────────────────────────
 Action     ( ) Start slate   ( ) Replay saved odds   ( ) View last run
            ( ) View snapshot ( ) Compare snapshots   ( ) List saved odds
            ( ) Clear snapshots

 Date mode  ( ) Current slate   (•) Eastern day   [ 2026-11-15 ]  [<] [>]
            Click the date to open a month grid.  [ and ] step one day.
            Hidden when the action is View last run, List, or Clear.
            Replay uses "Odds day" instead of Date mode; the picker lists
            days from listSavedOdds() and shows FanDuel vs The Odds API.

 Model      (•) Jev    ( ) Tail-Jev
            Hidden for View / Compare / List / Clear.

 Odds src   (•) The Odds API    ( ) FanDuel
            Hidden for View / Compare / List / Clear.
            When replaying, preselect the source that saved that day.

 Fresh      [ ] Ignore odds-cache and fetch new prices
            Disabled (and off) when action is Replay, or when not Start slate.
            Warning when Odds API + Fresh: this spends credits.

 Snapshot   [ 2026-11-15-jev ▼ ]     only for View snapshot
 Compare    [ 2026-11-15 ▼ ]         only for Compare; days that have both models

 Status     Keys: TYPESAFE_API_KEY ok. ODDS_API_KEY ok.
            or: Set TYPESAFE_API_KEY in .env before a Jev run.
            Never print a key value or AUTOJEV_URL.

 Command    npm run slate -- 2026-11-15 model=jev
            Live preview of the equivalent direct-run command.

            [ Run ]     [ Quit ]
────────────────────────────────────────────────────────────────────────────────────
 enter runs · tab / arrows move · click selects · q / esc quits · ctrl-c exits
```

Date picker (opens in place when the date field is focused and Enter or click happens):

```text
          November 2026
     Su Mo Tu We Th Fr Sa
      1  2  3  4  5  6  7
      8  9 10 11 12 13 14
    [15]16 17 18 19 20 21
     22 23 24 25 26 27 28
     29 30
     , . change month · enter selects · esc closes
```

The date is always stored and shown as `YYYY-MM-DD` in America/New_York, consistent with `todayEastern()` in [`slate/window.ts`](https://github.com/BenCully/parlay-slate/blob/main/slate/window.ts).

### Keyboard and mouse

Keep the existing restore / Ctrl-C contract. Add form-specific bindings:

| Input | Action |
| --- | --- |
| Click a radio, checkbox, button, or tab | Select / toggle |
| Click `x`, click **Quit**, or press `q` on the options screen | Quit the launcher (restore the terminal, exit) |
| `Esc` | Close the date picker or confirm dialog if one is open; otherwise quit the launcher |
| Click the date, or Enter on the date field | Open / commit the month grid |
| Click `<` `>` on the date, or `[` `]` while the date is focused | Step one Eastern day (`addDays` in `slate/window.ts`) |
| Tab / Shift-Tab / Up / Down | Move focus between fields |
| Left / Right | Move within a radio row |
| Space / Enter | Toggle checkbox or activate the focused button |
| `r` or Enter on **Run** | Validate and run |
| Wheel | Scroll the form or a long list (odds days, snapshots) if it overflows |

### Validation and defaults

Validate on Run, and also live-disable Run when the form is invalid.

- Date and `odds=` must match `^\d{4}-\d{2}-\d{2}$` (same message style as `readStartArgs` / `easternRange`).
- Replay cannot also have a slate date or Fresh (`readStartArgs` already throws on those combinations).
- `requireRunKeys(model, replay)` before Start or Replay. Show the missing names (`TYPESAFE_API_KEY`, `ODDS_API_KEY`, `AUTOJEV_URL`, `AUTOJEV_API_KEY`) without values.
- View last run: fail with the same wording as [`scripts/view.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/view.ts) if `runs/last-run.json` is missing.
- View snapshot / Compare: fail if the file is missing; Compare should mention the `npm run slate -- <day> model=…` (or `npm start -- <day> model=…`) command that would write it.
- Clear snapshots: require an explicit confirm.

Default values, in order:

1. Prefill args when the TUI was launched with them, e.g. `npm run tui -- 2026-11-15 model=tail-jev` or `npm start -- --tui 2026-11-15`, parsed with `readStartArgs`.
2. Last-used options from `runs/tui-settings.json`.
3. Process env (`ODDS_SOURCE` from `.env`), model `jev`, date mode **Current slate**, Fresh off.

`readStartArgs` should keep its current behavior. Extend it only if needed so `fresh` is returned (today it is parsed and discarded). Any change must keep the assertions in [`test/pure.test.ts`](https://github.com/BenCully/parlay-slate/blob/main/test/pure.test.ts) around lines 167–179 passing.

### TUI settings file

Path: **`runs/tui-settings.json`** (project-local, next to `runs/last-run.json` and `runs/slate.lock`).

Why this path, not a home-level file or a new root file:

- `runs/` is already gitignored in [`.gitignore`](https://github.com/BenCully/parlay-slate/blob/main/.gitignore), so a new ignore rule is not required and the file cannot be committed by accident.
- Odds days, snapshots, and keys are per checkout. A `~/.parlay-slate.json` would point at the wrong days after cloning a second copy.
- A root `tui-settings.json` would need a new gitignore entry and would sit among source files.
- This is a **new dedicated file**. Do not overwrite or reuse `runs/last-run.json` (that is the saved slate contract used by `npm run view`).

Create `runs/` if needed (`mkdir` recursive), the same way `saveRun` already does.

Do not put secrets, keys, or `AUTOJEV_URL` in this file. Schema version 1:

```json
{
  "version": 1,
  "action": "start",
  "dateMode": "current",
  "day": "2026-11-15",
  "model": "jev",
  "oddsSource": "the-odds-api",
  "fresh": false,
  "oddsDay": "2026-11-15",
  "snapshot": "2026-11-15-jev",
  "compareDay": "2026-11-15"
}
```

Field rules:

| Field | Allowed values | If missing or invalid |
| --- | --- | --- |
| `version` | positive integer | Treat as `1` when missing. See versioning below. |
| `action` | `start`, `replay`, `view-last`, `view-snapshot`, `compare`, `list-odds`, `clear-snapshots` | `start` |
| `dateMode` | `current`, `day` | `current` |
| `day`, `oddsDay`, `compareDay` | `YYYY-MM-DD` | omit / leave the form default |
| `model` | `jev`, `tail-jev` (`autojev` normalizes to `tail-jev`) | `jev` |
| `oddsSource` | `the-odds-api`, `fanduel` | current `ODDS_SOURCE` env, else `the-odds-api` |
| `fresh` | boolean | `false` |
| `snapshot` | non-empty string without a path escape | omit |

**Versioning:** the loader understands `version === 1`. Unknown keys are ignored so fields can be added without a bump. If `version` is **greater than** 1, still read every known v1 key, ignore the rest, and do not throw. If a later change is not backward compatible, bump to `version: 2` and add a migration branch; v1 files must still load. Always write `version: 1` until such a bump exists.

**Load on start:** best-effort. A missing file is normal (first run) and yields the defaults above. If the file exists but is not JSON, is not a plain object, or cannot be read, do not crash: ignore it, keep defaults, and optionally write a one-line warning to stderr (`Could not read runs/tui-settings.json, using defaults.`). Do not delete a corrupt file automatically (it may be the only copy of last-used values while the user inspects it). Valid fields in a partially valid object are still used; only bad fields are dropped.

**Save on run:** write the file after a **successful** Run of Start, Replay, View last run, View snapshot, or Compare. Do not save after a validation failure, a missing-snapshot error, or a failed Start. List saved odds and Clear snapshots do not need to save. Do not save on Quit. Write atomically (temp file in `runs/` + rename), same pattern as `writeAtomic` in [`scripts/parlays.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/parlays.ts). Never write keys or URLs.

## Architecture

### How the TUI should invoke existing code

**Import functions directly. Do not `spawn` `npm start` or `npm run slate`.**

Reasons, given this codebase:

- `showSlate` and `showComparison` need the same process and TTY. A child npm script can inherit stdio, but then the parent TUI must fully restore first, and errors, the run lock, and env (`ODDS_SOURCE`, `--fresh`) are harder to set cleanly.
- `oddsSource()` and `cacheBypass()` read `process.env` and `process.argv`. A programmatic API is safer than hoping the child's argv matches.
- `acquireRunLock` is in-process and must cover the walk plus the slate screen, as today, then release before the options screen comes back.
- The scripts are already TypeScript modules next to the UI. The work is extracting a function, not building an IPC layer.

`spawn` is only acceptable as a last resort for a command that cannot be imported. It is not needed here.

### Required extractions

Today [`scripts/parlays.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/parlays.ts), [`scripts/view.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/view.ts), [`scripts/compare.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/compare.ts), and [`scripts/clear-snapshots.ts`](https://github.com/BenCully/parlay-slate/blob/main/scripts/clear-snapshots.ts) are entry files with top-level `main()` or top-level await, and they do not export a run function. Keep those files as thin CLI wrappers so `npm run slate`, `npm run view`, and the others stay identical to today's behavior.

1. Export `runSlate(options)` from `scripts/parlays.ts` (or a new `slate/run.ts` if that file would get too crowded). Options: `{ day?: string; model: string; odds?: string; fresh?: boolean; source?: 'fanduel' | 'the-odds-api' }`. Internals stay: `selectDecisionModel`, `requireRunKeys`, `setOddsReplay`, lock, walk `SPORTS`, `saveRun`, `saveDecisionSnapshot`, `showSlate`.
2. Add a programmatic fresh flag in [`odds/cache.ts`](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts), patterned on `setOddsReplay`. For example `setOddsFresh(true)` that `cacheBypass()` also honors. Do not rely on stuffing `--fresh` into `process.argv`. Reset the flag when the run finishes so a later view in the same process is unaffected. `ODDS_CACHE=0` remains a bypass.
3. For odds source, set `process.env.ODDS_SOURCE` to `fanduel` or `the-odds-api` for the duration of the run, then restore the previous value. Do not write `.env`.
4. Export `viewSavedSlate(name?: string)` from `scripts/view.ts` and `compareSnapshots(day: string)` from `scripts/compare.ts`. Export `clearSnapshots()` from `scripts/clear-snapshots.ts`. `listSavedOdds` is already exported.
5. Have `readStartArgs` return `fresh` as well as `{ day, model, odds }`, and update the existing tests.

### How options pass through

Build a preview command string for the status line, and pass a structured object into the extracted functions. The preview must match what a human would type for a direct run, including an `ODDS_SOURCE=` prefix when the chosen source differs from the current env, the same way [`oddsReplayCommand`](https://github.com/BenCully/parlay-slate/blob/main/odds/cache.ts) does. Use `npm run slate` as the script name in that preview.

| UI field | Passed as |
| --- | --- |
| Eastern day | `day` argument (`npm run slate -- YYYY-MM-DD`) |
| Current slate | omit `day` |
| Model | `model=jev` / `model=tail-jev` |
| Replay day | `odds=YYYY-MM-DD` plus `setOddsReplay` |
| Fresh | `setOddsFresh(true)` (CLI equivalent `--fresh`) |
| Odds source | `process.env.ODDS_SOURCE` for the run |
| View snapshot name | argument to `viewSavedSlate` |
| Compare day | argument to `compareSnapshots` |

### Terminal layer

Extract the shared alt-screen / raw-stdin / mouse-parser / restore loop from `presentScreen` into something like `withAltScreen` in `ui/table.ts` or a new `ui/term.ts`. `presentScreen` must keep its current behavior and fallback. The splash and the options form should use that helper with their own `draw`, `onKey`, and `onMouse`.

Do not copy-paste a second stdin Buffer parser. The SGR (`\x1b[<…M/m`) and X10 (`\x1b[M…`) branches in `takeInput` (around lines 506–527 of `ui/table.ts`) are the contract.

Before calling `showSlate` / `showComparison`, the options screen must `restore()` (leave alt screen, disable mouse, leave raw mode) unless the shared session can hand off cleanly. After the slate promise resolves, **always** open the options screen again, including after a failed run (show the error on the status line).

Progress for Start / Replay: v1 should **leave the alt screen and print to the normal terminal**, which is what a direct run already does (`console.log` of league names, `Checking N of M claims...`, cache hits, credits remaining, `Saved …`). Then `showSlate` opens the alt screen. When that screen closes, return to the options form. A later improvement can keep a progress view inside the TUI by injecting a logger; do not block v1 on that.

### New files

```text
scripts/start.ts            # npm start router: TUI vs direct run
scripts/tui.ts              # npm run tui entry (always TUI)
ui/tui/logo.ts              # checked-in Standard + Small "Parlay Slate" art + one-line fallback
ui/tui/splash.ts            # 30 fps column-reveal splash and static fallbacks
ui/tui/options.ts           # form state, layout, date picker, preview command
ui/tui/settings.ts          # load/save runs/tui-settings.json
ui/tui/commands.ts          # map form state -> runSlate / view / compare / list / clear
test/tui.test.ts            # pure tests: routing, validation, preview, settings, logo widths, reveal frames
```

If `withAltScreen` is extracted, keep it next to `presentScreen` so the slate screen and the launcher share it.

VS Code launch configs in `.vscode/launch.json`:

- Retarget no-arg **Start slate** at `scripts/start.ts` (TTY TUI). Keep `console: integratedTerminal`.
- Add **Run slate**, pointing at `scripts/parlays.ts` with the same env-file `runtimeArgs` today's **Start slate** uses.
- Configs that pass a date, `odds=`, or `model=` stay pointed at `scripts/parlays.ts` (or at `scripts/start.ts` with those args; both are direct runs).
- Optional **Open TUI** pointing at `scripts/tui.ts`.

### npm scripts and the old CLI

See [Entry routing](#entry-routing) for the exact `package.json` scripts and bypass rules. Document all of the following in the README Run section and in AGENTS.md Commands:

- `npm start` opens the TUI in a terminal.
- `npm run slate` is the direct slate run (old `npm start`).
- `npm start -- 2026-11-15 model=jev` (and the other README slate examples) still run the slate directly.
- `npm start -- --no-splash` opens the TUI without the logo animation.
- `npm run tui` also opens the TUI.
- Non-TTY `npm start` still prints the slate as text, as today.

Do not leave the README saying that bare `npm start` "loads US moneylines" without mentioning the TUI.

## Step-by-step tasks

Each task has acceptance criteria. Run `npm test` and `npm run typecheck` after code changes, as AGENTS.md requires. Update `changelog.md` in the same turn as the change, with a UTC heading `YYYY-MM-DDTHH:MM:SSZ` and no secrets. Do not commit or push unless asked.

### Task 1 — Extract a reusable alt-screen session

- Pull stdin Buffer parsing, mouse enable/disable, theme, alt screen, resize, and restore out of `presentScreen` without changing slate/compare behavior.
- Acceptance: `npm run view` (when a save exists) and a non-TTY `presentScreen` dump still work. `q`, click `x`, wheel, and tab clicks still work on the slate. Ctrl-C restores color, cursor, and mouse off. Existing header tests keep passing.

### Task 2 — Programmatic run APIs

- Export `runSlate`, return `fresh` from `readStartArgs`, add `setOddsFresh`, export view / compare / clear helpers. CLI wrappers stay one-liners that parse argv the same way. `scripts/parlays.ts` remains the `npm run slate` entry.
- Acceptance: existing `readStartArgs` tests pass, plus new cases for returned `fresh`. `npm run slate -- --fresh` and `npm start -- --fresh` still bypass the cache (the latter is a direct run because `--fresh` is a slate arg). A unit test can call `setOddsFresh(true)` without putting `--fresh` on `process.argv` and observe `cacheBypass` (export that helper or test through a thin wrapper). After `setOddsFresh(false)` / reset, a later call does not stay fresh. No network in tests.

### Task 3 — Settings file and command preview

- Implement `ui/tui/settings.ts` against **`runs/tui-settings.json`**, including `version: 1`, atomic writes, and the load/save rules in [TUI settings file](#tui-settings-file). Implement a pure function that turns form state into the preview command string (`npm run slate -- …`) and the `runSlate` options object.
- Acceptance: tests cover first-run missing file, defaults, last-used load, malformed JSON, non-object JSON, unknown keys ignored, `version` greater than 1 still reads v1 keys, invalid dates and models dropped field-by-field, no secrets written, atomic save after a successful run only, `odds=` + fresh rejected, `ODDS_SOURCE=` prefix when the chosen source differs from env, and `model=autojev` normalizing to `tail-jev`.

### Task 4 — Splash + animated "Parlay Slate" logo

- Add `ui/tui/logo.ts` with the Standard and Small figlet strings from this plan (padded to 56 and 48 columns) and the one-line fallback `Parlay Slate`. Add `ui/tui/splash.ts` with the 30 fps, 1200 ms column reveal, 300 ms hold, bold leading edge, skip-on-key-or-click, resize recentering, and fallbacks in [Splash and animated logo](#splash-and-animated-logo).
- Acceptance:
  - Art matches the checked-in Standard / Small blocks; a width test asserts 56 and 48.
  - A pure reveal-frame helper, given progress `0`, `0.5`, and `1`, returns 0, 28, and 56 visible columns for the Standard logo (and does not emit bold when a `noColor` flag is set).
  - `--no-splash` skips the splash.
  - `PARLAY_SLATE_NO_ANIM=1` shows the static logo, no wipe.
  - `NO_COLOR=1` does not emit bold or color during a reveal (tested via the helper).
  - Narrow width selects Small, then the one-liner.
  - Skip ends the splash immediately.
  - Manual TTY check: the logo wipes in from the left in about 1.2s, holds, then the options screen appears; a key during the wipe jumps to options.

### Task 5 — Options screen

- Implement the layout in the mockup: action, date mode / date picker, model, odds source, fresh, snapshot and compare pickers, key-status line, command preview, Run / Quit.
- Hide or disable controls that do not apply to the current action. Live-disable Run when validation or `requireRunKeys` would fail. Never print key values or `AUTOJEV_URL`.
- Populate replay days from `listSavedOdds()` and snapshots from `snapshots/*.json` (ignore `snapshots/archive/`).
- Acceptance: keyboard-only use can reach every action. Mouse clicks select radios, toggle Fresh, open the date picker, and press Run. Date picker commits a `YYYY-MM-DD` America/New_York day. Render at several widths (80, 100, 120) and confirm no layout line is longer than the width (AGENTS.md rule for layout changes). `q`, `Esc` (no dialog), **Quit**, and `x` quit the launcher and restore the terminal.

### Task 6 — Wire actions, routing, and the return loop

- Add `scripts/start.ts` and `scripts/tui.ts`. Implement [Entry routing](#entry-routing). Running an action restores the terminal as needed, calls the extracted function, then **returns to the options screen** when the slate, compare, or list screen closes, including after a failed run (status line shows the error). Save settings after a successful Start / Replay / View / Compare. Clear snapshots asks for confirm.
- Acceptance:
  - Bare TTY `npm start` opens the splash then the options screen and does not start a live slate by itself.
  - `npm run slate` and `npm start -- 2026-11-15 model=jev` run the slate directly, no TUI.
  - `npm start -- --no-splash` opens the TUI without the splash.
  - `npm start -- --tui 2026-11-15` opens the TUI with the date prefilled.
  - `npm start -- --fresh` is a direct fresh run, not the TUI.
  - Non-TTY `npm start` with no args runs the slate and prints text (old CLI), exit path unchanged from today aside from going through `runSlate`.
  - Non-TTY `npm run tui` exits 1 with a short message.
  - After View, Compare, or a slate started from the form, `q` on that screen returns to the options form; a second `q` on the form exits and restores the terminal.
  - A second direct slate while a TUI-launched slate is open hits `runs/slate.lock` and names the pid. Sitting on the options screen does not hold the lock.

### Task 7 — Docs and debug config

- Rewrite the README Run section and AGENTS.md Commands so bare `npm start` is the TUI, `npm run slate` is the direct run, and every former `npm start -- …` example still works (as a TUI bypass) or is also shown as `npm run slate -- …`. Document `--no-splash`, `--tui`, `--slate`, `PARLAY_SLATE_NO_ANIM`, and `runs/tui-settings.json`. Update `.vscode/launch.json` as specified above.
- Acceptance: a reader can find how to open the TUI and how to run a slate without the TUI without guessing. Old dated examples such as `npm start -- 2026-11-15 model=jev` remain valid.

## Testing approach

Stay on `node:test` + `tsx`, same as `npm test` today. Those tests must not call The Odds API, ESPN, TypeSafe, or Autojev.

Cover in `test/tui.test.ts` (and extensions to the existing `readStartArgs` tests):

- Form validation and mutual exclusion (`odds=` vs day vs `--fresh`).
- Preview command strings for every Start / Replay / view / compare variant in the mapping table, using `npm run slate` and the `ODDS_SOURCE=` prefix when needed.
- Settings load/save as in Task 3, including a missing `runs/` folder and junk JSON.
- Entry-routing helpers: bare args, `--no-splash`, `--tui` with a date, `--fresh` as a bypass, `--slate` vs `--tui`, and the "slate args" detector not firing on an implicit default model.
- Logo widths (56 / 48) and reveal-frame snapshots at progress 0, 0.5, and 1, with and without bold.
- Options / header rendering at 80, 100, and 120 columns: no line exceeds the width.
- `setOddsFresh` does not leak across runs.

Do not add [`ink-testing-library`](https://www.npmjs.com/package/ink-testing-library) (4.0.0, last published 2024-05-22, 5:51 AM America/Chicago).

Manual checks, because mouse bytes and animation need a real TTY: run `npm start` in VS Code's integrated terminal (not the Debug Console). Confirm the wipe, a mid-animation skip, click Run, `q` on the slate returning to options, and `q` / `Esc` / **Quit** on the options screen restoring the terminal. Also confirm `npm run slate` still opens the slate directly.

## Risks and open questions

### Risks

- **Stdin / mouse restore.** A missed `restore()` before `showSlate`, or a path that sets stdin to utf8, will corrupt mouse input or leave the user's terminal raw. Share one restore path and test Ctrl-C during splash, form, and mid-run, plus `q` from the slate back to the form and then out.
- **`--fresh` today is argv-only.** If Task 2 is skipped and the TUI only sets a form flag, Start + Fresh will silently keep using the cache.
- **`ODDS_SOURCE` is process-global.** Restore the previous env value after a run so a later Replay or a second Start in the same TUI session cannot stick to the wrong book.
- **Run lock.** The lock must not be held while the user is only sitting on the options screen. Acquire it when Start / Replay actually begins, and release it when `runSlate` finishes (including after the slate screen closes), before the form is shown again.
- **Returning to the form after `showSlate`.** `presentScreen` pauses stdin on exit. Re-entering the form must enable raw mode and mouse again.
- **Routing surprises.** `readStartArgs` always defaults `model` to `jev`. The bypass detector must look at raw argv, or every `npm start` would be treated as a direct run.
- **Splash flicker or leftover cursor.** Write frames with cursor addressing; hide the cursor; on skip, cancel the timer so a late frame does not draw over the options screen.
- **Long Start runs.** v1 progress is ordinary terminal output. The form goes away during the walk and comes back after the slate closes. Do not try to multiplex two alt screens in v1.
- **README breakage.** Every current "run `npm start`" sentence that means "build a slate" must be updated, or users will sit in the TUI and think it failed.

### Open questions

1. Is a sport/league filter in scope? The CLI always walks every board in `sports/index.ts`. Adding a filter is useful but is new behavior, not a wrapper around an existing flag.

## Out of scope for v1

- Changing gates, ticket rules, or adding a paid odds source ([FUTURE-IDEAS.md](https://github.com/BenCully/parlay-slate/blob/main/FUTURE-IDEAS.md) leave-alone list).
- Editing `.env` or `.env.settings` from the TUI.
- Spawning a browser or any GUI.
- Making `npm test` / `typecheck` items in the menu.
- Rewriting the existing slate screen in Ink or OpenTUI.
- A home-level `~/.parlay-slate.json`.

## Progress

Implemented on `clickability` (2026-11-20). The plan was written against `97eb0f0`, before the live Odds API call was removed. The launcher follows the sources on this branch.

- Alt screen, raw stdin, and mouse parsing live in `ui/term.ts`. `presentScreen` uses that session. `q` and the x button close the slate. Ctrl-C reports an interrupt so a launcher-opened slate can exit instead of returning to the options.
- `runSlate` is exported from `scripts/parlays.ts`. `readStartArgs` returns `fresh`. `setOddsFresh` bypasses the odds cache and is cleared when the run finishes. View, compare, and clear export the same functions the CLI scripts call.
- `runs/tui-settings.json` is version 1, written after a successful Start, Replay, View, or Compare. A missing or unreadable file uses defaults. Unknown keys are ignored. A version above 1 still reads the v1 fields.
- The splash is the checked-in Standard and Small figlet art, a 1200 ms column wipe, and a 300 ms hold. `--no-splash` skips it. `PARLAY_SLATE_NO_ANIM` holds a still logo. `NO_COLOR` keeps the wipe and drops bold and color.
- The options screen lists Start slate, Replay saved odds, View last run, View snapshot, Compare snapshots, List saved odds, and Clear snapshots. Odds sources are All books, FanDuel, DraftKings, BetMGM, Caesars, and The Odds API. A live start cannot use The Odds API, because that source only opens old saves. Fresh rereads the books. The key line names `TYPESAFE_API_KEY`, `AUTOJEV_URL`, and `AUTOJEV_API_KEY` and does not print values. `ODDS_API_KEY` is not required.
- `scripts/start.ts` is `npm start`. `scripts/tui.ts` is `npm run tui`. `npm run slate` stays the direct run. After a slate, compare, or odds list closes, the options screen comes back. Clear snapshots asks for a yes. The options screen does not hold `runs/slate.lock`.
- README, AGENTS.md, and `.vscode/launch.json` describe the launcher. Start slate launches `scripts/start.ts`. Run slate launches `scripts/parlays.ts`. Open TUI launches `scripts/tui.ts`.
- A sport or league filter was left out. The walk is still every board in `sports/index.ts`.
