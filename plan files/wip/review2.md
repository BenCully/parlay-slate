# Review 2

Verification of `plan files/wip/review.md`, run 2026-11-20 on branch `chore/reconcile-the-rest-of-the-review` at `0ba796f`. Every fix is compared against `721ca58`, the commit the first review was written on.

Part 1 says which first-review findings are fixed. Part 2 is new findings, each with a **Fix path**.

---

## For the agent reconciling this review

Use the same rules as `review.md`, and track your work in this file.

1. **Read `AGENTS.md` first.** Its rules win over this file. A fix that changes a rule in the "Do not change these rules unless asked" section needs Ben's OK first. Mark it `Needs decision` until he answers.
2. **Before you start a finding,** set its row in the tracker to `In progress`.
3. **When you finish a finding,** in the same turn:
   - set its row to `Done`
   - fill in **Change**: files touched, and the commit hash if you committed
   - fill in **Check**: the test you added and the commands you ran, with results
   - add a line to the work log
4. **Every fix needs a test that fails when the fix is reverted.** Test the call site, not only the helper. Several first-round tests only exercised a helper (see R2-11).
5. **When you stop partway,** set the row to `Blocked` or `Partial` and say why in **Notes**. When you disagree with a finding, set it to `Won't fix` or `Not a bug` with evidence. Don't delete findings.
6. **Add new findings** as the next free `R2-` ID, with a section in the same format.
7. **Don't record secrets here,** and commit or push only when Ben asks.
8. **After each code change,** run `npm test` and `npm run typecheck`, and add a `changelog.md` entry.
9. **Also update the matching row in `review.md`** when a finding here reopens or closes one there. The `Reopens` column names it.

Status values: `Open`, `In progress`, `Done`, `Partial`, `Blocked`, `Needs decision`, `Won't fix`, `Not a bug`.

### Tracker

