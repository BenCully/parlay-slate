# Direct book sources

Build spec for replacing the live call to The Odds API. The clients, the merged read, and the removal of that live call have landed. An unset `ODDS_SOURCE` reads the four books. Old Odds API files stay readable. The 0.60 favorite gate, the 0.60 rerank gate, and the 0.80 verify gate stay. Do not add a paid odds service.

Checked against Illinois responses on 2026-11-19, then checked again the same day after the first draft. Counts and prices below are that snapshot. They move. League and competition ids are what the client should start from, and it should still match the league by name when a soccer id is seasonal. `FUTURE-IDEAS.md` points here.

## Goal

Today, DraftKings, BetMGM, and Caesars are books inside one The Odds API response. `postedMarket` in `odds/books.ts` keeps the first of FanDuel, DraftKings, BetMGM, and Caesars (`williamhill_us`) that posted the market. `ODDS_SOURCE=fanduel` already skips that response and reads FanDuel's own sportsbook JSON in `odds/fanduel.ts`. Formula 1 (`motorsport_f1`) always takes that FanDuel path.

Build the same kind of client for DraftKings, then Caesars, then BetMGM. Each client returns the event shape `parseOddsBody` already accepts. Then add one merged read that puts all four books on `bookmakers`. That merged read is what lets the live `fetch` to `api.the-odds-api.com` come out. Old Odds API cache files stay readable.

## Do not

- Do not call SockOdds, TheRundown, OddsPapi, PropLine, SportsGameOdds, or any other paid odds API.
- Do not lower a gate, add a parlay leg type, or change book order.
- Do not scrape HTML for prices.
- Do not log a request URL, a client id, a WAF token, or a shell command that contains one.
- Do not commit a BetMGM access id. Read it at runtime from client config. A high-entropy constant in git is what the secret scan flags.
- Do not delete the Odds API parser or the files in `odds-cache/` that have no `source`. A save with no `source` is a The Odds API save.

## Event shape the boards already read

`parseEvent` in `odds/cache.ts` keeps `id`, `commence_time`, `home_team`, `away_team`, and `bookmakers`. Extra fields are dropped. `commence_time` is `YYYY-MM-DDTHH:MM:SSZ` with no milliseconds (`oddsStamp` in `slate/window.ts`). Each bookmaker has `key` and `markets`. Each market has `key` and `outcomes`. Each outcome has `name`, `price` (a finite number, American), and optional `point` and `description`. `parseOutcome` throws if `price` is a string.

Game markets the Games board asks for:

| Market key | What it is |
| --- | --- |
| `h2h` | Moneyline. Soccer includes an outcome named `Draw`. The board drops Draw and Tie. The favorite uses that one American price. It does not remove the draw and reprice the other two. |
| `spreads` | One line per team. `name` matches the team. `point` is that team's number. |
| `totals` | Outcomes named exactly `Over` and `Under`, same `point`. |

One direct book puts one bookmaker on the event. The merged read puts up to four.

Prop market keys already requested, by sport. These lists are the `markets` arrays in `sports/football/props.ts`, `sports/basketball/index.ts`, `sports/hockey/index.ts`, `sports/soccer/index.ts`, and `sports/baseball/index.ts`.

| Sport | Keys |
| --- | --- |
| NFL and NCAAF | `player_anytime_td`, `player_pass_yds`, `player_reception_yds`, `player_rush_yds`, `player_receptions`, `player_pass_tds`, `player_pass_completions`, `player_rush_attempts`, `player_kicking_points`, `player_field_goals` |
| NBA | `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_blocks`, `player_steals` |
| NHL | `player_goal_scorer_anytime`, `player_points`, `player_shots_on_goal`, `player_assists`, `player_total_saves`, `player_power_play_points` |
| Soccer, except Champions League | `player_goal_scorer_anytime`, `player_shots`, `player_shots_on_target`, `player_assists`, `player_to_receive_card` |
| MLB | `batter_hits`, `batter_home_runs`, `batter_rbis`, `pitcher_strikeouts`, `batter_total_bases`, `batter_stolen_bases` |

Champions League `props` is `false`. Do not request props for it.

`postedLines` in `props/board.ts` reads `description` as the player name when `name` is `Over`, `Under`, `Yes`, or `No`. A yes price can also use the player name as `name` and leave `description` off. A two-sided prop needs both `Over` and `Under`. A one-sided `Over` is shown. Do not use that to turn a milestone ladder into a line. `220+`, `|150+|`, and a single option named `Yes` on "50+ yards" are not an over/under. Map a yes market only for the anytime props the board already treats as yes: football anytime TD, soccer anytime goal, NHL anytime goal.

## Where the code changes

| File | Change |
| --- | --- |
| `odds/draftkings.ts` | New. `draftkingsFetch(url)` and the normalizer. |
| `odds/caesars.ts` | New. `caesarsFetch(url)`. |
| `odds/betmgm.ts` | New. `betmgmFetch(url)`. |
| `odds/fanduel.ts` | Export `pickBalanced` so the other clients use the same soccer-line score. Do not copy a second scorer. |
| `odds/cache.ts` | `oddsSource` accepts `draftkings`, `betmgm`, `caesars`, and later `books`. `oddsSourceLabel` prints those names. An unknown id stays blank, which hides the header. `oddsGet` calls the matching fetch. Cache prefix is `{source}-` plus the hash. `replayMissError` names every other source that saved that day, not only the one opposite of FanDuel. |
| `decisions/judge.ts` | `requireRunKeys` skips `ODDS_API_KEY` for every direct source, the way it already skips it for `fanduel`. |
| `props/board.ts` | The same skip. Line 284 throws when `ODDS_API_KEY` is missing and `ODDS_SOURCE` is not `fanduel`. The cache sentence and the credit-floor skip must not say a direct book spent credits. |
| `slate/board.ts` | Keep building the Odds API URL. The source switch happens inside `oddsGet`. The live log and `cacheSentence` name the book. They must not say the run spent credits. |
| `odds/books.ts` | Leave the order. Caesars stays `williamhill_us` on the bookmaker so `bookLabel` still prints Caesars. |
| `.env.example`, `README.md`, `AGENTS.md`, `handoff.md` | Document the new `ODDS_SOURCE` values when they work. `SavedSlate.oddsSource` is how the header gets its label. |
| `changelog.md` | One entry when the behavior lands. Not for this spec. |
| `test/pure.test.ts` | Normalizers from saved fixtures. No network. |

