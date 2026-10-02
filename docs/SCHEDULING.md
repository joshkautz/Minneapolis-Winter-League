# Scheduling

A traditional season's games are generated, not entered. An admin generates
the regular season once; after that the only thing anyone enters is scores.
Pool night, championship night and every team's final placement follow from
them on their own.

Swiss seasons are not generated: they are paired one night at a time from
their standings, with the pairing guide on Game Management.

## Where things live

| Piece                                                             | What it is                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Functions/src/services/schedule/templates.ts`                    | The schedule tables: regular-season nights, pools, the bracket     |
| `Functions/src/services/schedule/standings.ts`                    | Seeds and pool order, with every tiebreaker                        |
| `Functions/src/services/schedule/plan.ts`                         | What games a season should have, from its teams, nights and scores |
| `Functions/src/services/schedule/sync.ts`                         | Writes the games and placements the plan calls for                 |
| `generateSchedule`                                                | Admin callable: preview, then create, the regular season           |
| `updatePlayoffs`                                                  | Admin callable: bring the playoffs up to date now                  |
| `updatePlayoffsOnGameChange`                                      | Trigger: the same update, on every write to a game                 |
| `App/src/features/admin/game-management/season-schedule-card.tsx` | The Game Management card for both                                  |

## The season's nights

Games are played on every Saturday from the season's first day to its last,
except the Saturday after Thanksgiving (`leagueNights` in
`shared/leagueCalendar.ts`). The last two are the playoffs; the rest are the
regular season. There are tables for four and five regular-season nights, so
a season of six or seven nights can be generated:

| Season length | Regular season | Then                           |
| ------------- | -------------- | ------------------------------ |
| 6 nights      | 4 nights       | pool night, championship night |
| 7 nights      | 5 nights       | pool night, championship night |

Season 5 (7 November to 19 December 2026) is six nights: regular season on
7, 14 and 21 November and 5 December, pool night 12 December, championship
night 19 December.

Every night has four rounds — 6:00, 6:45, 7:30 and 8:15 — of three games, one
per field.

## The regular season

Twelve teams, numbered in the order they registered. Every team plays twice
a night, back to back: six teams play the first two rounds, the other six
the last two. This is the league's spreadsheet format.

The tables were searched for so that, over the season:

- no two teams meet twice (eight different opponents in four nights, ten in
  five);
- every team plays early on half its nights (two of four; two or three of
  five) — the spreadsheet had two teams early every week and five early once;
- every team is at home for half its games;
- every team plays a fair share of its games on each field.

`templates.test.ts` pins each of these, so a mistyped number in a table
fails the suite.

Generating refuses a Swiss season, one that already has any games, one
without exactly twelve registered teams, and one whose number of nights has
no table. The preview on Game Management shows every game before any is
created.

## Pool night

Once every regular-season game has a score, the teams are seeded 1 to 12:

1. wins;
2. point differential — so far the order the Standings page shows;
3. among teams still level, wins in the games between them;
4. points scored;
5. the roster's average player rating (all-time, from the rankings);
6. who registered first.

A game that ended level is a win for neither team.

The seeds play in four pools of three, each a round robin, as Seasons 1 and
3 did: {1, 8, 9}, {2, 7, 10}, {3, 6, 11}, {4, 5, 12}. Seeds 2 and 3 play the
first and last rounds and sit out the two between; every other team has at
most one round off.

| Round | Field 1 | Field 2 | Field 3 |
| ----- | ------- | ------- | ------- |
| 6:00  | 1 – 8   | 3 – 11  | 2 – 7   |
| 6:45  | 8 – 9   | 4 – 12  | 6 – 11  |
| 7:30  | 1 – 9   | 5 – 12  | 7 – 10  |
| 8:15  | 3 – 6   | 4 – 5   | 2 – 10  |

## Championship night

Each pool's teams are ordered by wins in the pool, then point differential
in the pool, then seed. Field 1 decides places 1–4 between the pools'
winners, field 2 places 5–8 between their seconds, and field 3 places 9–12
between their thirds:

| Round | On each field                   |
| ----- | ------------------------------- |
| 6:00  | pool 1's team against pool 4's  |
| 6:45  | pool 2's team against pool 3's  |
| 7:30  | the two losers, for third place |
| 8:15  | the two winners, for first      |

The 7:30 and 8:15 games on a field are created once that field's first two
games have scores, so enter those as the night goes on. A level playoff game
decides nothing: the games after it wait until the score is corrected.

When every championship game has a winner, each team's `placement` is
written on its team-season, which is what the Results table and the
Champions, Runner-up, Podium and Dynasty badges read.

## When it runs

`updatePlayoffsOnGameChange` runs the update on every write to a game in a
generated season (`seasons/{id}.automaticPlayoffs`, set when the regular
season is generated). **Update playoffs now** on Game Management runs the
same thing by hand, and says what the next step is waiting for.

The update is a transaction that only creates what is missing, under an id
of the season and slot (`season-5_pool-r1-f2`), so scores entered at the
same moment cannot create a game twice, and its own writes firing the
trigger again find nothing to do. A game moved from one season to another
updates both.

- **A corrected score** re-pairs a playoff night's games only until one of
  them has a score. After that the night is played as paired: re-pairing
  the rest would have teams meet twice or play on two fields. The update
  says which games it kept (`kept`), on Game Management and as a warning in
  the logs, for an admin to change by hand if they should.
- **Pools are ranked as played.** Each pool is whoever its three slots hold,
  so a game an admin re-paired by hand counts with the pool it was played
  in. If the stored games no longer make four pools of three, or
  championship night no longer places each team once, the update waits and
  says so rather than guessing.
- **Generated playoff games are found by `playoffSlot`**, not by time or
  field, so an admin can move one and it stays moved.
- **A slot is taken by any game at its time and field.** A game an admin
  entered there by hand is left alone, and the update creates the rest and
  reports the slot. Moving that game to another time or field, or deleting
  it, frees the slot; nothing is ever created where a game already stands.
- **A deleted generated game comes back** at the next update: the schedule
  calls for it. A game called off still needs a result: enter it as a forfeit.
- **A season that cannot be scheduled** — a team dropped out, say — is logged
  and skipped rather than retried.

Seasons scheduled by hand, including every season before Season 5, have no
`automaticPlayoffs` flag, and the trigger leaves them alone.
