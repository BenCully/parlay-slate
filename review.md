# Review

Reviewed 2026-11-20 against branch `clickability` (3 commits over `origin/main`: `c82f7e9`, `c4e7281`, `721ca58`).

Part 1 is the pull request. Part 2 is the rest of the app. Every finding has a **Fix path**: the change in order, the files it touches, and the test that should prove it. A fix that changes a rule in `AGENTS.md` says so, because those rules don't change without your OK. Each code change also needs a `changelog.md` entry, per `AGENTS.md`.

---

## For the agent reconciling this review

Track all of your work in this file. A later session, or Ben, should be able to open `review.md` and see what's done, what's in progress, what's blocked, and why, without reading the chat.

### Rules

1. **Read `AGENTS.md` first.** Its rules win over this file. A fix path marked as changing an `AGENTS.md` rule needs Ben's OK before you start it. Mark it `Needs decision` until he answers.
2. **Before you start a finding,** set its row in the tracker to `In progress` and save the file.
3. **When you finish a finding,** in the same turn:
   - set its row to `Done`
   - fill in **Change**: files touched, and the commit hash if you committed
   - fill in **Check**: the test you added and the commands you ran, with results, for example `npm test 71/71, npm run typecheck clean`
   - add a line to the work log below
4. **When you stop partway, or can't finish,** set the row to `Blocked` or `Partial` and say why in **Notes**: what you tried, what failed, and what's needed next.
5. **When you disagree with a finding,** or it turns out wrong, set it to `Won't fix` or `Not a bug`, and give the evidence in **Notes**. Don't delete the finding or its fix path.
6. **When you find something new,** add a row with the next free ID in that area (for example `O-12`). Add a short section under the matching heading, in the same format: problem, then **Fix path**.
7. **Don't rewrite the findings.** Change only the tracker, the work log, and the status line under a finding heading. The original text stays as the record of what was reviewed.
8. **Don't record secrets here.** No keys, no `AUTOJEV_URL`, and no request URLs that carry a key, per `AGENTS.md`.
9. **After each code change,** run `npm test` and `npm run typecheck`, and add a `changelog.md` entry.
10. **Commit or push only when Ben asks.**

Status values: `Open`, `In progress`, `Done`, `Partial`, `Blocked`, `Needs decision`, `Won't fix`, `Not a bug`.

### Tracker

Each ID matches the tag in that finding's heading below.

| ID | Sev | Finding | Status | Change | Check | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PR-1 | High | Ctrl-C during the splash doesn't exit | Done | `ui/tui/splash.ts`, `ui/tui/launch.ts`, `test/screen.test.ts`, `test/tui.test.ts`. Not committed. | `npm test` 68/68, `npm run typecheck` clean. Splash test asserts exit 130. tui-test 0.1.1 does not report a `run()` code, so a wrapper writes the child's code. | |
| PR-2 | High | Clear snapshots is two Enters away | Done | `ui/tui/options.ts`, `test/tui.test.ts`. Not committed. | Same run as PR-1. Enter, Enter stays `effect: none` and `confirm: false`. Tab, Enter and `y` `e` `s` Enter return `clear`. | Hint now says to type yes or tab to Yes. |
| PR-3 | Low | PR description: "one alt-screen session" | Blocked | | | `gh` is installed and logged in as BenCully. `gh pr list` shows no open pull request, and no pull request for `clickability`. The replacement sentence is in the work log. |
| PR-4 | Medium | `q` inside a dialog quits the launcher | Done | `ui/tui/options.ts`, `test/tui.test.ts`. Not committed. | Same run as PR-1. `q` closes the picker and the confirm. Header x still returns `quit`. | |
| PR-5 | Low | Saved Eastern day goes stale | Open | | | |
| PR-6 | Low | Alt-key press waits for the next key | Open | | | |
| PR-7 | Low | Ctrl-C during a launcher run leaves the lock | Open | | | Optional |
| PR-8 | Low | Screen can flash between the splash and options | Open | | | Optional |
| B-1 | Medium | Gate and ticket pipeline has no test | Open | | | Land before the board fixes |
| B-2 | Medium | `Take` printed under 0.80 | Done | `slate/board.ts`, `props/board.ts`, `AGENTS.md`, `README.md`, `test/pure.test.ts`. Not committed. | `npm test` 78/78, `npm run typecheck` clean. Review moneyline is `Lean Chiefs -150`. Ready stays `Take`. A contradicted spread under 0.80 is `Lean Bills +3.5`. | Ben chose Lean. `Lean` is the same width as `Take`. A save already written keeps its stored slip. |
| B-3 | Low | `readStartArgs` treats a stray word as the date | Done | `decisions/judge.ts`, `test/pure.test.ts`. Not committed. | `npm test` 78/78, `npm run typecheck` clean. | A `.json` path is still a view file, so `npm run tui -- path.json` keeps working. |
| B-4 | Low | `requireRunKeys` unused parameter | Done | `decisions/judge.ts`, `scripts/parlays.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. | |
| B-5 | Low | `teamShorts` module-level state | Open | | | |
| B-6 | Low | Favorite gate includes the vig | Open | | | Docs only |
| S-1 | Medium | `scrubError` only strips `apiKey=` | Open | | | |
| S-2 | Low | `writeAtomic` defined twice | Done | `scripts/snapshot.ts`, `scripts/parlays.ts`. Not committed. | Same run as B-3. | |
| S-3 | Low | Run lock is a pid file | Open | | | Optional |
| W-1 | Medium | `scoreboardEvents` bad JSON throws | Done | `slate/window.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. HTML body returns `stamps: []`. | |
| C-1 | Low | CI Node version doesn't match local | Open | | | |
| C-2 | Low | Pseudoterminal tests unconfirmed on Linux CI | Open | | | Check the PR's Check run |
| P-1 | High | Extra prop picks a tiny under or an off-block player | Done | `props/board.ts`, `sports/soccer/index.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. | Non-soccer extras must be featured and at least 0.60. The missing-row copy already says there is no other short-priced prop. Soccer still falls through. |
| P-2 | Medium | Tiny-under filters miss rare stats | Done | `sports/basketball/index.ts`, `sports/baseball/index.ts`, `sports/hockey/index.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. | |
| P-3 | Medium | No ESPN concurrency limit | Open | | | |
| P-4 | Medium | NFL, NCAA, and soccer windows copied, keep finished games | Open | | | |
| O-1 | High | FanDuel props never read in a merged run | Done | `odds/direct.ts`, `odds/fanduel.ts`, `odds/draftkings.ts`, `odds/betmgm.ts`, `odds/caesars.ts`, `test/pure.test.ts`. Not committed. | `npm test` 69/69, `npm run typecheck` clean. `bookEventId` covers a combined id, a plain id, an empty FanDuel part, and an encoded id. Empty FanDuel part makes no fetch. | Also covers the combined-id half of O-L3. |
| O-2 | High | Merged props read keeps one book's event | Done | `odds/direct.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. FanDuel and DraftKings props both come back when the names differ. | |
| O-3 | High | Dated run can show another day's games | Done | `odds/cache.ts`, `AGENTS.md`, `README.md`, `test/pure.test.ts`. Not committed. | Same run as B-3. An 11-22 `cacheOnly` read of an 11-21 save is `skipped`. | |
| O-4 | High | Partial and empty merged reads cached 168 hours | Done | `odds/cache.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. A partial file 31 minutes old is `skipped`. The same file 5 minutes old hits. | |
| O-5 | High | BetMGM puts every baseball league in MLB | Done | `odds/betmgm.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. MLB name kept, LIDOM dropped. | No `betmgm-` baseball file in `odds-cache/`, so the filter is competition name `MLB` until an id can be read in season. |
| O-6 | Medium | In-memory book caches never expire | Done | `odds/draftkings.ts`, `odds/betmgm.ts`, `odds/direct.ts`, `scripts/parlays.ts`, `test/pure.test.ts`. Not committed. | Same run as PR-1. Second DraftKings read does not fetch; after `resetBookReads` it does. BetMGM session and caches drop to empty. Spread copy does not mutate the cached fixture. | FanDuel and Caesars keep no in-memory price cache, so `resetBookReads` only clears DraftKings, BetMGM, and `resetMergedBooks`. |
| O-7 | Medium | Doubleheader merges into one game | Open | | | |
| O-8 | Medium | One-sided market beats a complete one | Done | `odds/books.ts`, `slate/board.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. A one-outcome FanDuel moneyline loses to a two-outcome DraftKings line. | |
| O-9 | Medium | `pickBalanced` prefers an alternate line | Done | `odds/fanduel.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. `-110/-110` beats `+100/-125`. | |
| O-10 | Medium | Spread pairing drops PK and self-pairs | Done | `odds/lines.ts`, `test/pure.test.ts`. Not committed. | Same run as B-3. | |
| O-11 | Medium | FanDuel bypasses the shared HTTP code | Open | | | |
| O-L1 | Low | BetMGM curl arguments | Open | | | |
| O-L2 | Low | Caesars `dataPath` unchecked | Open | | | |
| O-L3 | Low | Duplicated odds code | Partial | Combined-id parsing now uses `bookEventId` (O-1). | | Placeholder events and FanDuel's own price parser are still open. |
| O-L4 | Low | Odds type-safety holes | Open | | | |
| O-L5 | Low | `QUOTA_LOG` doubles as a path | Open | | | |
| O-L6 | Low | Dead code | Open | | | |
| O-L7 | Low | Caesars spread sign unverified | Open | | | Needs a saved Caesars file |