| ID | Sev | Finding | Reopens | Status | Change | Check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R2-1 | High | Formula 1 board is always empty | O-8 | Done | `odds/books.ts`, `slate/board.ts`, `test/pure.test.ts`, `test/board.test.ts` | `postedMarket` outright returns FanDuel. An F1 board with one driver at -150 has one leg. | |
| R2-2 | Medium | NHL extra prop is always empty; the 0.60 choice wasn't a decision | P-1 | Done | `props/board.ts`, `AGENTS.md`, `test/pure.test.ts` | `loadPropBoard` picks saves at +105 and skips the power-play Under. The empty team uses the new missing text. | `requireLikely` is gone. A featured extra may be under 0.60. |
| R2-3 | Medium | A family cache hit with a narrower window drops games | O-3 | Done | `odds/cache.ts`, `AGENTS.md`, `test/pure.test.ts` | An 11-21 save misses an 11-21 through 11-25 `cacheOnly` read. A wide save hit for 11-22 keeps that day. A newer narrow save does not hide the wide one. | |
| R2-4 | Medium | `test/board.test.ts` fails after 2027-01-15 | B-1 | Done | `test/board.test.ts` | Kickoff is one day ahead. Ten tickets, sorted by hit rate. A -160/-155 game is not on one ticket. Briefs peak at 6. | |
| R2-5 | Medium | Caesars path check may reject real tab paths | O-L2 | Done | `odds/caesars.ts`, `test/pure.test.ts` | `Total%20Goals` and a query succeed. `..`, `%2e%2e`, and `//evil.example` throw. | No saved Caesars file yet, so no fixture was added. |
| R2-6 | Low | `npm run slate -- 11/20` prints a stack trace | B-3 | Done | `scripts/parlays.ts`, `test/pure.test.ts` | Spawned `scripts/parlays.ts 11/20`. Exit 1, `Date must be YYYY-MM-DD.` on stderr, no `at readStartArgs`. | |
| R2-7 | Low | Alt plus a key quits the launcher | PR-6 | Done | `ui/term.ts`, `test/tui.test.ts` | `\x1bq` is one event. `reduceForm` returns `effect: none`. | A lone Esc still quits. The splash still treats it as any key. |
| R2-8 | Low | Book error notes skip `scrubText` | S-1 | Done | `odds/direct.ts`, `props/board.ts`, `test/pure.test.ts` | `booksFetch` for an unknown sport puts `TYPESAFE_API_KEY` in the omitted note and not the value. | The per-game props error is scrubbed at the same point. |
| R2-9 | Low | README sentence contradicts its screenshot | B-2 | Done | `README.md` | Docs only. The sentence says this save predates Lean. | No changelog entry of its own. No rerun. |
| R2-10 | Low | A stale kickoff time can split one game in two | O-7 | Done | `odds/direct.ts`, `test/pure.test.ts` | FanDuel at 13:05 and DraftKings at 16:30 merge. The doubleheader test still returns two events. | |
| R2-11 | Low | Several fixes are tested only at the helper | P-1, P-3, P-4, O-4, O-10, O-11 | Done | `test/board.test.ts`, `test/pure.test.ts` | Call sites: prop board, brief pool of 6, the three windows, a partial store, a one-team spread, an HTML team list, and a Lean prop slip. | P-1 is the R2-2 test. |
| R2-12 | Low | `mapPool` keeps starting reads after a failure | P-3 | Done | `slate/pool.ts`, `test/pure.test.ts` | Six items, size 2, item 1 throws. At most 3 calls start. | |
| R2-13 | Low | Football extras still allow tiny unders | P-2 | Done | `sports/football/props.ts`, `test/pure.test.ts` | Passing touchdowns Under 0.5 is false. Over 1.5 is true. Field goals Under 1.5 is false. | |
| R2-14 | Low | Leftover `ODDS_CREDIT_FLOOR` comment | O-L6 | Done | `odds/cache.ts` | Comment only. `skipped` means a `cacheOnly` read missed. | |
| R2-15 | Low | An old `QUOTA_LOG=/path` is silently ignored | O-L5 | Done | `odds/quota.ts`, `AGENTS.md`, `test/pure.test.ts` | `QUOTA_LOG=/tmp/x.jsonl` warns once and writes that file. | |
| R2-16 | Low | `AGENTS.md` rule edits weren't marked for sign-off | P-4 | Done | `AGENTS.md` | NHL, NBA, MLB, and Formula 1 now say the first game or race still ahead. A finished game does not set the window. | README does not say "first listed game". |
| R2-17 | Low | `review.md` tracker housekeeping | PR-3 | Done | `plan files/wip/review.md` | Each former "Not committed" cell now says `455ec7e`. PR-3 is Done. | The current PR #5 body does not contain the alt-screen sentence, so it was not edited. |

### Decisions

Ben approved these on 2026-11-20. They settle the open questions, so the matching rows are `Open` and ready to work.

| Finding | Decision | Why |
| --- | --- | --- |
| R2-2 | A featured extra may be priced under 0.60. An option at 0.60 or better still wins first. Football, NBA, MLB, and NHL extras stay featured-only, and the tiny-under filters stay. | The 0.60 gate in `AGENTS.md` is for moneyline favorites. Prop rows are decisions, not parlay legs, and verify still needs 0.80. With 0.60 required, the NHL extra is always empty, against the `AGENTS.md` promise of one saves or power-play extra. |
| R2-16 | Keep the `AGENTS.md` sentences from the P-4 fix. Also change "one hour before the first listed game" to "one hour before the first game still ahead" in the NHL, NBA, MLB, and Formula 1 sentences. | The new sentences describe the intended fix. The soccer "four Eastern days" line documents behavior that already existed. All of those sports now use `upcomingWindow`, so the wording should match. |
| R2-7 | Use fix-path option 1: Alt plus a key is one event, and no screen binds it. | It fixes the accidental quit with the smallest change, and a lone Esc still works. |
| R2-9 | Reword the README sentence. Don't rerun 2026-11-15. | A rerun makes jev calls and archives the snapshot. Retake the screenshot the next time screenshots are refreshed. |
| R2-17 | Edit the merged PR #5 description with `gh pr edit`. | It's one command and keeps the PR record accurate. |
| O-L7 (in `review.md`) | Not a bug. | 264 of 266 Caesars spreads in the saved `books-` files have the same sign as FanDuel, DraftKings, or BetMGM. The other two are one soccer game where Caesars has a different handicap line, not a flipped sign. |