`odds/fanduel.ts` stays the FanDuel client. Share `buildTeamIndex` and `resolveTeamName`. Illinois only. Timeout 30 seconds. A network failure before any response may be retried once. Do not retry a priced response. Do not put the request URL in the error.

## Source ids

| `ODDS_SOURCE` | Bookmaker `key` on the event | Header label | Cache prefix |
| --- | --- | --- | --- |
| `fanduel` | `fanduel` | FanDuel | `fanduel-` |
| `draftkings` | `draftkings` | DraftKings | `draftkings-` |
| `betmgm` | `betmgm` | BetMGM | `betmgm-` |
| `caesars` | `williamhill_us` | Caesars | `caesars-` |
| `books` | up to all four | `FanDuel · DraftKings · BetMGM · Caesars`, omitting a book that failed | `books-` |
| unset | The Odds API response, many keys | The Odds API | no prefix |

`readHit` already rejects a file whose recorded `source` does not match. A `books-` file must not satisfy a `draftkings` or `the-odds-api` lookup. A file with no `source` stays The Odds API.

`motorsport_f1` stays forced to FanDuel in `oddsRequestSource` until another book posts the race. Caesars' Formula 1 competition tabs returned championship futures, not a race card. Do not switch F1 because the menu name exists.

## How a client is called

`fanduelFetch` reads an Odds API-shaped URL. A path containing `/events/` is one game's props. Anything else is a slate. The slate reads `commenceTimeFrom` and `commenceTimeTo` and drops events outside that window inside `fanduelSlate`. Each new client does the same read. The boards keep building `https://api.the-odds-api.com/v4/sports/{oddsKey}/odds?...` and `.../events/{id}/odds?...`.

For one book, `id` is that book's event id. The prop URL comes back with that id.

`parseEvent` drops every field except `id`, so a merged event cannot hide book ids on the side. For `ODDS_SOURCE=books`, set `id` to:

```
fd=<fanduel id>,dk=<draftkings id>,mgm=<betmgm id>,czr=<caesars id>
```

Leave a segment empty when that book has no game (`dk=`). BetMGM ids look like `6:44037` and contain a colon, so the separator is a comma, not a colon. The prop fetch splits that id and asks each client for its own segment. An empty segment adds no markets.

Match games across books by the two ESPN display names and the `America/New_York` calendar date of `commence_time`. Do not add an hour window. A game that one book stamps after Eastern midnight stays its own event. Do not match on book event ids.

## DraftKings

No login. No client id. Node `fetch` returned 200 with a browser `User-Agent`, `Origin: https://sportsbook.draftkings.com`, and `Referer: https://sportsbook.draftkings.com/`. Python `urllib` to the same URL returned Akamai 403. Use Node `fetch`. If a later run returns 403, stop and record the status. Do not add a paid fallback.

### Slate

```
GET https://sportsbook-nash.draftkings.com/sites/US-IL-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets
```

Query:

| Param | Value |
| --- | --- |
| `isBatchable` | `false` |
| `templateVars` | league id |
| `eventsQuery` | `$filter=leagueId eq '{leagueId}' AND clientMetadata/Subcategories/any(s: s/Id eq '{subId}')` |
| `marketsQuery` | `$filter=clientMetadata/subCategoryId eq '{subId}' AND tags/all(t: t ne 'SportcastBetBuilder')` |
| `include` | `Events` |
| `entity` | `events` |

Encode the two `$filter` values. This markets URL is the slate. The league URL below is only the id check.

```
GET https://sportsbook-nash.draftkings.com/sites/US-IL-SB/api/sportscontent/v1/leagues/{leagueId}
```

That body has `sports`, `leagues`, `events`, `markets`, `selections`, `categories`, `subcategories`. Its `events` count can be higher than the Game subcategory. College football's league payload had 75 events. Subcategory `4518` had 73. Use the subcategory response.

Game-line ids, markets URL, 2026-11-19:

| League | League id | Subcategory | What came back |
| --- | --- | --- | --- |
| NFL | `88808` | `4518` Game | Moneyline, Spread, Total. 29 events. |
| College Football | `87637` | `4518` Game | Moneyline, Spread, Total. 73 events. |
| NBA | `42648` | `4511` Game | Moneyline, Spread, Total. 6 events. |
| NHL | `42133` | `4525` Game | Moneyline, Puck Line, Total. 12 events. |
| MLB | `84240` | none | One futures event, World Series 2027. Subcategories on the last pass were Cy Young, MVP, and Champion. No game line. Return an empty slate. |
| English Premier League | `40253` | `4514` Moneyline, `13170` Spread, `13171` Total Goals | 20 events on each request. |
| Champions League | `40685` | same three | 18 events on the moneyline request. `41410` is the Europa League. |
| Spain - La Liga | `40031` | same three | 20 events on the moneyline request. |
| Italy - Serie A | `40030` | same three | 20 events. |
| Germany - Bundesliga | `40481` | same three | 18 events. |
| France - Ligue 1 | `40032` | same three | 17 events. |