### Work log

Add one line per finding you touch, newest at the bottom: the UTC time, the ID, the new status, and one sentence on what changed or why it's blocked.

```
YYYY-MM-DDTHH:MM:SSZ  ID  Status  What changed, or why it stopped
```

2026-11-20T17:31:14Z  PR-1  Done  Ctrl-C during the splash restores the terminal and exits 130. Any other key still skips the logo.
2026-11-20T17:31:14Z  PR-2  Done  Clear snapshots opens on No. A second Enter cancels. Tab to Yes, typing yes, or clicking Yes still clears.
2026-11-20T17:31:14Z  PR-4  Done  q and Esc close the date picker and the confirm. The x button still quits the launcher.
2026-11-20T17:31:14Z  O-6  Done  runSlate clears DraftKings and BetMGM memory caches. Soccer spreads are copied onto a new fixture.
2026-11-20T17:31:14Z  PR-3  Blocked  No open pull request, and gh is not installed. Use: "The splash, the options screen, and the slate use one terminal layer in ui/term.ts. Progress from a run prints on the normal screen between the options and the slate."
2026-11-20T17:31:14Z  B-2  Needs decision  Take versus Lean under 0.80 changes the AGENTS.md slip rule. Left for Ben.
2026-11-20T18:03:52Z  B-2  Done  Ben chose Lean. A supported verdict under 0.80 says Lean. Take stays for 0.80 or better.
2026-11-20T17:34:27Z  O-1  Done  bookEventId splits a merged prop id. An empty FanDuel part makes no request.
2026-11-20T17:34:27Z  O-L3  Partial  Combined-id parsing now uses bookEventId. Placeholders and the FanDuel price parser remain.
2026-11-20T17:59:57Z  PR-3  Blocked  gh is installed. There is still no open pull request, and none for clickability.
2026-11-20T17:59:57Z  O-2  Done  A props read joins every book's markets. A row with no price is left out.
2026-11-20T17:59:57Z  O-3  Done  A reused slate keeps games inside the new kickoff window. AGENTS.md says that.
2026-11-20T17:59:57Z  O-4  Done  A partial merged read is fresh for 30 minutes. An empty partial slate is not stored.
2026-11-20T17:59:57Z  O-5  Done  BetMGM baseball matches competition name MLB. No saved file had a competition id.
2026-11-20T17:59:57Z  O-8  Done  A one-sided moneyline, spread, or total loses to a complete line.
2026-11-20T17:59:57Z  O-9  Done  pickBalanced scores the pair's no-vig price, then the vig.
2026-11-20T17:59:57Z  O-10  Done  Spreads pair a team with the other team's opposite number, including pick'em.
2026-11-20T17:59:57Z  P-1  Done  Non-soccer extras stay on a featured player at 0.60 or better. Soccer can still fall through.
2026-11-20T17:59:57Z  P-2  Done  Unders on NBA blocks and steals, MLB stolen bases, and NHL power-play points are not extras.
2026-11-20T17:59:57Z  W-1  Done  An unreadable ESPN scoreboard returns no events.
2026-11-20T17:59:57Z  B-3  Done  A bad date or unknown flag throws. A .json path is still a view file.
2026-11-20T17:59:57Z  B-4  Done  requireRunKeys no longer takes the unused replay flag.
2026-11-20T17:59:57Z  S-2  Done  writeAtomic is exported from scripts/snapshot.ts.