### Work log

```
YYYY-MM-DDTHH:MM:SSZ  ID  Status  What changed, or why it stopped
```

2026-11-20T18:40:00Z  R2-2  Open  Ben decided a featured extra may be under 0.60. Fix path updated.
2026-11-20T18:40:00Z  R2-16  Open  Ben kept the AGENTS.md sentences. Add the "still ahead" wording for the other four sports.
2026-11-20T18:40:00Z  R2-7  Open  Ben chose option 1.
2026-11-20T18:40:00Z  R2-9  Open  Ben chose to reword, without a rerun.
2026-11-20T18:40:00Z  R2-17  Open  Ben OK'd editing the merged PR #5 description.
2026-11-20T18:40:00Z  O-L7  Not a bug  Caesars spread signs match the other books in the saved books- files. Recorded in review.md.
2026-11-20T19:06:54Z  R2-1  Done  An outright moneyline may have one outcome. An F1 board test drives getLegs.
2026-11-20T19:06:54Z  R2-2  Done  A featured extra may be under 0.60. The missing row names a featured player.
2026-11-20T19:06:54Z  R2-3  Done  A family hit must cover the requested window.
2026-11-20T19:06:54Z  R2-4  Done  The board test kickoff is one day ahead, with 10 sorted tickets.
2026-11-20T19:06:54Z  R2-5  Done  Caesars paths allow percent-encoding and a query, and still reject traversal.
2026-11-20T19:06:54Z  R2-6  Done  A bad slate date prints one line and exits 1.
2026-11-20T19:06:54Z  R2-7  Done  Alt plus a key is one ignored event.
2026-11-20T19:06:54Z  R2-8  Done  Book error notes go through scrubText.
2026-11-20T19:06:54Z  R2-9  Done  The README says this save predates Lean.
2026-11-20T19:06:54Z  R2-10  Done  One listing stays one game unless a book lists the matchup twice.
2026-11-20T19:06:54Z  R2-11  Done  The earlier fixes now have call-site tests.
2026-11-20T19:06:54Z  R2-12  Done  mapPool stops taking new items after a failure.
2026-11-20T19:06:54Z  R2-13  Done  Football extras skip tiny passing-touchdown and field-goal unders.
2026-11-20T19:06:54Z  R2-14  Done  The skipped comment no longer names the credit floor.
2026-11-20T19:06:54Z  R2-15  Done  A path in QUOTA_LOG warns once and is still used.
2026-11-20T19:06:54Z  R2-16  Done  NHL, NBA, MLB, and Formula 1 say the first game still ahead.
2026-11-20T19:06:54Z  R2-17  Done  review.md names 455ec7e. PR #5 has no alt-screen sentence to replace.

---

## Part 1: Status of the first review

### What was run

- `npm run typecheck`: clean. `npm test`: 89 of 89 pass.
- The launcher fixes, rerun in a real pseudoterminal with the same driver as the first review. Clear snapshots ran in a scratch worktree.
  - PR-1: Ctrl-C during the splash exits 130 with the terminal restored.
  - PR-2: Enter on an open Clear snapshots confirm deletes nothing.
  - PR-4: `q` closes the confirm and the date picker, and the launcher stays open. `q` on the options screen still quits.
  - PR-8: View last run opens the slate without leaving the alternate screen, and the exit restores the terminal.
- `node --import tsx` calls to `postedMarket` with a Formula 1 event shape (R2-1).
- Every other finding was checked by reading the diff `721ca58..HEAD`.

