# Terminal test plan

The first suite landed on 2026-11-20. `npm test` runs it. The sections below the status are the decision record: why this driver, what was rejected, and what is still out of scope.

## Status

| Piece | Where it landed |
| --- | --- |
| Driver | `@microsoft/tui-test` 0.1.1, exact, devDependency. Backend `alacritty`. |
| Suite | `test/screen.test.ts`, inside `npm test` (`test/*.test.ts`). No `test:pty` script and no skip variable. |
| Fixture | `test/fixtures/slate.json`. Not `runs/last-run.json` or `snapshots/`. |
| Launcher path | `npm run tui -- path.json` selects View snapshot for that file and does not write the path to `runs/tui-settings.json`. |
| Checks | `npm test` (64) and `npm run typecheck` passed with the network off. A clean `npm ci` on this Mac loaded the native library. Nothing was pushed. |

The Alacritty click landed on NCAA, Props, and the close button. The xterm.js session and the `node-pty` plus `@xterm/headless` harness were not added.

## What the suite does

Each test has its own `withTerminal` from `@microsoft/tui-test/test`. The child is `node --import tsx`, the same runner as the scripts, with `cwd` at the package root, `TERM=xterm-256color`, and `PARLAY_SLATE_NO_ANIM=1`. `withTerminal` opens a shell when `program` is omitted, so the suite passes `program` instead of calling `terminal.run` on an already open session. The spawn is the one the plan described.

A node:test timeout of 120 seconds wraps each test. The driver timeouts are 20 seconds for text, 15 for exit, and 30 for the command. A failed assertion writes a text dump under `/tmp/parlay-slate-tui`.

`PARLAY_SLATE_NO_ANIM=1` holds a still logo. It does not skip the splash. The launcher tests wait for `Start slate`, which appears after the 1500 ms hold.

### Fixture

`test/fixtures/slate.json` is a `SavedSlate` with `model` `jev` and no `oddsSource`. Omitting the source keeps the corner small enough that the six full sport names fit at 100 columns. The content width is `columns - 1`, so that check is a 99-column header. At 70 columns the header is 69 wide and the names shorten.

Sports, in order: Football (NFL and NCAA), Soccer (Premier League), Hockey (NHL), Basketball (NBA), Baseball (MLB), Formula 1 (F1). NCAA is the second league under Football, not a second sport. The NFL Games page is 36 lines. `NFL slate marker` is line 0. `Later Team` is line 26, just past the 26-line body on a 30-row terminal with three header rows. `Omega Team` is line 34. The fixture has no letter `x`, so the close button is the only `x` on the slate.

### Cases

1. **Click lands.** Wait for `Football` and `Games`. Click `NCAA`. That label is inverse, and `NCAA games marker` is visible. Click `Props`. That label is inverse, and `NCAA props marker` is visible. Click `x`. `waitExit` returns.
2. **Keyboard matches the click.** On a fresh session, `]` makes `Soccer` inverse and `2` makes `Props` inverse, with `Soccer props marker` visible. `q` exits.
3. **Wheel and drag.** `Later Team` starts hidden. `mouse.scroll("down")` shows it and hides `NFL slate marker`. A drag from the bottom of the `█` / `░` column to its top shows the marker again and hides `Later Team`. The driver's default scroll amount in 0.1.1 is 3, and the app moves three lines per wheel report.
4. **Width.** At 100 columns the first row contains Football, Soccer, Basketball, Baseball, and Formula 1, and it does not contain ` FB `. `resize(70, 30)` shows `FB`, `Soc`, `Hockey`, `Bask`, `Base`, and `F1`, and hides the long names. The last terminal column stays blank at both sizes, which is the `columns - 1` rule.
5. **Launcher return.** `scripts/tui.ts` with no arguments shows `Start slate`. `q` exits. The test does not activate Start, Replay, or Clear snapshots. A second session passes the fixture path. `View snapshot` is the inverse action, `Start slate` is not, and `slate.json` is on screen. `r` opens the slate. `q` brings `Start slate` back and hides `Football`. A second `q` exits.
6. **Ctrl-C.** The same launcher view, then `Ctrl+C`. The process exits instead of returning to the options screen. This was listed with the behavior that needed a PTY. It is the extra case beyond the original five.

Inverse cells use `getByText(label).getByStyle({ inverse: true })`. Version 0.1.1 does not ship `expectMode`. `getExitCode()` and `expectExitCode()` report no command exit code for `run()`, including `process.exit(0)`, so the suite uses `waitExit()`.

