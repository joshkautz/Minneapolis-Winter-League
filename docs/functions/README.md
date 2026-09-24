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

46 in total, every one covered by the authorization sweep in
`tests/integration/callables-authorization.test.ts`.

| Domain        | User                                                                         | Admin                                                                                 |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Players       | `createPlayer`, `updatePlayer`, `deletePlayer`                               | `updatePlayerAdmin`, `getPlayerAuthInfo`                                              |
| Teams         | `createTeam`, `rolloverTeam`, `updateTeam`, `deleteTeam`, `updateTeamRoster` | `deleteUnregisteredTeam`, `updateTeamAdmin`, `mergeTeams`                             |
| Offers        | `createOffer`, `updateOffer`                                                 |                                                                                       |
| Payments      | `createStripeCheckout`, `createTeamContributionCheckout`                     | `releaseTeamContribution`                                                             |
| Waivers       | `signWaiver`                                                                 |                                                                                       |
| Storage       | `getUploadUrl`, `getDownloadUrl`, `getFileMetadata`                          |                                                                                       |
| Posts         | `createPost`, `updatePost`, `createReply`, `updateReply`                     | `deletePost`, `deleteReply`                                                           |
| Seasons       |                                                                              | `createSeason`, `updateSeason`, `deleteSeason`, `setSwissSeeding`, `getSwissRankings` |
| Games         |                                                                              | `createGame`, `updateGame`, `deleteGame`                                              |
| Rankings      |                                                                              | `rebuildPlayerRankings`                                                               |
| News          |                                                                              | `createNews`, `updateNews`, `deleteNews`                                              |
| Badges        |                                                                              | `createBadge`, `updateBadge`, `deleteBadge`, `awardBadge`, `revokeBadge`              |
| Site settings |                                                                              | `updateSiteSettings`                                                                  |

`createPlayer` and `updatePlayer` accept an unverified email, because they run
during account setup. Everything else requires a verified one.

## Triggers

| Function                                     | Fires on                                               | Does                                                                                    |
| -------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `userDeleted`                                | Auth account deleted                                   | Removes the player from every roster and deletes their data                             |
| `onOfferUpdated`                             | `offers/{offerId}` updated                             | On acceptance, adds the player to the roster and points their season record at the team |
| `updateTeamRegistrationOnRosterChange`       | the same roster path, written                          | Recomputes the team's registration                                                      |
| `updateTeamRegistrationOnPlayerChange`       | `players/{p}/playerSeasons/{s}` updated                | Recomputes registration when `paid` or `signed` changes                                 |
| `updateTeamRegistrationOnContributionChange` | `teams/{t}/teamSeasons/{s}/contributions/{pi}` written | Recomputes registration when a team's money changes, and settles a new hold             |
| `onTeamRegistrationChange`                   | `teams/{t}/teamSeasons/{s}` updated                    | Captures the new team's money; at twelve, releases and removes the unregistered ones    |
| `onPaymentCreated`                           | `stripe/{uid}/payments/{id}` created                   | Marks a per-player registration paid                                                    |

Every trigger honours the migration kill-switch,
`system/maintenance.migrationInProgress`, and returns without writing while it
is set. Which ones the platform retries on failure is pinned by
`tests/integration/trigger-retries.test.ts`.

## Scheduled functions

| Function                     | Runs                  | Does                                                                                                |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `sweepTeamPaymentsHourly`    | every hour            | Settles every team holding money: releases after registration closes, captures holds nearing expiry |
| `reconcileTeamPaymentsDaily` | 04:00 America/Chicago | Repairs any disagreement between Stripe and the contribution ledger                                 |

Both honour the kill-switch too. A failed run is not retried by the
scheduler; the next run is the retry.

## Webhooks

Both are public HTTP endpoints. The signature check is the only thing between
them and a forged request, and it runs before any read or write.

- **`stripeWebhook`** — `checkout.session.completed`. A per-player checkout
  writes `stripe/{uid}/payments/{sessionId}`, which fires `onPaymentCreated`.
  A team contribution is recorded in the team's contribution ledger instead;
  see [TEAM_PAYMENTS.md](../TEAM_PAYMENTS.md). `payment_intent.canceled`,
  `payment_intent.succeeded` and `charge.refunded` keep that ledger in step
  with changes made outside the code. Also mirrors Products and Prices into
  Firestore.

## Services and shared helpers

| Module                                | Holds                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `services/teamRegistrationService`    | The registration rule and the transactional twelve-team cap                                     |
| `services/teamDeletionService`        | Deleting a team-season, refusing while it holds unsettled money                                 |
| `services/teamSettlementService`      | Capturing, releasing and reconciling a team's money with Stripe                                 |
| `services/teamContributionIntake`     | Taking a PaymentIntent into the ledger, or releasing it if it cannot be attributed              |
| `services/teamPaymentsSweep`          | Finding and settling every team holding money                                                   |
| `services/teamPaymentsReconciliation` | Checking Stripe and the ledger against each other                                               |
| `services/playerRankings`             | The TrueSkill rankings rebuild — see [PLAYER_RANKING_ALGORITHM.md](PLAYER_RANKING_ALGORITHM.md) |
| `services/swissRankings`              | Swiss-format standings                                                                          |
| `shared/auth`                         | `validateAuthentication`, `validateAdminUser`, `validateNotBanned` and friends                  |
| `shared/membership`                   | Writing both sides of the player↔team relationship atomically                                   |
| `shared/contributions`                | The team contribution ledger and its arithmetic                                                 |
| `shared/settlement`                   | Pure decisions about a team's money: what to capture, cancel or refund                          |
| `shared/stripe`                       | Stripe client, customer lookup, the team registration Product                                   |
| `shared/returnUrls`                   | The allowlist for Checkout return URLs                                                          |
| `shared/waivers`                      | Sending a waiver, idempotent per player and season                                              |
| `shared/names`                        | Player name validation, mirroring the App's schema                                              |
| `shared/database`                     | Document reference builders and the current-season lookup                                       |

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