### Verdicts

| ID | Verdict | Notes |
| --- | --- | --- |
| PR-1, PR-2, PR-4, PR-5, PR-8 | Fixed | Live checks above. |
| PR-6 | Fixed, with a side effect | Alt plus a key now arrives as Esc and then the key, and Esc quits the options screen. See R2-7. |
| PR-7 | Fixed | `scripts/parlays.ts` removes the lock on SIGINT during the walk and drops the handler before the slate screen. |
| PR-3 | Not done | The tracker says Blocked because PR #5 is merged. GitHub still lets you edit a merged PR's description. See R2-17. |
| B-1 | Fixed, with a time bomb | See R2-4. |
| B-2 | Fixed | `slipVerb` in `slate/board.ts:243`, plus totals and props. Tickets use only Ready legs, so they still say `Take`. The README is out of step; see R2-9. |
| B-3 | Fixed, with a side effect | See R2-6. |
| B-4, B-5, B-6, S-2, S-3, W-1, C-1, C-2 | Fixed | |
| S-1 | Partial | Rerank, verify, and props-tab errors are scrubbed. Book error notes are not; see R2-8. |
| P-1 | Fixed, with a new problem | See R2-2. |
| P-2 | Fixed | Market keys match the DraftKings, Caesars, and BetMGM parsers. |
| P-3, P-4 | Fixed | Only the helpers are tested; see R2-11. |
| O-1, O-2, O-5, O-6, O-9, O-11, O-L1, O-L3, O-L5 | Fixed | |
| O-3 | Fixed, with a new problem | See R2-3. |
| O-4 | Fixed | The store side has no test; see R2-11. |
| O-7 | Fixed | The tracker says "a DraftKings line an hour from FanDuel is dropped". That's only true when DraftKings lists the game twice in one cluster. A single listing an hour off is kept, which is correct. |
| O-8 | Fixed, with a regression | See R2-1. |
| O-10 | Fixed | The self-pairing case has no test; see R2-11. |
| O-L2 | Fixed, possibly too strict | See R2-5. |
| O-L4 | Partial, as tracked | The FanDuel slate parser still uses `any`. |
| O-L6 | Fixed | A stale comment remains; see R2-14. |
| O-L7 | Blocked, legitimately | There's no `caesars-` file in `odds-cache/` to check the spread sign against. |

---

## Part 2: New findings

### [R2-1] High. The Formula 1 board is always empty

The O-8 fix made `postedMarket` require at least two moneyline outcomes (`odds/books.ts:23`). FanDuel's `outrightSlate` builds one event per driver, and each event has a single moneyline outcome (`odds/fanduel.ts:636-648`). `getLegs` calls `postedMarket(books, 'h2h', { threeWay })` (`slate/board.ts:86`), which now returns `null` for every driver, so every F1 run says "No qualifying legs". I confirmed it: `postedMarket` on a one-driver FanDuel event returns `null`. No test drives an F1 event through `getLegs`. The F1 tests only cover `chooseDriverBets`.

**Fix path**
1. Add `outright?: boolean` to the `postedMarket` options, and in `marketReady` accept one or more outcomes for `h2h` when it is set.
2. Pass `{ threeWay, outright }` from `getLegs` (`slate/board.ts:86`). `outright` is already in scope there.
3. Tests:
   - In `test/pure.test.ts`, assert that `postedMarket` with `{ outright: true }` returns the FanDuel book for a one-outcome event.
   - Assert that the same event without the flag still returns `null`, which keeps the O-8 behavior.
   - In `test/board.test.ts`, add an F1 case: a `BoardSource` with `outright: true` and one driver at -150 must produce one leg.

### [R2-2] Medium. The NHL extra prop is always empty, and the 0.60 choice wasn't marked as a decision