### Status line under each finding

When a finding changes status, add one line directly under its heading:

> **Status:** Done, 2026-11-21T15:00:00Z. See tracker.

---

## Part 1: The `clickability` pull request

### Verdict

The PR mostly does what its description says. Two issues should be fixed before merging: Ctrl-C during the splash, and the Clear snapshots confirm. One sentence in the description is wrong.

### What was run

- `npm run typecheck`: clean.
- `npm test`: 64 of 64 pass, including the 7 tests that drive the screen in a pseudoterminal.
- Clean `npm ci` in a fresh git worktree: installs, and all 64 tests pass. Koffi loads from `@koromix/koffi-darwin-arm64`, and the lockfile also has the Linux x64 prebuild that CI needs. npm warns that koffi's install script isn't in `allowScripts`. That is expected, because the prebuild package makes the script unnecessary.
- The real `npm` commands, driven through a Python pseudoterminal with a `pyte` screen emulator, sending keys and SGR mouse clicks.
- Three live runs, all `model=jev` (Autojev was offline):
  - Launcher, Start slate, Current slate, Jev, All books, then click Run. `runs/slate.lock` was held during the run and gone afterward. `q` returned to the options with "Saved the slate.", and a second `q` exited with code 0.
  - `npm run slate -- odds=2026-11-19 model=jev` opened the slate directly, with no launcher, and `q` exited with code 0.
  - Bare `npm start | cat` printed about 9,200 lines of text, with no alternate screen and no launcher. Decisions came back: 70 `Take` rows and no `No call` rows.

### Claims that held

| Claim | Result |
| --- | --- |
| Splash, then the options screen | Pass |
| `--no-splash` skips the logo | Pass |
| `PARLAY_SLATE_NO_ANIM` shows a still logo | Pass (no wipe frames before the hint) |
| `q`, Esc, Quit, and the x button leave the launcher | Pass, exit 0, terminal restored (alternate screen, mouse, cursor, color) |
| Ctrl-C on the options screen | Pass, exit 130, terminal restored |
| The options screen does not hold `runs/slate.lock` | Pass |
| A live start cannot use The Odds API | Pass ("Choose Replay saved odds.") |
| Slate, compare, and saved-odds list return to the options on `q` or x | Pass |
| Esc closes only an open dialog (date picker, clear confirm) | Pass |
| `npm run tui` exits 1 without a terminal | Pass |
| `npm run tui -- path.json` fills in View snapshot and doesn't save the path | Pass |
| Resize to 70 columns keeps lines within `columns - 1` | Pass (widest 69) |
| A same-size resize doesn't repaint | Pass (0 bytes written) |
| Last-used options persist in `runs/tui-settings.json` | Pass |
| Clear snapshots removes `snapshots/` entries | Pass (run in the worktree, not the real folder) |
| `npm run slate` still opens the slate directly | Pass |
| A pipe with no slate arguments prints text | Pass |

### Issues to fix

#### [PR-1] Ctrl-C during the splash doesn't exit

> **Status:** Done, 2026-11-20T17:31:14Z. See tracker.

In `ui/tui/splash.ts`, `onKey()` calls `finish()` for every key, so Ctrl-C only skips to the options screen. The description says Ctrl-C restores the terminal and exits.

**Fix path**
1. In `playSplash` (`ui/tui/splash.ts:84`), add `let interrupted = false`. In `onKey(key)`, when `key === '\u0003'`, set `interrupted = true` and call `session.restore()` with no options, so the terminal fully leaves the alternate screen. Any other key keeps calling `finish()`.
2. Make `playSplash` return `Promise<'done' | 'interrupt'>` with `.then(() => (interrupted ? 'interrupt' : 'done'))`.
3. In `launchTui` (`ui/tui/launch.ts:42`), replace `await playSplash()` with `if ((await playSplash()) === 'interrupt') process.exit(130);`.
4. Test: add a case to `test/screen.test.ts` that starts `npm start` with `PARLAY_SLATE_NO_ANIM=1`, sends `\x03` before the options screen appears, and asserts exit 130 and no "Start slate" on screen. Add a unit check in `test/tui.test.ts` that the splash player still skips on an ordinary key.

#### [PR-2] Clear snapshots is two Enters away

> **Status:** Done, 2026-11-20T17:31:14Z. See tracker.

`requestRun` opens the confirm with `confirmFocus: 'yes'`, and `reduceConfirm` clears on Enter when focus is Yes. Enter on Run, then Enter again, deletes every file in `snapshots/`, archive included, with no "yes" typed.

**Fix path**
1. In `requestRun` (`ui/tui/options.ts:224`), open the dialog with `confirmFocus: 'no'`.
2. Leave `reduceConfirm` (`:242`) as is. Enter clears only when the user has moved focus to Yes, or has typed `yes`. Clicking `[ Yes ]` still clears.
3. Optional: show "type yes, or tab to Yes" in `hintFor` when the confirm is open.
4. Test in `test/tui.test.ts`: from Clear snapshots, `reduceForm` with Enter, then Enter again, must return `effect: { type: 'none' }` with `confirm: false`. Tab then Enter must return `{ type: 'clear' }`, and so must `y`, `e`, `s`, Enter.

#### [PR-3] The description says the slate and launcher "share one alt-screen session"

> **Status:** Blocked, 2026-11-20T17:59:57Z. See tracker.

They don't. Each `withAltScreen` call enters and leaves the alternate screen. Only the splash passes `leaveAlt: false` to keep it up for the options screen. Between the options and the slate, the run's progress lines print on the normal screen, which is a reasonable behavior.

**Fix path**
1. Edit the PR description. Replace the sentence with: "The splash, the options screen, and the slate use one terminal layer in `ui/term.ts`. Progress from a run prints on the normal screen between the options and the slate."
2. No code change.

#### [PR-4] `q` inside a dialog quits the whole launcher

> **Status:** Done, 2026-11-20T17:31:14Z. See tracker.

In `reducePicker` and `reduceConfirm`, `q` returns `{ type: 'quit' }`. On the slate, compare, and list screens, `q` means back. The picker hint only mentions Esc.