Football, NBA, and NHL put moneyline, spread, and total in one subcategory. Soccer needs three requests. Skip a subcategory whose name says Alternate, Quarter, Half, or Period. NFL alternate spread is `13195`. NBA alternate spread is `13202`. Skipping only `13202` leaves the NFL alternates in.

### Response

Top-level keys: `sports`, `leagues`, `events`, `markets`, `selections`, `subscriptionPartials`.

Event fields: `id`, `name`, `startEventDate`, `participants[]`. A participant has `name`, `id`, and `venueRole` of `Home` or `Away`. Home and away come from `venueRole`. Do not parse `name`.

Names seen, which are short forms: `IND Colts @ HOU Texans`, `POR Trail Blazers @ MIL Bucks`, `MTL Canadiens @ CAR Hurricanes`, `Man City vs Fulham`, `Galatasaray vs Aston Villa`. Resolve `participants[].name` through the ESPN index. Add an alias when the short form misses. A miss keeps the posted name.

Market fields: `id`, `eventId`, `name`, `subcategoryId`, `marketType`. `marketType.name` is `Moneyline`, `Spread`, `Total`, `Puck Line`, or `Total Goals`.

Selection fields: `id`, `marketId`, `label`, `displayOdds.american`, `outcomeType`, `points`.

`displayOdds.american` is a string. The minus sign is often U+2212 (`−`, code point 8722), not a hyphen. Strip `+`, map that character to `-`, then `Number`. `outcomeType` is `Home`, `Away`, `Tie`, `Over`, or `Under`.

NFL Colts at Texans, subcategory `4518`, on the recheck:

- Moneyline Away `+500`, Home `−690`.
- Spread Away `points` 12.5, Home `points` -12.5.
- Total Over and Under at `points` 44.5.

Soccer moneyline has three selections. Draw is `outcomeType: "Tie"` and `label: "Draw"`. Map that outcome name to `Draw`. Man City vs Fulham was Home `−260`, Draw `+425`, Away `+650`.

Soccer spread and total each return the whole ladder in one market. Man City's spread market was one market and ten selections. The points were ±3.5, ±2.5, ±1.5, and two selections at `0.5` plus two at `-0.5`. `pickBalanced` chooses among markets. It does not choose a pair inside one market. FanDuel can call it because each goal line is its own market. For this DraftKings market, pair each selection with the opposite sign at the same absolute point, drop a pair that is missing a side, and keep the pair whose closer price has implied probability nearest 0.5. That is the same score `pickBalanced` uses on a market: the minimum of `abs(implied - 0.5)`. If two pairs share a point, score them separately and keep the winner.

`startEventDate` example: `2026-11-20T01:15:00.0000000Z`. Run it through `oddsStamp`.

### Props

Same markets URL, different subcategory. The list is on `GET /v1/leagues/{id}`.

NFL shapes read from the markets URL on the last pass. Each of these returned 13 events:

| Subcategory | Id | Shape |
| --- | --- | --- |
| Pass Yards O/U | `9524` | 26 markets. `Joe Burrow Passing Yards O/U`, `marketType.name` `Passing Yards O/U`. Selections `Over` and `Under`, `outcomeType` `Over` and `Under`, `points` 303.5. |
| Rush Yards O/U | `9514` | 65 markets. `James Cook Rushing Yards O/U`. Over and Under, `points` 91.5. |
| Receptions O/U | `14115` | 123 markets. `Ja'Marr Chase Receptions O/U`. Over and Under, `points` 8.5. |
| Pass Yards | `16569` | Milestones. `Joe Burrow Passing Yards`, `marketType.name` `Passing Yards Milestones`. Labels `220+`, `230+`, `outcomeType` null, `points` null. Do not map this onto `player_pass_yds`. |
| TD Scorer | `12438` | Three markets per event: `Anytime TD Scorer`, `First TD Scorer`, and `2+ TDs`. |

Anytime TD Scorer is `marketType.name` `Anytime Touchdown Scorer`. Each selection is one player: `label` `Chase Brown`, `outcomeType` `ToScoreAnyTime`, American price, `points` null. Bengals at Commanders had 28 of those selections. Map only `ToScoreAnyTime` to `player_anytime_td` as `Yes`, with the label on `description`. `ToScoreFirst` is the first scorer. `ToScore2OrMore` is the 2+ market. Leave both of those off.

The player name on an O/U is the market name with the stat suffix removed (` Passing Yards O/U`, ` Rushing Yards O/U`, ` Receptions O/U`). Put it on `description`. `displayOdds.american` still uses U+2212 on the negative prices in these markets. Alternate, quarter, and half subcategories stay out.

## Caesars

No login. Node `fetch` returned 200 without a WAF token when these headers were set:

| Header | Value |
| --- | --- |
| `User-Agent` | a current desktop browser string |
| `Accept` | `application/json` |
| `Origin` | `https://sportsbook.caesars.com` |
| `Referer` | `https://sportsbook.caesars.com/` |
| `x-platform` | `rn-web` |
| `x-platform-type` | `W` |
| `x-app-version` | `10.7.7` |
| `x-unique-device-id` | any UUID the client generates and reuses |

Python `urllib` returned 403. A request that omitted these headers returned 403. The page also sends `x-aws-waf-token`. That token was not required for the Node calls. If Node later returns 403, record the status and stop. Do not scrape a WAF token into the repo.

Base:

```
https://api.americanwagering.com/regions/us/locations/il/brands/czr/sb
```

### Menu

```
GET /v3/sports-menu
```

