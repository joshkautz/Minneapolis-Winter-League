# Firestore Collections

The data model. Document shapes are the `*Document` interfaces in
`App/src/types.ts`, mirrored in `Functions/src/types.ts`; collection names are
the `Collections` enum in both.

Nothing here is written by the client. `firestore.rules` denies every client
write, and each collection is written by the callables and triggers named
below. The "Read" column is what `firestore.rules` allows a client.

## Top-level collections

| Collection               | Holds                                                                                    | Read                | Written by                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `players`                | Name, `admin`, `banned`                                                                  | anyone              | `createPlayer`, `updatePlayer`, `updatePlayerAdmin`; deleted with the account                             |
| `playerContacts`         | A player's email, email preferences and bounce flag, kept off the public player document | that player, admins | `createPlayer`, `updatePlayerAdmin`, the email-preference callables and unsubscribe link, `resendWebhook` |
| `teams`                  | A team across seasons; its name lives per season                                         | anyone              | `createTeam`, `rolloverTeam`, the team callables                                                          |
| `seasons`                | Dates, format, pricing (`teamRegistrationTotalCents`)                                    | anyone              | `createSeason`, `updateSeason`, `deleteSeason`                                                            |
| `offers`                 | Invitations and requests between players and teams                                       | anyone              | `createOffer`, `updateOffer`, `onOfferUpdated`                                                            |
| `games`                  | Kickoff, field, teams, scores                                                            | anyone              | `createGame`, `updateGame`, `deleteGame`                                                                  |
| `news`                   | Admin announcements for a season                                                         | anyone              | `createNews`, `updateNews`, `deleteNews`                                                                  |
| `posts`                  | Message board posts, with `replies` beneath                                              | anyone              | the post and reply callables                                                                              |
| `badges`                 | How many teams have earned each badge; badges themselves are defined in code             | anyone              | the badges rebuild                                                                                        |
| `rankings`               | Each player's current all-time TrueSkill rating                                          | anyone              | the rankings rebuild                                                                                      |
| `player-ranking-history` | Each player's rating and ranks after every round                                         | anyone              | the rankings rebuild                                                                                      |
| `rankings-calculations`  | Progress of a rankings rebuild                                                           | anyone              | the rankings rebuild                                                                                      |
| `siteSettings`           | The site theme                                                                           | anyone              | `updateSiteSettings`                                                                                      |
| `stripe/{uid}`           | A player's Checkout sessions and payments                                                | that player         | `createStripeCheckout`, `stripeWebhook`                                                                   |
| `dropbox/{uid}`          | Waivers signed through Dropbox Sign before Sep 2026                                      | that player         | nothing; kept as history                                                                                  |
| `system/maintenance`     | The migration kill-switch triggers honour                                                | admins              | `scripts/production/set-maintenance.js`, by hand                                                          |
| `system/email`           | Whether email is sent: off, test or live                                                 | admins              | `scripts/production/set-email-mode.js`, by hand                                                           |
| `mail`                   | The email outbox: one document per email                                                 | nobody (Functions)  | `queueEmail`, `sendQueuedEmail`                                                                           |

## Per-season subcollections

Per-season state hangs off subcollections rather than the parent document:

| Path                                                    | Holds                                             | Read                |
| ------------------------------------------------------- | ------------------------------------------------- | ------------------- |
| `players/{uid}/playerSeasons/{seasonId}`                | `team`, `captain`, `paid`, `signed`               | anyone              |
| `players/{uid}/waiverSignatures/{id}`                   | The evidence behind `signed`                      | that player, admins |
| `teams/{teamId}/teamSeasons/{seasonId}`                 | Name, logo, `registered`, placement               | anyone              |
| `teams/{teamId}/teamSeasons/{seasonId}/roster/{uid}`    | Membership, and nothing else                      | anyone              |
| `teams/{teamId}/teamSeasons/{seasonId}/contributions/…` | Team payments, keyed by PaymentIntent id          | that roster, admins |
| `teams/{teamId}/teamSeasons/{seasonId}/checkouts/open`  | Contributions reserved while payers are on Stripe | that roster, admins |
| `teams/{teamId}/badges/{badgeId}_{seasonId}`            | A badge the team earned that season, and how      | anyone              |
| `seasons/{seasonId}/rankings/{uid}`                     | A rostered player's rank and record that season   | anyone              |

A ban is account-wide and lives on `players/{uid}.banned`, not on a
player-season.

The player↔team relationship is stored twice — `playerSeasons.team` and the
`roster` entry — because Firestore has no joins and both directions are read.
`Functions/src/shared/membership.ts` writes both in one transaction; nothing
else may write either.

`teamSeasons` and `playerSeasons` are keyed by **season id**, so every result
of a collection-group query over one season has the same `doc.id`. Take the
team or player id from the parent with `canonicalTeamIdFromTeamSeasonDoc` or
`canonicalPlayerIdFromPlayerSeasonDoc`.

## Collection-group queries

A `collectionGroup()` query needs its own `match /{path=**}/...` block in
`firestore.rules`, even where the direct path is already readable. There are
blocks for `teamSeasons`, `playerSeasons` and `badges`. There is deliberately
none for `contributions` or `checkouts`, so no one can list every team's
money at once.

## Reading from the App

Query builders live in `App/src/firebase/collections/<domain>.ts` — for
example `teamsInSeasonQuery`, `playerSeasonRef`, `teamContributionsQuery` —
and are read with `react-firebase-hooks`. Never build a path inline in a
component. Callable wrappers live in `App/src/firebase/collections/functions.ts`.

Indexes are described in [FIRESTORE_INDEXES.md](./FIRESTORE_INDEXES.md);
team payments in [TEAM_PAYMENTS.md](../TEAM_PAYMENTS.md) and waivers in
[WAIVERS.md](../WAIVERS.md).