**Fix path**
1. In `reducePicker` (`ui/tui/options.ts:275`), make `q`/`Q` return `{ ...state, picker: false }` with `effect: { type: 'none' }`, the same as Esc.
2. In `reduceConfirm` (`:251`), make `q`/`Q` close the dialog like Esc.
3. Update `hintFor` (`:104`) to "q / esc closes" for the picker and the confirm.
4. Update the "Esc closes only the open dialog" test in `test/tui.test.ts` to cover `q` too. The x button still quits the launcher, so the user always has a one-click exit.

### Smaller notes

- **[PR-5] The saved Eastern day goes stale.** `runs/tui-settings.json` keeps the last Eastern day, so the next morning the launcher still shows yesterday's date with Eastern day selected.
  **Fix path:** in `formFromSettings` (`ui/tui/commands.ts:68`), use `settings.day` only when it is today or later. Otherwise use `today` and set `dateMode: 'current'`. Test in `test/tui.test.ts` with a saved day in the past.

- **[PR-6] An Alt-key press waits for the next keystroke.** `takeEvents` (`ui/term.ts:66`) breaks when the buffer is an escape plus one byte, such as `\x1b` + `q`. The 200 ms lone-escape timer only covers a single `\x1b`. It's harmless today, because nothing binds Alt.
  **Fix path:** before the `pending.length < 3` check, emit `\x1b` and let the next byte parse as its own key when `pending.length >= 2`, `pending[1]` is neither `[` nor `O`. Add a `takeEvents` unit test for `Buffer.from('\x1bq')`.

- **[PR-7] Ctrl-C during a launcher run leaves the lock behind.** The launcher runs the slate with the terminal in normal mode, so Ctrl-C kills the process before `finally` releases `runs/slate.lock`. The next run reclaims the stale lock, which matches the old `npm start` behavior.
  **Fix path (optional):** in `runSlate` (`scripts/parlays.ts:84`), right after `acquireRunLock`, add a `process.once('SIGINT', ...)` that removes the lock with `rmSync` and exits 130, and remove that listener in `finally`.

- **[PR-8] The screen can flash between the splash and options.** The splash and options screens enter and exit alternate-screen mode in quick succession, which on a slow terminal can show the normal screen for a frame.
  **Fix path (optional):** when the options screen closes for View, View snapshot, or Compare (no progress output), have `showOptions` restore with `leaveAlt: false`, so the slate opens without leaving the alternate screen. Keep the full restore for Start and Replay, which print progress.

---

## Part 2: The rest of the app

Severity is High, Medium, or Low. File references are on the `clickability` branch.

### Decisions and the board (`decisions/judge.ts`, `slate/board.ts`)

#### [B-1] Medium. The gate and ticket pipeline has no test

`test/pure.test.ts` covers `implied`, `toDecimal`, the slip helpers, and `droppedCall`, but not `buildBoardInner` (`slate/board.ts:403`). That function enforces:
- the 0.60 favorite gate
- rerank `topK` 8 at 0.60
- verify at 0.80
- one leg per game
- 2- and 3-leg tickets
- the top 10 by implied product

Those are the rules `AGENTS.md` says must not change, and nothing pins them.

**Fix path** (no production code change needed):
1. In a new `test/board.test.ts`, point `ODDS_CACHE_DIR` at a temp directory, and write one cache record whose `request` matches the slate URL that `getLegs` builds (`slate/board.ts:73`). Use the same record shape `odds/cache.ts` `store` writes, and include games at about 0.55, 0.62, 0.70, and 0.80 implied.
2. Build a fake `BoardSource`:
   - `window` returns a fixed `{ from, to, label }`.
   - `getBrief` returns a canned `GameBrief`.
   - `profile: null`, so no prop requests are made.
3. Call `selectDecisionModel('tail-jev')`, set `AUTOJEV_URL=http://stub/v1` and `AUTOJEV_API_KEY=test`, and replace `globalThis.fetch` with a stub. The stub answers `noul` with a relevance chosen by the item text, and `choice` with a verdict and probabilities chosen by the claim id. This drives the real `rerank` and `verify` code with no network.
4. Assert:
   - the 0.55 game never appears
   - a relevance of 0.59 is `Dropped 0.59`
   - a ninth game above 0.60 is the `cap` case
   - supported at 0.79 is `Review` and not in a ticket
   - two Ready legs make one 2-leg ticket
   - no ticket has two legs from the same game
   - at most 10 tickets come out
5. Restore `fetch` and the env in `t.after`.

#### [B-2] Medium. A supported verdict under 0.80 still prints `Take`

> **Status:** Done, 2026-11-20T18:03:52Z. See tracker.

`moneylineSlip` and `spreadSlip` (`slate/board.ts:241`, `:250`) check only `verdict === 'supported'`, so a `Review 0.55` row says `Take Chiefs -150`. That matches the `AGENTS.md` rule ("Take only when verify verdict is supported"), but it reads like a recommendation the 0.80 gate rejected, and only Ready legs make tickets.