Body is an array. Each sport has `sportId` and `competitions[]`. A competition has `id` (UUID) and `name`. `events` on the menu is empty. That is not the slate. The menu name for the Premier League is `England Premier League`, not `English Premier League`.

| League | `sportId` | Competition id |
| --- | --- | --- |
| NFL | `americanfootball` | `007d7c61-07a7-4e18-bb40-15104b6eac92` |
| NCAAF | `americanfootball` | `b7eda1b3-0170-4510-9616-1bce561d7aa7` |
| NBA | `basketball` | `5806c896-4eec-4de1-874f-afed93114b8c` |
| NHL | `icehockey` | `b7b715a9-c7e8-4c47-af0a-77385b525e09` |
| MLB | `baseball` | `04f90892-3afa-4e84-acce-5b89f151063d` |
| England Premier League | `football` | `00200de2-37f3-4339-9e3d-9bf8cb5eb34b` |
| UEFA Champions League | `football` | `9749ba20-1aa4-4f10-8014-af726d2c6fc5` |
| Spanish La Liga Primera | `football` | `3b0cbb27-7923-47a9-8117-bcec252162d2` |
| Italian Serie A | `football` | `e36a8c54-4451-418e-9842-118d8523a421` |
| German Bundesliga | `football` | `5cda9342-5f65-4483-af53-4a7b786832e2` |
| French Ligue 1 | `football` | `c06e1f2d-c704-47f7-9949-63c536db2b7d` |
| Formula 1 | `motorsport` | `79b3567a-c9b7-4ba8-ac72-4b4580357bda` |

Soccer's `sportId` is `football`. American football's is `americanfootball`. Re-read the menu if a competition id 404s. German Bundesliga 2 and the Austrian Bundesliga are different rows. Do not use them.

These are not the events API:

- `/v4/competitions/{id}`, `/v3/competitions/{id}`, `/v4/events?competitionId=`, `/v3/events?competitionId=`, `/v3/events/highlights/?competitionId=` return 404.
- `/v4/events/highlights?competitionId=` returns 200 and a placeholder event with empty `keyMarketGroups`. Ignore it.
- `/v4/sports/americanfootball/tabs?competitionId=` ignores the query and returns the featured NFL list.
- `GET /v4/sports/americanfootball/tabs` featured tab is 12 NFL events. The competition URL below had 30.

### Slate

```
GET /v4/sports/{sportId}/competitions/{competitionId}/tabs
```

200. `competitions[0].events[]` is the slate. `tabs[]` has `displayName` and `dataPath`. `secondaryTabs[]` is the other market groups.

Counts on the recheck:

| League | Events | First market group |
| --- | --- | --- |
| NFL | 30 | Game Lines, `standard_six_pack`: Spread, Money Line, Total Points |
| NCAAF | 60 | Game Lines. One sample game had Spread and Total and an empty middle market. Skip a market with no selections. |
| NBA | 7 | Game Lines six-pack |
| NHL | 14 | Game Lines: Puck Line, Money Line, Total Goals |
| MLB | 1 | 2027 World Series outright. Not a game slate. |
| Formula 1 | 2 | Championship futures. Not a race. |
| England Premier League | 10 | 90 Minutes, Match Betting, three-way |
| Champions League | 18 | 90 Minutes, three-way |
| La Liga | 10 | 90 Minutes, three-way |
| Serie A | 10 | 90 Minutes, three-way |
| Bundesliga | 9 | 90 Minutes, three-way |
| Ligue 1 | 9 | 90 Minutes, three-way |

An event has `id`, `name`, `startTime`, `sportId`, `competitionId`, `competitionName`, `active`, `started`, `keyMarketGroups[]`. NFL sample: `Indianapolis Colts at Houston Texans`, `2026-11-20T01:15:00Z`, id `faa98a96-ed6b-e0a9-94c7-71f707d9e752`.

`keyMarketGroups[].markets[]` is the line.

| Market | `gtpMarketClass` | Price | Line |
| --- | --- | --- | --- |
| `\|Money Line\|` | `HEAD_TO_HEAD` | `price.a` number | none. NFL period `MATCH_INC_OT`. |
| `\|Spread\|` or `\|Puck Line\|` | `HANDICAP` | `price.a` | `market.line`. Home gets that number. Away gets the opposite sign. The selection does not carry the point. |
| `\|Total Points\|` or `\|Total Goals\|` | `OVER_UNDER` | `price.a` | `market.line` |
| Soccer `\|Match Betting\|` or `\|90 Minutes\|` | `WIN_DRAW_WIN` | `price.a` | none. Selection `type` is `home`, `draw`, or `away`. |

Selections use `type` `home`, `away`, `over`, `under`, `draw`, or `generic`. `generic` is a future. Skip it. Names are wrapped in pipes, and a slash can add more pipes: `|Bodo|/|Glimt|`. Remove every `|`. `price.a` is already a number (`-114`, `500`).

Colts at Texans on the recheck: away moneyline `500`, home `-750`, spread `market.line` `-12.5`, total `market.line` `44`. DraftKings had 44.5 and a home moneyline of `−690` on the same game. That difference is the books.

NHL moneyline and total had `metadata.period` null. Puck line was `FULL_TIME`. Keep the Game Lines six-pack. Do not require `MATCH_INC_OT` on hockey. Skip a market whose name or period is a quarter, half, or period.

Soccer spread and total are not in the default `keyMarketGroups`. They are secondary tabs on the same competition URL. The EPL secondary names include `90 Minutes`, `Total Goals`, `Spread`, and `Goalscorers`.

