# Firebase Functions

Every write to Firestore goes through here. `firestore.rules` denies all
client writes, so these functions are the application's entire write path —
see [the architecture section of CLAUDE.md](../../CLAUDE.md) for why.

All functions are Gen 2 except `userDeleted`, which uses the v1 Auth trigger
because Gen 2 has no equivalent for account deletion.

Conventions for writing new functions — validators, error codes, batch limits,
the two lockfiles — live in
[`.claude/rules/functions.md`](../../.claude/rules/functions.md). This page is
a map of what exists.

## Layout

```
Functions/src/
  index.ts                  deploy manifest — a function not exported here is not deployed
  functions/user/<domain>/  callables any signed-in player may invoke
  functions/admin/<domain>/ callables that require an admin
  triggers/auth/            Auth lifecycle triggers
  triggers/documents/       Firestore document triggers
  triggers/payments/        the per-player payment trigger
  api/webhooks/             the Stripe HTTP endpoint
  waiver/                   the waiver's text and signing rules, also imported by the App
  services/                 multi-step domain logic
  shared/                   helpers used across functions
  config/                   constants.ts (static) and environment.ts (secrets)
  types.ts                  Collections enum and document shapes, mirrored in App/src/types.ts
```

## Callables

44 in total, every one covered by the authorization sweep in
`tests/integration/callables-authorization.test.ts`.

| Domain        | User                                                                                       | Admin                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Players       | `createPlayer`, `updatePlayer`, `deletePlayer`                                             | `updatePlayerAdmin`, `getPlayerAuthInfo`                                              |
| Teams         | `createTeam`, `rolloverTeam`, `updateTeam`, `deleteTeam`, `updateTeamRoster`               | `deleteUnregisteredTeam`, `updateTeamAdmin`, `mergeTeams`                             |
| Offers        | `createOffer`, `updateOffer`                                                               |                                                                                       |
| Payments      | `createStripeCheckout`, `createTeamContributionCheckout`, `cancelTeamContributionCheckout` | `refundTeamContribution`                                                              |
| Waivers       | `signWaiver`                                                                               |                                                                                       |
| Posts         | `createPost`, `updatePost`, `createReply`, `updateReply`                                   | `deletePost`, `deleteReply`                                                           |
| Seasons       |                                                                                            | `createSeason`, `updateSeason`, `deleteSeason`, `setSwissSeeding`, `getSwissRankings` |
| Games         |                                                                                            | `createGame`, `updateGame`, `deleteGame`                                              |
| Rankings      |                                                                                            | `rebuildPlayerRankings`                                                               |
| News          |                                                                                            | `createNews`, `updateNews`, `deleteNews`                                              |
| Badges        |                                                                                            | `createBadge`, `updateBadge`, `deleteBadge`, `awardBadge`, `revokeBadge`              |
| Site settings |                                                                                            | `updateSiteSettings`                                                                  |

`createPlayer` and `updatePlayer` accept an unverified email, because they run
during account setup. Everything else requires a verified one.

## Triggers

| Function                                     | Fires on                                               | Does                                                                                    |
| -------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `userDeleted`                                | Auth account deleted                                   | Deletes the player's data, keeping waivers; see [Account deletion](#account-deletion)   |
| `onOfferUpdated`                             | `offers/{offerId}` updated                             | On acceptance, adds the player to the roster and points their season record at the team |
| `updateTeamRegistrationOnRosterChange`       | the same roster path, written                          | Recomputes registration; refunds a leaver's money on an unregistered team               |
| `updateTeamRegistrationOnPlayerChange`       | `players/{p}/playerSeasons/{s}` updated                | Recomputes registration when `paid` or `signed` changes                                 |
| `updateTeamRegistrationOnContributionChange` | `teams/{t}/teamSeasons/{s}/contributions/{pi}` written | Recomputes registration when a team's money changes, and settles a new payment          |
| `onTeamRegistrationChange`                   | `teams/{t}/teamSeasons/{s}` updated                    | Refunds the new team's excess; at twelve, refunds and removes the unregistered ones     |
| `onPaymentCreated`                           | `stripe/{uid}/payments/{id}` created                   | Marks a per-player registration paid                                                    |

Every trigger honours the migration kill-switch,
`system/maintenance.migrationInProgress`, and returns without writing while it
is set. Which ones the platform retries on failure is pinned by
`tests/integration/trigger-retries.test.ts`.

## Account deletion

A player deletes their own account from their profile, which calls
`deletePlayer`. It refuses unless the player signed in within the last five
minutes (the App asks for the password again), and while they are on a team
this season, banned, or the only admin. Then it deletes their data and their
sign-in. An admin deleting a user from the Firebase console gets the same
cleanup through `userDeleted`; the callable's deletion fires that trigger
too, which finds nothing left.

Both run `services/accountDeletionService`. It deletes the player document,
their player-seasons, their roster entries in every season, their open
offers, their leaderboard entry and the site's copy of their Stripe records.
It keeps their waiver signatures ([WAIVERS.md](../WAIVERS.md)), their team
contributions, which are the team's ledger, and their posts, which then show
as from a former player.

## Registration windows