**Fix path** (this changes a documented rule, so it's your call first):
1. Pass the check's `status` into `moneylineSlip`, `spreadSlip`, and `totalSlip`. Return `Take ...` for `ready`, `Lean ...` for `review` plus `supported`, and keep `Pass` otherwise. The contradicted spread becomes `Lean <opponent>` under 0.80.
2. Update the slip rule in `AGENTS.md`, the slip examples in `README.md`, and the slip tests in `test/pure.test.ts`.
3. Run `npm run view` at 80 and 120 columns to confirm the Slip column still fits.

#### [B-3] Low. `readStartArgs` treats any stray word as the date

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`decisions/judge.ts:70`. `npm start -- 11/20` or `npm start -- --freshh` makes `day` that word. Every sport then throws "Date must be YYYY-MM-DD." inside its own board, and the run ends with "No sport produced a board." A second positional argument is silently ignored.

**Fix path**
1. In `readStartArgs`:
   - Throw `Unknown option "<arg>". Use --fresh, model=, or odds=.` for any argument starting with `--` that isn't one it knows.
   - Throw `Date must be YYYY-MM-DD.` when `positional[0]` fails `/^\d{4}-\d{2}-\d{2}$/`.
   - Throw `Pass one date.` when `positional.length > 1`.
2. `scripts/route.ts` already sends unknown arguments to the launcher's prefill, and `applyPrefill` shows the error from `readStartArgs`, so the launcher path needs no change.
3. Test in `test/pure.test.ts`: `readStartArgs(['11/20'])`, `['--freshh']`, and `['2026-11-20', '2026-11-21']` each throw.

#### [B-4] Low. `requireRunKeys(model, _replay)` has an unused parameter

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`decisions/judge.ts:100`.

**Fix path:** drop `_replay`, update the call in `scripts/parlays.ts:96` and the calls in `test/pure.test.ts`, and run `npm run typecheck`.

#### [B-5] Low. `teamShorts` is module-level mutable state

`slate/board.ts:125`. It's set in `buildBoardInner` and cleared in `finally`. That's safe while boards build one at a time, but two `buildBoard` calls running together would mix up short names.

**Fix path**
1. In `buildBoardInner`, build `const shorts = new Map<string, string>()` locally, and make `nick` a closure, `const nick = (name) => shorts.get(name) ?? lastWord(name)`.
2. Pass `nick` into the comment and slip helpers. For the exported `moneylineSlip` and `spreadSlip`, add it as an optional last parameter that defaults to the last-word rule, so the existing tests keep passing.
3. Delete the module-level `teamShorts` and the `finally` that clears it.

#### [B-6] Low. The favorite gate uses the raw price, with the vig still in

`implied()` doesn't remove the vig, so a -150/+130 market counts as 0.600 for the favorite against a no-vig price of about 0.58. That nudges more favorites over the 0.60 line.

**Fix path:** document it. Add one sentence to the gate section of `README.md` and `AGENTS.md` saying the 0.60 gate reads the posted price, vig included. Changing the math would move the gate, which `AGENTS.md` forbids without asking, so don't change the math unless you decide to.

### Run scripts (`scripts/`)

#### [S-1] Medium. `scrubError` only removes `apiKey=` query values

`scripts/scrub.ts`. The Autojev client scrubs its own key, but errors that come up through `jev-recipes` (TypeSafe) or a direct-book client aren't scrubbed for a bearer token or a tailnet address. Those errors also land in board notes, which are saved into `runs/last-run.json` and the snapshots. `AGENTS.md` says never to print `AUTOJEV_URL` or a key.

**Fix path**
1. In `scrubError`, after the `apiKey=` replace:
   - Replace every value of `TYPESAFE_API_KEY`, `AUTOJEV_API_KEY`, `AUTOJEV_URL`, and `ODDS_API_KEY` from `process.env` that is at least 8 characters long with its variable name.
   - Replace `Bearer \S+` with `Bearer ***`.
2. Export a `scrubText(text)` that applies the same replacements to a plain string.
3. Use `scrubText` where error messages become board notes: `rankProblem` and the `verifyAll` problems in `slate/board.ts`, and the `propTab` catch.
4. Test in `test/pure.test.ts`: set a fake `AUTOJEV_URL` and `TYPESAFE_API_KEY`, then check that a message containing both comes back with the variable names instead.

#### [S-2] Low. `writeAtomic` is defined twice

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

It's in both `scripts/parlays.ts` and `scripts/snapshot.ts`.

**Fix path:** export `writeAtomic` from `scripts/snapshot.ts`, or a new `scripts/files.ts`, and import it in `scripts/parlays.ts`. No behavior change.

#### [S-3] Low. The run lock is a pid file

`scripts/lock.ts`. If a run is killed and the OS reuses its pid, the next run sees the lock as live and refuses to start. That's rare, and the message tells you what to remove.

**Fix path (optional):** the lock already writes the start time on line 2. In `take`, treat a lock older than 12 hours as stale even when the pid is alive, since no slate run lasts that long. Test with a hand-written lock file in a temp directory, like the existing `acquireRunLock` test.

### Date window (`slate/window.ts`)

The Eastern-midnight math (`startOfEasternDay`) iterates on wall-clock time and handles DST correctly.

#### [W-1] Medium. `scoreboardEvents` doesn't catch a bad JSON body

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`await res.json()` (`slate/window.ts:97`) throws on HTML or a truncated body. A fetch failure falls back to the empty board, but a parse failure throws and the board becomes an error tab. The evidence reviewer flagged the same line on its own.

**Fix path**
1. Wrap the parse: `let board; try { board = await res.json(); } catch { console.error(\`ESPN ${scoreboardLabel(url)} returned an unreadable body.\`); return empty; }`.
2. Test in `test/pure.test.ts`, which already imports `scoreboardEvents`: stub `fetch` to return `new Response('<html>')` and expect `stamps` to be `[]` with no throw.

### CI (`.github/workflows/check.yml`)

#### [C-1] Low. CI's Node version doesn't match local

CI uses `node-version: '22'`, while `engines` requires `>=22.23.4` and `.npmrc` sets `engine-strict=true`. Local development is Node 24. The `'22'` alias resolves to the newest 22.x, so this passes today.

**Fix path:** add `.nvmrc` with the version you develop on (`24`), and change the workflow step to `node-version-file: .nvmrc`. If you want to keep proving the 22 floor, use a matrix of `22.23.4` and `24` instead.

#### [C-2] Low. The pseudoterminal tests are new on Linux CI

They pass on this Mac. This review couldn't confirm they pass on `ubuntu-latest`, because `gh` isn't installed here.

**Fix path:** open the PR's Check run on GitHub. If `test/screen.test.ts` fails there, read the error first. If it's a missing native library or no PTY, add the install step to `check.yml`. Don't skip the tests on Linux.

### Evidence and props (`props/board.ts`, `espn/`, `sports/`)

#### [P-1] High. The extra prop can pick a tiny under or a player outside the team's block

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`extraRow` (`props/board.ts:589`) passes three tiers to `pickLayeredExtra`:
- featured players that pass `realExtra`
- anything that passes `realExtra`
- every posted option, unfiltered

`pickLayeredExtra` (`props/board.ts:181`) falls through whenever a tier has nothing at 0.60 or better. On the last tier it returns the best option even under 0.60 (`:187`). `AGENTS.md` says the extra stays on a player already in that team's block, or the kicker, and skips a tiny under. Both rules break whenever no featured option reaches 0.60.

**Fix path**
1. Add `extraFallback?: boolean` to `PropProfile` (`props/board.ts:210`), and set it to `true` only in the soccer profile. Leave it unset for football, NBA, MLB, and NHL.
2. In `extraRow`, pass `[featuredReal]` when `extraFallback` is not set, and the current three tiers when it is.
3. Decide whether a single-tier extra may be priced under 0.60. The "No other short-priced prop" message suggests not. If not, give `pickLayeredExtra` a `requireLikely` flag that returns `null` instead of falling back on the last tier. The existing `missing` row then shows.
4. Test in `test/pure.test.ts`:
   - `pickLayeredExtra` with only an unfiltered tiny under returns `null` for a non-soccer profile.
   - A featured option at 0.65 wins over a non-featured one at 0.80.

#### [P-2] Medium. The NBA, MLB, and NHL tiny-under filters miss rare stats

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

The `realExtra` filters (`sports/basketball/index.ts:28`, `sports/baseball/index.ts:28`, `sports/hockey/index.ts:34`) still allow Under 1.5 on low-count stats: stolen bases, blocks, steals, and power-play points. A backup's Under 1.5 steals is priced short and says nothing.

**Fix path**
1. In each sport's `realExtra`, return `false` for an Under on the rare-stat markets: blocks and steals for the NBA, stolen bases for MLB, and power-play points for the NHL. Overs at 0.5 stay. The NHL saves rule (`>= 18.5`) is already a real floor.
2. Keep the football rule shape in `sports/football/props.ts:43` as the model: a separate minimum for Over and Under per market.
3. Test each sport's `realExtra` with a direct call, for example `{ market: '<steals key>', side: 'Under', posted: { point: 1.5 } }`, which should be `false`.

#### [P-3] Medium. ESPN requests have no concurrency limit

`buildBoardInner` runs `Promise.all(legs.map(getBrief))` (`slate/board.ts:431`), and each brief fetches team, schedule, and injuries. On a full NCAA Saturday that's about 80 schedule reads at once against ESPN's public API, which invites 429s and timeouts. These are written up as "no recent games", which quietly weakens the brief.

**Fix path**
1. Move `mapPool` from `props/board.ts:192` into a shared module (for example `slate/pool.ts`), export it, and import it back into `props/board.ts`.
2. In `buildBoardInner`, replace the `Promise.all` with `await mapPool(legs, 6, async (leg) => ({ leg, brief: await source.getBrief(leg) }))`. `mapPool` keeps the input order, so the rest of the function doesn't change.
3. Optional: add a test that `mapPool` never runs more than `size` at once and returns results in order.

#### [P-4] Medium. The NFL, NCAA, and soccer windows are copied three times, and none of them drops finished games

Hockey, basketball, baseball, and Formula 1 use `upcomingWindow` in `slate/window.ts`, which keeps only kickoffs after an hour ago. `sports/football/nfl.ts`, `sports/football/ncaa.ts`, and `sports/soccer/index.ts` each build their own window from the full scoreboard, using `scoreboardEvents`. If ESPN's scoreboard still lists last week, the window can start in the past or be empty. The empty-slate case depends on when ESPN rolls its scoreboard forward, so it's a guess.

**Fix path**
1. Give `upcomingWindow` an options argument, `{ tailMs = 6 * 3600_000, label?: (board) => string }`, so NFL can still build its label from `board.week`.
2. Switch the three callers:
   - NFL and NCAA use a 6-hour tail.
   - Soccer uses a four-day tail (`4 * 24 * 3600_000`), which keeps the "rest of the matchweek" rule in `AGENTS.md`.
3. Delete the three copies.
4. Test `upcomingWindow` with a stubbed `fetch` scoreboard that has one event two days ago and two ahead. The window must start an hour before the first upcoming game, and the tail must match the option.

### Odds sources and cache (`odds/`)

None of the high-severity paths below has a test. I confirmed O-1, O-3, O-5, and O-8 by reading the code. The rest come from a read-only review of the odds clients and are cited by line. Every fix here is testable offline with `normalize*` fixtures, `mergeBookEvents`, and a temp `ODDS_CACHE_DIR`, as the existing tests already do.

#### High

##### [O-1] FanDuel props are never read in a merged run

> **Status:** Done, 2026-11-20T17:34:27Z. See tracker.

In a merged read (`ODDS_SOURCE` unset), the props URL carries a combined id, `fd=…,dk=…,mgm=…,czr=…`. DraftKings, BetMGM, and Caesars each parse out their own part. `fanduelFetch` (`odds/fanduel.ts:820-824`) passes the whole string to `fanduelProps`. Either FanDuel throws and its props are omitted, or it returns a `Home`/`Away` placeholder. In the placeholder case, that placeholder can be the only event `booksFetch` returns (`odds/direct.ts:124-126`), which drops every book's props for that game.

**Fix path**
1. In `odds/direct.ts`, add `bookEventId(raw: string, book: BookId)`, which returns `splitBookId(decodeURIComponent(raw))?.[book] ?? raw`.
2. In `fanduelFetch`, call `bookEventId(eventId, 'fd')`. When the FanDuel part is empty, meaning FanDuel didn't list the game, return an empty result without making a request.
3. Replace the copied parsing in `odds/draftkings.ts:415`, `odds/betmgm.ts:540`, and `odds/caesars.ts:387` with the same helper. That also clears the duplicate-code item below.
4. Test `bookEventId` for a combined id, a plain id, and an empty FanDuel part.

##### [O-2] A merged props read keeps only one book's event

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`booksFetch` groups events by Eastern day plus the two team names (`odds/direct.ts:56-60`), then returns `events[0]` for an `/events/` request (`:125`). FanDuel props events carry raw names from the event title. When one book says "Man City" and another says "Manchester City", they land in separate groups, and the second book's props are dropped.

**Fix path**
1. In `booksFetch`, for `/events/` requests, skip `mergeBookEvents`, which is for slates. The combined id already says every book's event is the same game.
2. Add `mergePropEvent(requestId, rows)` that does three things:
   - Drops placeholder events (no `bookmakers`).
   - Takes `commence_time`, `home_team`, and `away_team` from the first real event in book order (FanDuel, DraftKings, BetMGM, Caesars).
   - Joins every row's `bookmakers` into one list. The event `id` is the request id.
3. Return the placeholder only when no book had a real event.
4. Test `mergePropEvent` with FanDuel and DraftKings events whose team names differ. Both bookmakers must come back.

##### [O-3] A dated run can show another day's games

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

On a cache miss, `oddsGet` falls back to `readFamily` (`odds/cache.ts:532`). That lookup ignores `commenceTimeFrom` and `commenceTimeTo` (`oddsSlateFamily`, `:278`), and the board only drops games that have already kicked off (`slate/board.ts:82`). For example, `npm run slate -- 2026-11-21` followed by `npm run slate -- 2026-11-22` within 168 hours reuses the 11-21 slate.

**Fix path**
1. In `oddsGet`, after a `readFamily` hit, keep only the cached events whose `commence_time` falls in the request's `commenceTimeFrom` to `commenceTimeTo`.
2. When nothing is left but the saved slate had games, treat it as a miss and fetch. That fixes dated runs, and it's also correct for a no-date window that moved.
3. Keep the "an empty slate does not win while another file has games" rule. It's already in `preferFreshRecord`.
4. Update the cache paragraph in `AGENTS.md`, which says a slate is reused "even when `commenceTimeFrom` and `commenceTimeTo` move". It should say "for the games that fall in the new window".
5. Test with a temp `ODDS_CACHE_DIR`: store a record for 11-21, then call `oddsGet` with an 11-22 window and `{ cacheOnly: true }`. It must report `skipped`, not the 11-21 games.

##### [O-4] Partial and empty merged reads are cached as successes for 168 hours

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

The merged read throws only when all four books fail (`odds/cache.ts:515`, store at `:550`). DraftKings and Caesars return `[]` for MLB without failing, so for MLB that guard can never trip. If FanDuel and BetMGM both time out, an empty or one-book slate is saved, and an exact-request lookup returns it for a week.

**Fix path**
1. In `oddsGet`'s live branch, when `fetched.failed.length > 0`, still return the body, but store the record with `partial: true`.
2. In `readHit`, treat a `partial` record as fresh for only 30 minutes. `readReplay` keeps accepting it, so `odds=` replays still find that day.
3. Never store a `partial` record whose body is an empty array.
4. Test: store a `partial` record 31 minutes old in a temp cache directory. `oddsGet` with `cacheOnly` must report `skipped`. The same record 5 minutes old must hit.

##### [O-5] BetMGM puts every baseball league into MLB

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`baseball_mlb` has no `competitionId` (`odds/betmgm.ts:49`), so the league filter returns `true` for every baseball fixture (`:492`). In November, winter-league games would be the only ones on the MLB board.

**Fix path**
1. Find the MLB competition id in a saved BetMGM baseball response in `odds-cache/` (look at `fixture.competition.id` on an MLB game) and add it to the `SPORTS` entry. If there's no saved MLB response because it's the offseason, filter on `competition.name` the way the soccer entries do, until an id can be read in season.
2. Change the filter so a sport without a `competitionId` or a `name` returns `false` instead of `true`. A missing id should show nothing rather than everything.
3. Test `normalizeBetMgm` with one MLB fixture and one other-league fixture. Only the MLB game may come back.

#### Medium

##### [O-6] In-memory book caches never expire

> **Status:** Done, 2026-11-20T17:31:14Z. See tracker.

These are the DraftKings `cache` (`odds/draftkings.ts:94`) and BetMGM's `sportCache`, `viewCache`, and `session` (`odds/betmgm.ts:83-87`). This is new with the launcher, which runs `runSlate` repeatedly in one process. A `--fresh` run hours later still serves the first run's DraftKings and BetMGM prices and saves them to disk as live. Also, `odds/betmgm.ts:508` adds spread markets onto the cached fixture objects again on every run.

**Fix path**
1. Export `resetDraftKings()` from `odds/draftkings.ts`, which clears `cache`.
2. Export `resetBetMgm()` from `odds/betmgm.ts`, which clears `sportCache` and `viewCache` and sets `session = null`, `sawSuccess = false`, and `refreshed = false`.
3. Add `resetBookReads()` in `odds/direct.ts` that calls both, plus anything similar in the FanDuel and Caesars clients, and `resetMergedBooks()`.
4. Call `resetBookReads()` at the top of `runSlate` (`scripts/parlays.ts:84`), next to `setOddsFresh`.
5. At `odds/betmgm.ts:508`, build a new fixture instead of assigning: `fixtures[i] = { ...fixture, optionMarkets: [...(fixture.optionMarkets ?? []), ...spreads] }`. Or copy the list when it's read from `sportCache`.
6. Test: call `resetBookReads()` and check that the next read misses the in-memory cache. A small exported `cacheSize()` for tests is enough.

##### [O-7] A doubleheader merges into one game

The merge key is day plus team names (`odds/direct.ts:56`), so two MLB games between the same teams on the same day collapse together. Prices from different games can be mixed.

**Fix path**
1. In `mergeBookEvents`, after grouping by `matchKey`, split each bucket into clusters whose `commence_time` values are within 2 hours of each other.
2. Merge each cluster on its own. Keep one event per book per cluster: when a book has two events in one cluster, keep the one closest to the cluster's FanDuel time.
3. Test `mergeBookEvents` with a doubleheader at 13:05 and 19:10 from two books. Two events must come back, each with both books.

##### [O-8] A one-sided market beats a complete one

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`postedMarket` accepts `outcomes?.length` of 1 (`odds/books.ts:31`). If FanDuel suspends one side, its half-market still wins over a complete DraftKings market, and the other team loses its leg.

**Fix path**
1. Give `postedMarket` a completeness check. For `h2h`, require at least 2 outcomes, or 3 when the caller passes `threeWay`. For `spreads`, require 2. For `totals`, require one `Over` and one `Under`.
2. Pass `source.threeWay` from `getLegs` (`slate/board.ts:84`). Props callers keep their own rules.
3. Test in `test/pure.test.ts`, which already imports `postedMarket`: FanDuel with one h2h outcome and DraftKings with two must return DraftKings.

##### [O-9] `pickBalanced` can prefer an alternate line

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`odds/fanduel.ts:466` scores a pair by the side closest to 50%, not by the pair. A +100/-125 alternate scores better than the main -110/-110.

**Fix path**
1. Score each pair by its no-vig probability: \(|p_1/(p_1+p_2) - 0.5|\), where \(p\) is `implied(price)`.
2. Break ties by the smaller total vig, \(p_1 + p_2\).
3. Test with the main -110/-110 pair and a +100/-125 alternate. The main pair must win.

##### [O-10] Spread pairing drops pick'em lines and can pair a team with itself

> **Status:** Done, 2026-11-20T17:59:57Z. See tracker.

`odds/lines.ts:14-29`. A point of 0 always goes into the "plus" list, so a PK line never gets a pair. Pairing is by list position and never checks that the two names differ.

**Fix path**
1. Pair by name: for each outcome, find the other team's outcome whose point is the negative of this one. Treat 0 and 0 as a match.
2. Skip any pair where both outcomes have the same name.
3. Test with a PK pair, a normal -3.5/+3.5 pair, and a list where one team has two lines.

##### [O-11] FanDuel doesn't use the shared HTTP code

`odds/fanduel.ts:65-77` has its own fetch, with no retry. Its error message includes 200 characters of the response body, which can be an HTML block page, and that text goes into `omitted`, the cache file, and the board note. `AGENTS.md` says errors should be status and API message only. Also, `espnTeams` (`:115`) calls `res.json()` without a try.

**Fix path**
1. Replace FanDuel's fetch helper with `fetchJson` from `odds/http.ts`, and throw `BookError` with the status and a short message, not the body.
2. In `espnTeams`, wrap `res.json()` and return an empty team list on failure. Name resolution already falls back to the raw name.
3. Test: stub `fetch` to return a 403 with an HTML body. The thrown message must contain `403` and no `<html`.

#### Low

- **[O-L1] BetMGM's curl call** (`odds/betmgm.ts:102-107`) has the access id in its command-line arguments, where any local user can see it with `ps`. `execFile` doesn't use a shell, so there's no shell injection. However, the URL is built from `cdsApiUrl` in BetMGM's response and passed as a bare argument, so a value starting with `-` would be read as a curl option. That part is speculative.
  **Fix path:** run curl with `-K -` and write `url = "<url>"` and `header = "x-bwin-accessid: <id>"` to its stdin, so neither is in the arguments. Before that, check that `cdsApiUrl` parses with `new URL()` and is `https:`.

- **[O-L2] Caesars `dataPath` values are added to `BASE` without checks** (`odds/caesars.ts:339`, `:360`, `:370`). Soccer props also reload the whole competition for every game.
  **Fix path:** accept a `dataPath` only when it matches `/^\/[\w\-/.]+$/`, and build the URL with `new URL(dataPath, BASE)`, checking that the host didn't change. Memoize the competition read in a per-run `Map`, and clear it from `resetBookReads()`.

- **[O-L3] Duplicated code:**

  > **Status:** Partial, 2026-11-20T17:34:27Z. See tracker.

  - Combined-id parsing is copied into three clients (`odds/draftkings.ts:415`, `odds/betmgm.ts:540`, `odds/caesars.ts:387`) while `splitBookId` goes unused.
  - Each client repeats the `Home`/`Away` placeholder event.
  - FanDuel has its own price parsing instead of `americanPrice`, so it rejects the Unicode minus sign (`odds/fanduel.ts:241`).

  **Fix path:**
  - The `bookEventId` helper from O-1 covers the id parsing.
  - Add `placeholderEvent(id)` in `odds/direct.ts` and use it in all four clients.
  - Switch `odds/fanduel.ts:241` to `americanPrice`, and add a test for a `−110` with a Unicode minus.

- **[O-L4] Type-safety holes:**
  - `asEvents` casts without checking (`odds/direct.ts:51`), and `mergeBookEvents` runs before `parseOddsBody` validates the shape.
  - `menuId` assumes the response is an array (`odds/caesars.ts:292`).
  - `odds/fanduel.ts` uses `any` throughout.

  **Fix path:**
  - Run `parseOddsBody` on each book's body inside `booksFetch` before merging, and drop a book whose body fails, adding it to `failed`.
  - In `menuId`, check `Array.isArray` first.
  - Replace `any` in `odds/fanduel.ts` gradually, starting with the exported functions, using small local types like the other clients have.

- **[O-L5] `QUOTA_LOG` doubles as a file path** (`odds/quota.ts:57`). `QUOTA_LOG=1` writes a file named `1` in the working directory.
  **Fix path:** treat `0` as off, and treat `1` or `true` as on with the default path. Use a separate `QUOTA_LOG_PATH` for a custom file. Add it to `.env.settings.example`.

- **[O-L6] Dead code:** `ODDS_CREDIT_FLOOR` and `oddsCreditFloor` are unused, as `AGENTS.md` already notes. `PROP_NAMES` in `odds/draftkings.ts` repeats the points and assists patterns (`:44`/`:51` and `:46`/`:52`).
  **Fix path:**
  - Delete `oddsCreditFloor` and its test, and remove `ODDS_CREDIT_FLOOR` from `.env.settings.example`, `AGENTS.md`, and `README.md`.
  - Remove the repeated `PROP_NAMES` patterns, and run the DraftKings normalize tests.

- **[O-L7] Not verified:** the Caesars spread sign, where home gets `line` and away gets `-line` (`odds/caesars.ts:186-187`).
  **Fix path:** open one saved `caesars-` file in `odds-cache/` and compare a spread to the same game on FanDuel. If the favorite comes out positive, flip the sign. Add the saved shape as a `normalizeCaesars` fixture test.

---

## Suggested order

1. **Before merging `clickability`:**
   - Make Ctrl-C exit during the splash (PR-1).
   - Default the Clear snapshots confirm to No (PR-2).
   - Reset the DraftKings and BetMGM in-memory caches at the start of `runSlate` (O-6), because the launcher is what makes them matter.
   - Fix the "one alt-screen session" sentence in the PR description.
2. **Wrong data on the board:**
   - O-1 through O-5: FanDuel props id, merged props event, dated-run cache, caching failures, BetMGM MLB.
   - The extra-prop fallback.
   - The tiny-under filters.
   - O-8, one-sided markets.
3. **Tests:**
   - The offline `buildBoardInner` test, which pins the `AGENTS.md` gates and tickets.
   - Land it before the board fixes above if you can, so they're checked against it.
4. **Robustness:**
   - The `scoreboardEvents` JSON parse.
   - The ESPN concurrency limit.
   - One shared window helper.
   - FanDuel on `fetchJson`.
   - Broader `scrubError`.
   - Doubleheaders, `pickBalanced`, and spread pairing.
5. **Decisions for you:**
   - `Take` versus `Lean` under 0.80.
   - Whether an extra prop may be priced under 0.60.
6. **Cleanup:** the remaining low items.