- `90 Minutes`: `|Match Betting|`, `WIN_DRAW_WIN`. Man City `-260`, Draw `400`, Fulham `575`. Map `draw` to the outcome name `Draw`.
- `Total Goals`: one `|Total Goals|` market, `OVER_UNDER`, `market.line` `3.5`, Over and Under. 10 events. Use that line unless the tab grows a ladder, in which case use `pickBalanced`.
- `Spread`: one `|Spread|` market, `HANDICAP`, `market.line` `-1.5` on Man City (home). Away gets `+1.5`.
- `Goalscorers`: `|Anytime Goalscorer|`, class `SCORER`, one selection per player. `type` is `home` or `away` for the team, not an over. Map to `player_goal_scorer_anytime` as `Yes` with the player on `description`.

The sport-wide Matches tab (`/v4/sports/football/tabs`, display name `Matches`) is the wrong slate. Its default secondary is a 2-way "To Win Match" and, on the recheck, only a few MLS and NWSL games. Its 90 Minutes secondary is every soccer league at once (609 events). Use the competition URL so the league is already filtered. Do not map a 2-way "To Win Match" onto `h2h`.

### Props

```
GET /v4/events/{eventId}
```

200 for the Colts id above. `/v3/events/{id}` 404s. The body has `tabs[]` with `displayName` and `dataPath`. A tab path looks like `/v4/events/{id}/tabs/Passing`. The event payload itself is the selected tab. Props come from GET of the tab path.

Read on the Colts event:

| Tab | What is there |
| --- | --- |
| `TD Scorer` | `|Player to Score a Touchdown|`, class `SCORER`, one selection per player (`|David Montgomery|`, type `home` or `away`, `price.a` a number). Also `|First Touchdown Scorer|`, `|Player to Score 2+ Touchdowns|`, and game totals such as `|Longest Touchdown Yardage In Game|`. |
| `Passing` | Two-sided `|C.J. Stroud Total Passing Yards|`, class `OVER_UNDER`, `market.line` 253.5, selections `|Over|` and `|Under|`. Same shape for `|Daniel Jones Total Passing Yards|` at 179.5. Also two-sided `Total Passing Touchdowns` (lines 1.5 and 0.5) and `Total Passing Completions`. Beside those, `|Daniel Jones - Passing Yards|` is a milestone ladder (`|150+|`, type `over`, no under). |
| `Receiving` | 14 markets, every one a milestone `|Player - Receiving Yards|` with type `over` only. No two-sided receiving market on this event. |
| `Rushing` | 6 markets, every one a milestone `|Player - Rushing Yards|`. No two-sided rushing market on this event. |
| `Kicking` | `|Spencer Shrader Total Field Goals|` and `|Ka'imi Fairbairn Total Field Goals|`, `OVER_UNDER`, `market.line` 1.5. `|Player Total Kicking Points|` is the same shape (lines 9.5 and 5.5). `|Total Field Goals|` with no player is a game prop. Leave it off. |

Map `|Player to Score a Touchdown|` to `player_anytime_td` as `Yes`. Do not also emit first scorer, 2+, or 3+.

Map a market onto a prop key only when `gtpMarketClass` is `OVER_UNDER`, both `over` and `under` selections exist, and the name contains `Total` plus the stat. The player is the name with the pipes and the ` Total …` suffix removed.

| Name contains | Key |
| --- | --- |
| `Total Passing Yards` | `player_pass_yds` |
| `Total Passing Touchdowns` | `player_pass_tds` |
| `Total Passing Completions` | `player_pass_completions` |
| `Total Receiving Yards` | `player_reception_yds` |
| `Total Rushing Yards` | `player_rush_yds` |
| `Total Receptions` | `player_receptions` |
| `Total Rushing Attempts` | `player_rush_attempts` |
| `Total Field Goals` and a player name | `player_field_goals` |
| `Total Kicking Points` | `player_kicking_points` |

`market.line` is the point. Skip a name that contains `1st Quarter`, `Half`, `Passing+Rushing`, `Longest`, `Interceptions`, or `Passing Attempts`. A name shaped `|Player - Passing Yards|` is the milestone ladder. Leave it unmapped. On this event, receiving yards, rushing yards, and receptions stay no line because the two-sided market was not posted.

## BetMGM

No login. The access id is public config, and it must be loaded, not committed.

### Config

Node `fetch` returned 200 for:

```
GET https://www.il.betmgm.com/en/api/clientconfig?browserUrl=http%3A%2F%2Fwww.il.betmgm.com%2Fen%2Fsports
```

Headers: a desktop `User-Agent`, `Accept: application/json`, `x-bwin-browser-url` set to the same percent-encoded `http%3A%2F%2Fwww.il.betmgm.com%2Fen%2Fsports` string the page sends, `x-from-product: host-app`, and `x-bwin-sports-api: prod`.

Read `msConnection.publicAccessId`, `msConnection.cdsApiUrl`, and `msConnection.culture`. On the recheck those were `cdsApiUrl` `https://www.il.betmgm.com/cds-api` and culture `en-us`. `msCds.maxFixtureBatchSize` is 50. Cache the access id in memory for the process. Refresh it when a fixtures call returns 401 or 403 from a client that was already getting 200. Do not refresh in a loop.

### Transport

`GET {cdsApiUrl}/bettingoffer/fixtures` is not the same as client config.

- Python `urllib` with a browser `User-Agent` and `Accept: application/json` returned 200.
- `curl --http1.1` with those two headers returned 200.
- `curl` on its default HTTP/2 returned 403 HTML.
- Node `fetch` returned 403 HTML.
- `node:https` on HTTP/1.1 returned 403 HTML.

The 403 is from this machine's Node client, not from a bad access id. The same id worked in Python and in `curl --http1.1` immediately after. Do not log that URL. The access id is a query parameter, `x-bwin-accessid`.