The P-1 fix path left one question for Ben: may a featured extra be priced under 0.60? The fix chose "no" with `requireLikely` (`props/board.ts:582-583`), without marking it `Needs decision`. Combined with P-2, the NHL has nothing left:
- `realExtra` (`sports/hockey/index.ts:33-34`) allows only saves at 18.5 or more and power-play points Over 0.5.
- Neither clears 0.60. The evidence reviewer counted 0 of 314 saved saves prices and 0 of 205 power-play Overs at 0.60 or better in `odds-cache/`. I didn't recount.

So every NHL team shows the missing row, while `AGENTS.md` promises "one extra of goalie saves or power-play points". The football kicker extra survives, but only rarely. The missing-row text, "No other short-priced prop was posted" (`props/board.ts:585`), is also now wrong when a prop was posted but filtered out.

**Decision:** a featured extra may be priced under 0.60 (see Decisions).

**Fix path**
1. In `extraRow` (`props/board.ts:582-583`), keep `tiers = profile.extraFallback ? [featuredReal, real, options] : [featuredReal]`.
2. Pass `requireLikely: false` for every profile. `pickLayeredExtra` already prefers an option at 0.60 or better within the tier, and otherwise takes the best one. Drop the `requireLikely` option if nothing else uses it.
3. Keep the P-2 tiny-under filters as they are. They still apply, because only `featuredReal` options are candidates.
4. Reword the missing row (`props/board.ts:585`) to "No featured player had a usable extra for <team>."
5. In `AGENTS.md`, add one sentence to the props rules: "The extra stays on a featured player or the kicker. It prefers a price of 0.60 or better and can be lower when none is." This was approved with this decision.
6. Test through `loadPropBoard` or `extraRow`, not just `pickLayeredExtra`, with a hockey profile:
   - A saves line at 24.5 priced +105 and a power-play Under 0.5 at -300 must pick the saves row. The Under is filtered out, and the saves line wins under 0.60.
   - A team with no featured option must get the missing row with the new text.
   - Revert check: setting `requireLikely` back to `true` must fail the first case.

### [R2-3] Medium. A family cache hit with a narrower saved window drops games

The O-3 fix filters a family hit down to the requested window (`familyBody`, `odds/cache.ts:538`). It never checks that the saved window covers the whole request. Each book returns only games inside the window it was asked for, so a one-day save holds one day.

For example, run `npm run slate -- 2026-11-21`, then a no-date soccer run whose window is 11-21 through 11-25. The family hit is the 11-21 save, and the filter keeps only 11-21 games. Games on 11-22 through 11-25 are missing, the board says the prices came from the cache, and nothing is fetched. A related problem: `preferFreshRecord` picks the newest record before filtering, so a newer save outside the window can hide an older one that matches.

**Fix path**
1. In `readFamily` (`odds/cache.ts`), read each candidate's saved `commenceTimeFrom` and `commenceTimeTo` from its `request`, and keep only records whose window contains the requested one. A missing bound counts as unbounded.
2. Run `preferFreshRecord` on those candidates, then apply `familyBody`.
3. When no candidate covers the request, treat it as a miss.
4. Test with a temp `ODDS_CACHE_DIR`:
   - Store an 11-21-only save, then request 11-21 through 11-25 with `cacheOnly`. Expect `skipped`.
   - Store a wide 11-21 through 11-25 save, then request 11-22 only. Expect a hit with only the 11-22 games.

### [R2-4] Medium. `test/board.test.ts` fails after 2027-01-15

The fixture hardcodes `from = '2027-01-15T05:00:00Z'` (`test/board.test.ts:32`) and `commence_time: '2027-01-15T18:00:00Z'` (`:47`). `getLegs` drops games that have already kicked off (`slate/board.ts:84`), so after that time every leg disappears and the test fails on CI. Two assertions also can't fail with this data: "one leg per game" and "at most 10 tickets". There are only two Ready legs, from two games.