Roster changes close when registration does. Each of these refuses a request
after the season's `registrationEnd` with `failed-precondition`, and none is
blocked before registration opens. Admins are exempt, except from
`deleteTeam`'s check; they delete with `deleteUnregisteredTeam` instead.

| Callable                     | File                                   |
| ---------------------------- | -------------------------------------- |
| `createTeam`                 | `functions/user/teams/create.ts`       |
| `rolloverTeam`               | `functions/user/teams/rollover.ts`     |
| `deleteTeam`                 | `functions/user/teams/delete.ts`       |
| `updateTeamRoster`           | `functions/user/teams/updateRoster.ts` |
| `createOffer`, `updateOffer` | `functions/user/offers/`               |

Paying is different: only admins may pay before registration opens (see
[TEAM_PAYMENTS.md](../TEAM_PAYMENTS.md)).

## Scheduled functions

| Function                     | Runs                  | Does                                                                   |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `sweepTeamPaymentsHourly`    | every hour            | Refunds every unregistered team holding money once registration closes |
| `reconcileTeamPaymentsDaily` | 04:00 America/Chicago | Repairs any disagreement between Stripe and the contribution ledger    |

Both honour the kill-switch too. A failed run is not retried by the
scheduler; the next run is the retry.

## Webhooks

Both are public HTTP endpoints. The signature check is the only thing between
them and a forged request, and it runs before any read or write.

- **`stripeWebhook`** — `checkout.session.completed`. A per-player checkout
  writes `stripe/{uid}/payments/{sessionId}`, which fires `onPaymentCreated`.
  A team contribution is recorded in the team's contribution ledger instead;
  see [TEAM_PAYMENTS.md](../TEAM_PAYMENTS.md). `charge.refunded` keeps that
  ledger in step with refunds made outside the code. Also mirrors Products
  and Prices into Firestore.

## Services and shared helpers

| Module                                | Holds                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `services/accountDeletionService`     | What deleting an account removes, and what it keeps; shared by `deletePlayer` and `userDeleted` |
| `services/teamRegistrationService`    | The registration rule and the transactional twelve-team cap                                     |
| `services/teamDeletionService`        | Deleting a team-season, refusing while it holds money                                           |
| `services/teamSettlementService`      | Refunding and reconciling a team's money with Stripe                                            |
| `services/teamContributionIntake`     | Taking a PaymentIntent into the ledger, or refunding it if it cannot be attributed              |
| `services/teamCheckoutReservations`   | Reserving a contribution while its payer is on Stripe's page, and ending the reservation        |
| `services/teamPaymentsSweep`          | Finding and settling every unregistered team holding money                                      |
| `services/teamPaymentsReconciliation` | Checking Stripe and the ledger against each other                                               |
| `services/playerRankings`             | The TrueSkill rankings rebuild — see [PLAYER_RANKING_ALGORITHM.md](PLAYER_RANKING_ALGORITHM.md) |
| `services/swissRankings`              | Swiss-format standings                                                                          |
| `shared/auth`                         | `validateAuthentication`, `validateAdminUser`, `validateNotBanned` and friends                  |
| `shared/membership`                   | Writing both sides of the player↔team relationship atomically                                   |
| `shared/contributions`                | The team contribution ledger and its arithmetic                                                 |
| `shared/settlement`                   | Pure decisions about a team's money: what to keep and what to refund                            |
| `shared/stripe`                       | Stripe client, customer lookup, the team registration Product                                   |
| `shared/returnUrls`                   | The allowlist for Checkout return URLs                                                          |
| `shared/seasonPricing`                | Validating a season's team registration total, which cannot change once money depends on it     |
| `shared/names`                        | Player name validation, mirroring the App's schema                                              |
| `shared/database`                     | Document reference builders and the current-season lookup                                       |
| `shared/gameSchedule`                 | The Saturday time slots and fields a game may be scheduled in                                   |

## Configuration

Secrets are Firebase secrets in production and `Functions/.secret.local` under
the emulator:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

Firebase injects only the secrets a function lists in its `secrets` option.
`config/environment.ts` therefore reads each secret when code first uses it
(`getStripeConfig().SECRET_KEY`), warns
once per instance if that secret is missing, and returns a placeholder so the
function still loads. A warning names a secret some code actually tried to
use — declare it on that function.

**The emulator runs against production.** `.firebaserc` has one real project,
and a secret missing from `Functions/.secret.local` is fetched from
production Secret Manager with your own credentials. So under the emulator
(`FUNCTIONS_EMULATOR=true`) a live Stripe key (`sk_live_`, `rk_live_`) is
refused and the placeholder returned; put a test-mode key in `.secret.local`
to exercise payments locally.

Static settings — region, CORS origins, team registration thresholds, the
Stripe API version — are in `config/constants.ts`.

## Running and deploying

```bash
npm run dev                                        # emulators + Functions watch + Vite
npm run test:integration                           # Functions against the emulator
firebase deploy --only functions:<functionName>    # one function
```

Run commands from the repository root. Deploys install from
`Functions/package-lock.json`, not the workspace lockfile — see the
Two lockfiles section of the rules file before changing a dependency.