Until a Node request returns 200, call these URLs with `curl --http1.1 -sS` and parse stdout. The fixtures URL was the one curl checked. Fixture-view was checked with Python `urllib`, which is also HTTP/1.1. Use the same curl transport for both. Do not print the command. If the call returns non-200, record the status and stop. Do not add a paid fallback and do not scrape a clearance cookie into the repo.

### Slate

```
GET {cdsApiUrl}/bettingoffer/fixtures
```

Query, beside the access id:

| Param | Value |
| --- | --- |
| `lang` | `en-us` |
| `country` | `US` |
| `userCountry` | `US` |
| `subdivision` | `US-Illinois` |
| `state` | `Latest` |
| `offerMapping` | `Filtered` |
| `offerCategories` | `Gridable` |
| `fixtureCategories` | `Gridable` |
| `sportIds` | one sport id |
| `competitionIds` | the competition id once you have it |
| `isPriceBoost` | `false` |
| `statisticsModes` | `None` |
| `scoreboardMode` | `Full` |

Without `scoreboardMode=Full`, `context` is an opaque string and there is no competition object. With it, the fixture has `sport`, `competition`, and `region`.

Sport ids on the recheck:

| Sport id | What came back |
| --- | --- |
| `11` | American football. 74 fixtures: NCAAF competition `103495` parent `211`, 60 games; NFL competition `103489` parent `35`, 14 games. `competitionIds=35` and `competitionIds=103489` each returned those 14. |
| `7` | Basketball. 160 fixtures. NBA is not the bulk of that list. Filter `competitionIds=6004`. That returned 7 NBA games. NCAAM is competition `264`. |
| `12` | Hockey. 76 fixtures. NHL is competition `34`, parent `34`, region USA, 12 games. College ice hockey is `12500`. |
| `23` | Baseball. 0 fixtures on the last pass. Return an empty slate. Do not turn a futures outright into a game. |
| `4` | Soccer. 644 fixtures. Filter by competition. |

Soccer competition ids are seasonal. Resolve by `competition.name.value` plus `region.name.value` every run. The ids that matched on the recheck:

| League | Competition id | Region | Games |
| --- | --- | --- | --- |
| Premier League | `102841` | England | 10 |
| UEFA Champions League | `102855` | Europe | 18 |
| LaLiga | `102829` | Spain | 10 |
| Serie A | `102846` | Italy | 10 |
| Bundesliga | `102842` | Germany | 18. Austria is a different Bundesliga. |
| Ligue 1 | `102843` | France | 9 |

Keep `fixtureType` `PairGame`. Skip a fixture whose `stage` is present and not `PreMatch`, or whose `isOpenForBetting` is false. Those two fields were on the earlier full fixture. `startDate` example: `2026-11-22T18:00:00.000Z`.

`name.value` is `Pittsburgh Steelers @ Philadelphia Eagles` or `Liverpool - Manchester United`. Do not parse it. `participants[]` includes players. Keep `properties.type` of `HomeTeam` and `AwayTeam` only.

### Markets on the fixture

`optionMarkets[]` on the gridable slate is the main grid. Market `parameters` is an array of `{ key, value }`. Read `MarketType`, `Period`, `Happening`, `MarketSubType`, `RangeValue`, and `DecimalValue` from those entries. Option `parameters` is an object, not that array. One option had `optionTypes: ["Over"]` and no point field. The point is in `name.value` (`Over 38`, `Pittsburgh Steelers -4`). `price.americanOdds` is a number. `price` also has `odds`, `numerator`, and `denominator`. Use `americanOdds`. Skip `status` other than `Visible`.

NFL grid on Steelers at Eagles, fixture id `6:44037`:

| Keep | Name | `MarketType` | `Period` | `Happening` | Sample |
| --- | --- | --- | --- | --- | --- |
| `h2h` | Moneyline | `2way` | `FullTime` | `Point` | Steelers `-210`, Eagles `175` |
| `spreads` | Spread | `2wayHandicap` | `FullTime` | `Point` | `Steelers -4`, `Eagles +4` |
| `totals` | Totals | `Over/Under` | `FullTime` | `Point` | `Over 38`, `Under 38` |

The same fixture also posted 1st quarter and 1st half moneylines, spreads, and totals. Skip any period other than `FullTime` for US games. Parse the trailing signed number on a spread name. Parse the number after Over or Under on a total.

Soccer period is `RegularTime`, not `FullTime`. Happening is `Goal`. `DecimalValue` on a total market was the string `3.5000` while the option name was `Over 3.5`. Prefer `DecimalValue` when it is present.

All 10 Premier League pair games had a `3way` / `Goal` / `RegularTime` market, and every one of them had a `MarketSubType` or a `RangeValue`. The one inspected up close was `Match result: Early payout` with `MarketSubType` `2Up3wayPricing`. Zero games had a plain `3way` with neither field set. Do not use the early-payout market as `h2h`. If the plain `3way` is absent, that game has no BetMGM moneyline.

None of the 10 Premier League grid fixtures had a `2wayHandicap` or a `Handicap` market. Totals are on the grid. The spread is on fixture-view. Newcastle United against Arsenal (`2:7910926`, 194 markets) had one full-game two-way: name `2-way spread (+0.5): Regular time`, `MarketType` `2wayHandicap`, `Period` `RegularTime`, `Happening` `Goal`. Options were `Newcastle United (0.5)` and `Arsenal (-0.5)`. The point is the signed number in parentheses on the option, not a trailing `-4` and not the number in the market name. Attach that point to the named team, then match the team to home or away. The same view had three `Handicap` markets named `3-way spread`, each with a `Handicap Tie` option. Leave every `Handicap` market off `spreads`. If several full-game `2wayHandicap` markets exist, keep the one whose closer price is nearest a 0.50 implied probability. Soccer spreads therefore cost one fixture-view per game. The grid is not enough.