**Fix path**
1. Compute the kickoff as now plus one day, and build `from` and `to` around it with `easternRange(easternDay(kickoff))`.
2. Add five more Ready legs from distinct games, which makes 7 Ready legs and more than 10 possible tickets. Assert exactly 10 tickets, sorted by implied product.
3. Add one game where both sides clear 0.60, which a heavy-vig fixture allows: -160 and -155 are 0.615 and 0.608 implied. Make both sides Ready, and assert that no ticket contains both.
4. Check that the test passes with the system clock set past 2027-01-15. A quick way is to run it with `faketime`, or to temporarily stub `Date.now`.

### [R2-5] Medium (speculative). The Caesars path check may reject real tab paths

The O-L2 check (`odds/caesars.ts:11-14`) accepts only `^/[\w\-/.]+$`. That rejects `%`, spaces, `&`, `?`, and `=`. If Caesars sends a multi-word tab, such as "Total Goals", percent-encoded, then:
- on the soccer slate, the throw fails the whole Caesars soccer read (`:369-371`)
- on props, only a 404 is caught (`:396`), so that game's Caesars props fail

There's no saved Caesars response to confirm the real shape.

**Fix path**
1. Allow `%` in the pattern, and allow an optional `?query`.
2. Keep the safety checks that matter:
   - After `new URL(dataPath, BASE)`, the host must still be the Caesars host and the path must stay under the region prefix.
   - Reject a path whose decoded form contains `..`.
3. Test that `caesarsDataUrl('/v4/events/x/tabs/Total%20Goals')` succeeds. Test that `'/../x'`, `'%2e%2e/x'`, and `'//evil.example/x'` throw.
4. When you next have a Caesars soccer response in `odds-cache/`, save one `dataPath` from it as a fixture.

### [R2-6] Low. `npm run slate -- 11/20` prints a stack trace

The B-3 fix makes `readStartArgs` throw on a bad date or an unknown flag. `scripts/parlays.ts:194` calls it outside the `.catch` in the direct-run block, so the user sees a raw Node stack trace instead of the one-line message. I confirmed it by running the command. `npm start` is fine, because `scripts/start.ts` calls it inside an async function.

**Fix path**
1. In the `isDirectRun` block, wrap the call: `try { args = readStartArgs(...) } catch (error) { console.error(scrubError(error, 'Bad arguments.')); process.exit(1); }`.
2. Test in `test/pure.test.ts`, as the existing "npm run tui without a terminal" test does: spawn `node --import tsx scripts/parlays.ts 11/20` and assert exit code 1, `Date must be YYYY-MM-DD.` on stderr, and no `at readStartArgs`.

### [R2-7] Low. Alt plus a key quits the launcher

The PR-6 fix delivers escape plus one byte as `\x1b`, then the byte (`ui/term.ts:67-72`). On the options screen, `reduceMain` treats `\x1b` as quit, so Alt+anything, including an accidental Option-key press on macOS, closes the launcher. Before the fix, it waited for the next keystroke and then did the same thing.

**Decision:** option 1 (see Decisions).

**Fix path**
1. In `takeEvents`, emit Alt+key as a single event, `{ key: '\x1b' + char }`. No screen binds those keys, so they're ignored. A lone Esc still comes through the 200 ms timer.
2. Check that `ui/table.ts`, `ui/tui/options.ts`, and the splash all ignore an unknown two-character key. The splash may still treat it as "any key" and skip, which is fine.
3. Update the PR-6 test in `test/tui.test.ts`: `\x1bq` should yield one `\x1bq` event, and `reduceForm` with that key should return `effect: none`.

### [R2-8] Low. Book error notes skip `scrubText`

Missing-book sentences from a merged read are built from the raw `error.message` (`odds/direct.ts:240-244`). They go into board notes (`slate/board.ts:434`), props notes (`props/board.ts:303`, `:306`, `:333`), and the stored cache file, and replay shows them again. The book clients don't read the four secret variables, so a leak is unlikely today. But `AGENTS.md` wants every saved note clean.

