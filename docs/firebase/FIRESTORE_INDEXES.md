# Firestore Indexes

`firestore.indexes.json` is the source of truth: 17 composite indexes and 6
single-field overrides, deployed by CI with the rules.

**The emulator does not enforce composite indexes.** A query that needs a
missing one passes locally and in every test suite, and fails only in
production, with an error naming the index to create. When you add a query
that filters on more than one field, or filters on one and orders by
another, add its index to the file in the same change.

## Composite indexes

| Collection      | Scope            | Fields                 | Serves                                                     |
| --------------- | ---------------- | ---------------------- | ---------------------------------------------------------- |
| `games`         | collection       | season, type           | a season's regular or playoff games; Swiss rankings        |
| `games`         | collection       | season, date           | a season's games in order; the rankings rebuild            |
| `games`         | collection       | home, date             | a team's games (with the next), and `mergeTeams`           |
| `games`         | collection       | away, date             | as above, for the away side                                |
| `games`         | collection       | date, field            | `updateGame`'s check that a slot is free                   |
| `offers`        | collection       | player, team           | the offers between one player and one team                 |
| `offers`        | collection       | team, season           | a team's offers in a season                                |
| `offers`        | collection       | player, season, status | a player's pending offers, cancelled when they join a team |
| `offers`        | collection       | player, type, status   | a player's pending invitations or requests                 |
| `offers`        | collection       | team, type, status     | a team's pending invitations or requests                   |
| `players`       | collection       | firstname, lastname    | the player search                                          |
| `players`       | collection       | lastname, firstname    | the player search, by surname                              |
| `news`          | collection       | season, createdAt desc | the news feed                                              |
| `posts`         | collection       | season, createdAt desc | the message board                                          |
| `teamSeasons`   | collection group | season, registered     | the registration lock counting registered teams            |
| `playerSeasons` | collection group | season, paid, signed   | who has paid and signed in a season                        |
| `playerSeasons` | collection group | team, captain          | a team's captains                                          |

## Single-field overrides

Collection-group queries on a single field need the field indexed at
collection-group scope, which Firestore does not do by default. The
overrides enable it for `badges.badge`, `badges.seasonId`, `roster.player`,
`teamSeasons.season`, `playerSeasons.season` and `playerSeasons.team`.

## Deploying and pruning

CI deploys the file with `firebase deploy --only firestore` in a job gated on
the rules tests, and never passes `--force`, so it adds indexes but never
deletes one. That is deliberate — deleting an index breaks every query that
uses it — but it means an index removed from the file stays in Firestore.

`scripts/production/prune-firestore-indexes.js` closes that gap. It compares
Firestore with the file and, with `--mode=prune --commit`, deletes whatever is
only in Firestore. Run it with `--mode=plan` (the default, read-only) after
any index change to confirm the file still matches production. The last run
found them identical.

A new index takes a few minutes to build. Queries that need it fail until it
is ready, so deploy an index before, or with, the code that uses it.