## Launcher change the view case needed

The snapshot list is the real `snapshots/` directory, which CI does not have. `scripts/view.ts` already opens a `.json` path. The launcher now does too.

- `classifyStart` leaves a `.json` argument on the launcher prefill. It is not a slate argument.
- `applyPrefill` sets the action to `view-snapshot` and the snapshot to `resolve(path)`.
- `settleForm` and `formIssues` keep that path when it is not one of the saved snapshot names. The options screen shows it as a snapshot choice.
- `persistsForm` returns false for that path, so a one-off view does not replace `runs/tui-settings.json`.

Mouse tracking, hit coordinates, and the non-TTY text fallback were not changed.

## Install

Koffi 3.3.8 is the native addon. `npm ci` warns that its install script is not in `allowScripts`. The library still loads: Koffi resolves `@koromix/koffi-<platform>-<arch>` before the copy the script would make. `allowScripts` stays `esbuild` and `fsevents`. The lockfile includes `@microsoft/tui-test-linux-x64-gnu` and `@koromix/koffi-linux-x64` for the Ubuntu checker. The clean `npm ci` check was this Mac, not Ubuntu.

## Still out of scope

- Start slate, replay, compare, and clear snapshots from the launcher. Those need a temp copy of `runs/`, `snapshots/`, and `odds-cache/`, and they must not touch the user's real files.
- Splash frames. `planSplash` and `sliceLogo` cover the frames. A PTY test of the 30 fps wipe is a timer test.
- Decision rows, slip text, and the 0.60 / 0.80 gates. Those stay in `test/pure.test.ts`.
- Pixel snapshots as the pass condition. `expectSnapshot` can lock a screen later. The failure text dump is enough for now.
- Charmbracelet VHS. A tape is a reasonable README demo later. Generate it locally. Do not fail CI on the image.
- `ink-testing-library`, and a second runner. The screen is not Ink. The PTY tests stay `node:test`.
- A live `npm start` or `npm run slate` inside a test.

## Decision record

Versions were checked on 2026-11-20. The useful combination is two layers:

| Layer | Tool | What it owns |
| --- | --- | --- |
| Logic and layout strings | `node:test` in `test/pure.test.ts` and `test/tui.test.ts` | Parsing, gates, cache, form reducer, logo frames, header text at 80, 100, and 120 columns |
| What a terminal user sees and clicks | `@microsoft/tui-test`, still invoked from `node:test` | Alt screen, SGR mouse, wheel, drag, resize, quit, and the return to the options screen |

`presentScreen` prints plain text and returns when stdout or stdin is not a TTY. An agent shell takes that path. That printout is not a mouse test. The PTY suite is what covers the alt screen, SGR mouse (`\x1b[?1000h\x1b[?1002h\x1b[?1006h`), Buffer stdin, tab clicks, the wheel, the scrollbar, resize, `q` returning to the options screen, and Ctrl-C leaving a launcher-opened slate.

### Why this driver

`@microsoft/tui-test` 0.1.1 was published 2026-10-23. MIT. ESM. `engines.node` is `>=20`, which satisfies `>=22.23.4` and `engine-strict=true`. It is a PTY plus a terminal emulator. The package calls that engine through Koffi. Platform binaries ship as optional dependencies. There is no CLI and no extra download at test time.

The mouse API is 0-based cells. The engine turns that into SGR 1006, whose wire coordinates are 1-based. The header hits in `paintHeader` are 1-based. The options screen subtracts 1 before it compares with its 0-based hits (`ui/tui/session.ts`). The first click proved that translation for Alacritty. If a later click misses, switch that one session to `backend: "xtermjs"` before writing a second harness.

### Why not VHS

Charmbracelet VHS 0.12.1 (2026-09-24, MIT) is a Go binary. Its tape language can type and wait. It cannot click, drag, or send a mouse wheel to the application. `ScrollUp` and `ScrollDown` move the recorder's viewport. A golden GIF also depends on timing and the font of the machine that records it. That misses the reason to add a terminal test.

### Why not a hand-rolled PTY

`node-pty` 1.1.0 has no Linux prebuild, and 1.2 was still beta. `@xterm/headless` 6.0.0 does not click. A test that writes `\x1b[<0;col;rowM` itself checks the parser against bytes the test invented. It does not check that a terminal, after seeing `?1006h`, sends those bytes. Wide characters are part of that risk: `ui/table.ts` notes that `❌` is two columns, and the width tables do not always agree. Write that harness only after an `@microsoft/tui-test` click misses. Do not add both.