### Props

```
GET {cdsApiUrl}/bettingoffer/fixture-view
```

Same access query, plus `fixtureIds` (the fixture `id`), `state=Latest`, `offerMapping=All`. `offerMapping=None` returned 0 markets on an earlier call. Steelers at Eagles returned 490 `optionMarkets`. `games` was empty. Props are `optionMarkets`.

`MarketType` `Over/Under` is not enough. The same happening mixes a two-sided line with `Yes` milestones. On Steelers at Eagles, FullTime counts were:

| Happening | Two-sided | The rest | Two-sided sample |
| --- | --- | --- | --- |
| `PassingYards` | 2 of 12 | `Yes` on `150+`, `250+` | `Aaron Rodgers - Passing Yards`, Over 205.5 / Under 205.5 |
| `ReceivingYards` | 4 of 29 | `Yes` on `75+`, `100+` | `Rico Dowdle - Reception Yards`, Over 9.5 / Under 9.5 |
| `RushingYards` | 4 of 23 | `Yes` on `50+` | `Rico Dowdle - Rushing Yards`, Over 36.5 / Under 36.5 |
| `TouchdownPass` | 2 of 12 | `Yes` on `2+`, `3+` | `Aaron Rodgers: Passing TDs`, Over 1.5 / Under 1.5 |
| `RushingAttempt` | 1 of 16 | `Yes` on `15+`, `17+` | `Jaylen Warren - Rushing Attempts`, Over 14.5 / Under 14.5 |
| `Reception` | 3 of 3 | none | `Saquon Barkley - Receptions`, Over 2.5 / Under 2.5 |
| `PassCompleted` | 0 of 8 | all `Yes` milestones | No completions O/U on this game. Leave `player_pass_completions` with no line. |

Map a market only when both an option named `Over …` and an option named `Under …` exist, the period is `FullTime` (or `RegularTime` for soccer), and the stat is one the board already asks for. The player is the market name before ` - ` or before `: `. The point is the number in the option name. A `Yes` option stays unmapped. Passing and receiving two-sided markets on this game were one line per player. If a player has more than one, keep the pair whose closer price is nearest a 0.50 implied probability.

`Touchdown` is a separate rule. This game had 87 FullTime markets of that happening. 21 were a player and one `Yes` option, named `DeVonta Smith to score 1+ TDs`. Map those to `player_anytime_td`. Two more 1+ markets were defenses, `PIT D/ST to score 1+ TDs`. Skip a name that contains `D/ST`. 24 markets were `2+` and 16 were `3+`. 20 were game totals such as `Total TDs O/U`, Over 3.5 / Under 3.5. Leave the totals, the 2+, the 3+, and `First home team TD scorer` off the anytime prop.

An earlier EPL fixture-view (`2:7901765`, Liverpool) had 194 `optionMarkets`, `games` empty, and happenings Goal, Corner, Shot, NonOwnGoal, Penalty, Offside, and Assist. Use the same Over/Under rule. Anytime goalscorer is the yes market, not a shot ladder.

Props are one fixture per request. Cap concurrency the way `props/board.ts` already caps work (`mapPool` of 3).

## Normalization rules that apply to every book

- `home_team` and `away_team` are the ESPN display names when the index hits, else the posted names.
- `h2h` outcome `name` is that same display name. Soccer draw is the string `Draw`.
- `spreads` outcome `name` matches the team. `point` is the team's number.
- `totals` outcome names are exactly `Over` and `Under`.
- Drop a selection that is suspended or not `Visible`. Drop a market that is not the full game. NFL, NBA, and NHL Game Lines that include overtime stay. Quarter, half, and period markets go.
- One spread and one total per event. When each line is its own market, `pickBalanced` chooses it. When one market holds the whole ladder, pair the sides first and use that same score.
- `commence_time` through `oddsStamp`.
- Drop events outside `commenceTimeFrom` and `commenceTimeTo`.

## Merge, then remove the live Odds API call

`ODDS_SOURCE=books` fetches FanDuel, DraftKings, BetMGM, and Caesars for the same sport and window. Match events by the two ESPN team names and the Eastern calendar date, as the id section says.

Put each book's markets on its own bookmaker object. `postedMarket` then picks the price. A book that throws is omitted and named in the board note. The other books still fill the slate. Cache the merged body with `source: "books"`.

The live call in `oddsGet` to `api.the-odds-api.com` comes out only when all of these are true:

1. `ODDS_SOURCE=books` returns moneylines for every league the slate walks that has games that day, or the note says which book did not post that league.
2. Spreads and totals follow the same rule. A BetMGM soccer game with no plain 3-way is a missing moneyline, not a bug.
3. Props that FanDuel already fills are either filled or left no line on purpose, per the tables above.
4. `npm start -- odds=YYYY-MM-DD` still opens a day whose files have no `source`.
5. `npm run odds` still lists that day and prints `ODDS_SOURCE=the-odds-api` when that is not the active source.
6. Formula 1 still reads FanDuel when the merged source is selected.
7. `npm test` and `npm run typecheck` pass with no network.

After that, `oddsSource()` defaults to `books` instead of `the-odds-api`. Keep the parser. Keep reading old files. Delete only the live Odds API `fetch` and the `ODDS_API_KEY` requirement.

## Tests

Save one trimmed fixture per book under `test/fixtures/` and normalize it in `test/pure.test.ts`. Cover:

- DraftKings unicode minus, soccer `Tie` mapped to `Draw`, the even-most soccer total, and `ToScoreAnyTime` kept while `ToScoreFirst` and `ToScore2OrMore` are dropped.
- Caesars pipes inside a name (`|Bodo|/|Glimt|`), spread `market.line` applied to home, away getting the opposite sign, a `draw` selection, and `|Player Total Passing Yards|` kept while `|Player - Passing Yards|` is dropped.
- BetMGM `FullTime` 2-way, spread parsed from `Pittsburgh Steelers -4`, soccer spread parsed from `Newcastle United (0.5)`, rejection of a `Handicap Tie` market, rejection of `2Up3wayPricing`, and rejection of a one-option `Yes` milestone whose `MarketType` is `Over/Under`.
- `replayMissError` when the day was saved by a third source.
- Cache file names `draftkings-`, `betmgm-`, `caesars-`, and `books-` do not collide with a hash that has no prefix.

No test calls a sportsbook.

## Verified on 2026-11-19

- DraftKings Node `fetch` returned the league payloads and the markets-URL slates, including the Colts prices and the Man City three-way. A later pass read subcategories `9524`, `9514`, `14115`, `16569`, and `12438` and got the Over/Under and anytime-touchdown shapes in the props table. The NFL Game subcategory still returned 200 with 29 events.
- Caesars Node `fetch` returned the menu, the competition tabs, the EPL secondaries, and the Colts event tabs `TD Scorer`, `Passing`, `Receiving`, `Rushing`, and `Kicking`. Passing and Kicking posted two-sided player totals. Receiving and Rushing on that event were milestone ladders. MLB was the 2027 World Series outright.
- BetMGM client config returned 200 from Node. Fixtures and fixture-view returned 200 from Python `urllib`. The fixtures URL returned 200 from `curl --http1.1` and 403 from Node `fetch`, `node:https`, and default curl. Premier League had no plain 3-way on the 10 pair games, and no spread on those 10 grids. Newcastle against Arsenal had the two-way spread on fixture-view. Steelers at Eagles had the two-sided yardage lines in the props table. Baseball sport `23` returned 0 fixtures.
- FanDuel's client was not called again for this spec. The Formula 1 path was not re-tested. The file references are from the current source.

Node `fetch` for DraftKings and Caesars was still 200 on the last pass. If a later run returns 403, record the status and stop. That rule is in the client sections above.

## Progress

Updated while the clients were built. The spec above stays the contract. This section is what has actually landed.

### Done

- `odds/draftkings.ts`, `odds/caesars.ts`, and `odds/betmgm.ts` return the event shape `parseOddsBody` already accepts. Illinois only. Timeout 30 seconds. A network failure before a response is retried once. A priced response is not retried. Errors name the book and the status and do not include the request URL.
- `pickBalanced` is exported from `odds/fanduel.ts`. DraftKings ladders and BetMGM ladders use that score. Team names go through `teamResolver`.
- `ODDS_SOURCE` accepts `draftkings`, `betmgm`, `caesars`, and `books`. Cache prefixes are `draftkings-`, `betmgm-`, `caesars-`, and `books-`. A file with no `source` is still The Odds API. `replayMissError` names every other source that saved that day.
- `ODDS_SOURCE=books` fetches all four books, matches on the two team names and the Eastern date, and sets `id` to `fd=,dk=,mgm=,czr=`. A book that throws is left off and named in the board note. The header omits a book that failed and never succeeded in that process.
- `requireRunKeys` and the props board skip `ODDS_API_KEY` for every direct source. The cache sentence does not say a direct book spent credits. Caesars stays `williamhill_us` on the bookmaker. Formula 1 still forces FanDuel, including when the source is `books`.
- Tests in `test/pure.test.ts` normalize the fixtures in `test/fixtures/` with no network. `npm test` (44) and `npm run typecheck` passed.
- A live read on 2026-11-20, counts only, no decision model and no slate rewrite:
  - DraftKings returned priced NFL, NCAAF, NBA, NHL, and all six soccer leagues, including moneylines, spreads, and totals. MLB was empty.
  - Caesars returned the same leagues with prices. NHL was a shorter list than DraftKings. MLB was empty.
  - BetMGM returned NFL, NCAAF, NBA, NHL, and the six soccer leagues. Premier League moneylines were absent because no game had a plain 3-way. That is the rule in the BetMGM section, not a dropped market. Soccer spreads came from fixture-view. NHL totals use the full-game name `Totals (including OT and shootouts)`. A recount after that name was accepted was 6 games, each with a moneyline, a spread, and a total. MLB was empty.
  - NFL props came back for all three books (anytime touchdown and passing yards). Soccer anytime goalscorer came back for all three. A milestone ladder was not turned into an over/under.

### Exit checklist

Done. The live Odds API fetch is gone, and an unset `ODDS_SOURCE` is `books`.

1. The four books were read separately, not as one merged `npm start`. A book that throws is named in the board note. A BetMGM soccer game with no plain 3-way has no BetMGM moneyline.
2. Spreads and totals were on those separate reads, including BetMGM soccer spreads from fixture-view.
3. Anytime touchdown, passing yards, and anytime goalscorer were priced. Other props stay no line when the book does not post a two-way line.
4. A replay of a file with no `source` still opens. The cache tests cover that. `ODDS_SOURCE=the-odds-api` is required because the default is now `books`.
5. `npm run odds` still lists that day and prints `ODDS_SOURCE=the-odds-api` when the active source is the books.
6. Formula 1 still takes the FanDuel path in `oddsRequestSource`.
7. `npm test` and `npm run typecheck` pass with no network.

`ODDS_API_KEY` is not read. The parser stays. Old files stay. A live request with `ODDS_SOURCE=the-odds-api` and no saved file throws instead of fetching.