**Fix path**
1. Wrap the message with `scrubText` where the omitted sentence is built in `odds/direct.ts`, so cache files are clean too.
2. Wrap the per-game props error in `props/board.ts:306`.
3. Test: make a reader throw with a message containing a fake `TYPESAFE_API_KEY` value (set in the test env), run `booksFetch` or `mergeBookEvents` through the omitted path, and assert the value is replaced by the variable name.

### [R2-9] Low. A README sentence contradicts its screenshot

`README.md:32` says the Vikings and the Jaguars "show Lean". The screenshot, and `snapshots/2026-11-15-jev.json` that it was taken from, show `Take Vikings -4000` and `Take Jaguars -2500`, because saved slips keep their old text.

**Decision:** reword, no rerun (see Decisions).

**Fix path**
1. Change the sentence in `README.md:32` to: "This save predates the Lean slip, so the Vikings and the Jaguars still say Take. A run today shows Lean for a supported win under 0.80."
2. No changelog entry; this is a docs-only tweak.
3. When screenshots are next refreshed, rerun 2026-11-15 and restore the plain "show Lean" wording.

### [R2-10] Low (speculative). A stale kickoff time can split one game in two

O-7 clusters events by kickoffs within 2 hours (`odds/direct.ts:134-163`). If one book still lists an old time for a rescheduled game, more than 2 hours off but on the same Eastern day, that book's listing becomes a separate event. The same team can then show up as two legs.

**Fix path**
1. Split a bucket by time only when at least one book lists two events in it, which is the real doubleheader signal. Otherwise keep the bucket as one game.
2. Test `mergeBookEvents`:
   - FanDuel at 13:05 and DraftKings at 16:30, each with a single listing, merge into one event.
   - The existing doubleheader test still produces two events.

### [R2-11] Low. Several fixes are tested only at the helper

These tests would still pass if the call-site change were reverted:
- **P-1:** only `pickLayeredExtra` is tested, so restoring the three tiers at `props/board.ts:582` passes.
- **P-3:** only `mapPool` is tested, so going back to `Promise.all` at `slate/board.ts:442` passes.
- **P-4:** `upcomingWindow` is tested, but not the three switched sport files.
- **O-4:** only freshness is tested, not the store branch that writes `partial` or skips an empty partial slate (`odds/cache.ts:580-591`).
- **O-10:** the self-pair case has no test.
- **O-11:** the `espnTeams` fallback has no test.
- **B-2:** no test covers the `Lean` prop slip. The `.replace(/^Take /…)` at `props/board.ts:268` depends on every prop slip starting with `Take`.

**Fix path**
1. **P-1:** covered by the R2-2 call-site test.
2. **P-3:** in `test/board.test.ts`, count concurrent `getBrief` calls with a source whose `getBrief` awaits a short timer. Assert a peak of 6 or less with 10 legs.
3. **P-4:** for each of `nfl.ts`, `ncaa.ts`, and `sports/soccer/index.ts`, stub `fetch` with a scoreboard that has one event two days ago and two ahead. Call the league's `window(undefined)` and assert the start is one hour before the first upcoming game.
4. **O-4:** with a temp `ODDS_CACHE_DIR` and `ODDS_SOURCE` unset, stub `fetch` so one book fails. Assert the stored file has `partial: true`, and that an empty partial slate writes no file.
5. **O-10:** a list where one team has two lines and the other has none must produce no pair.
6. **O-11:** a `fetch` that returns HTML for the ESPN teams call must give an empty team list without throwing.
7. **B-2:** a supported prop check with status `review` must produce a `Lean ...` slip.

### [R2-12] Low. `mapPool` keeps starting reads after a failure

If one `getBrief` throws, `mapPool` (`slate/pool.ts:13`) rejects at once, the same as `Promise.all` did. But the other workers keep taking new legs and starting ESPN reads for a board that has already failed. Nothing is swallowed, and there's no unhandled rejection. It just wastes requests.

**Fix path:** add a `failed` flag in `mapPool`, set it in a `catch` around `fn`, and have each worker stop taking new items once it's set. Test with 6 items, size 2, where item 1 throws: no more than 3 calls of `fn` should start.

### [R2-13] Low. Football extras still allow tiny unders

In `sports/football/props.ts:43-52`, `player_pass_tds` returns `true` for any line, so passing touchdowns Under 0.5 counts. `player_field_goals` accepts Under 1.5. A featured quarterback or the kicker can still get the kind of tiny under that `AGENTS.md` says to skip. This existed before the fixes; P-2 just didn't cover football.

**Fix path**
1. Make `player_pass_tds` an Over at 0.5 or more, or an Under at 1.5 or more.
2. Make `player_field_goals` an Over at 1.5 or more, or an Under at 2.5 or more.
3. Test `realExtra` directly for a passing-touchdowns Under 0.5 (false), Over 1.5 (true), and a field-goals Under 1.5 (false).

### [R2-14] Low. Leftover `ODDS_CREDIT_FLOOR` comment

`odds/cache.ts:131`, on the `skipped` field, still says "to stay above ODDS_CREDIT_FLOOR". The floor is gone. `skipped` now only means a `cacheOnly` read missed.

**Fix path:** reword it to "True when a cacheOnly read found no saved file." No test needed.

### [R2-15] Low. An old `QUOTA_LOG=/path` is silently ignored

O-L5 moved the custom path to `QUOTA_LOG_PATH`. An existing `.env.settings` with `QUOTA_LOG=/some/file` now writes the default file without saying so.

**Fix path:** in `odds/quota.ts`, when `QUOTA_LOG` contains `/` or ends in `.jsonl`, print one warning per process saying to use `QUOTA_LOG_PATH`, then use that path anyway. Note the rename in the changelog entry. Test that `QUOTA_LOG=/tmp/x.jsonl` warns and writes there.

### [R2-16] Low. `AGENTS.md` rule edits weren't marked for sign-off

The first review's rule 1 says a fix that changes an `AGENTS.md` rule needs Ben's OK. B-2 got it, and the tracker says so. The P-4 fix also edited the "Do not change these rules unless asked" section: the soccer window and the NCAA sentences. Those edits describe what the code now does, but they weren't marked `Needs decision`.

**Decision:** keep the sentences, and align the wording for the other four sports (see Decisions).

**Fix path**
1. Leave the P-4 sentences for NCAA and soccer as they are.
2. In the NHL, NBA, and MLB sentence, change "from one hour before the first listed game to six hours after the last" to "from one hour before the first game still ahead to six hours after the last. A finished game does not set that window."
3. Make the same change in the Formula 1 sentence ("the first race" becomes "the first race still ahead").
4. Check that `README.md` doesn't still say "first listed game". Change it there too if it does.
5. Docs only. No test, and no separate changelog entry; mention it in the next entry.

### [R2-17] Low. `review.md` tracker housekeeping

- Every row says "Not committed", but the fixes are committed on this branch (`455ec7e`, `0ba796f`).
- PR-3 is marked Blocked because PR #5 is merged. GitHub still allows editing a merged PR's description, and `gh` is now installed.

**Fix path**
1. Replace "Not committed" with the commit hash in each `review.md` row.
2. For PR-3, run `gh pr edit 5 --repo BenCully/parlay-slate --body-file <file>` with the corrected description. Ben approved editing the merged PR. Pull the current body first with `gh pr view 5 --json body`, change only the alt-screen sentence, and use the replacement sentence from the `review.md` work log. Then mark PR-3 `Done` in `review.md`.

---

## Suggested order

1. **R2-1**, because Formula 1 is broken on `main`'s next run.
2. **R2-3 and R2-4**: wrong data from the cache, and a test that will start failing on CI.
3. **R2-2 and R2-16**, now decided: extras under 0.60 and the `AGENTS.md` wording.
4. **R2-11**: the call-site tests. Land them before more fixes, so later changes are checked against them.
5. **R2-5 through R2-10, and R2-12 through R2-15.**
6. **R2-17**, last, because it's bookkeeping.
