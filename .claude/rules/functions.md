---
paths:
  - Functions/**
description: Conventions for Firebase Cloud Functions (Gen 2)
---

# Firebase Functions

## Where things go

```
Functions/src/
  index.ts              # deploy manifest — every function must be re-exported here
  functions/admin/<domain>/   callables that require admin
  functions/user/<domain>/    callables available to signed-in players
  triggers/{auth,documents,payments}/   Firestore and lifecycle triggers
  triggers/scheduled/   onSchedule functions (the team payments sweep and reconciliation)
  api/webhooks/         the Stripe HTTP endpoint
  services/             multi-step domain logic: team registration, team payments
                        (checkout reservations, intake, settlement, sweep,
                        reconciliation), team and account deletion, rankings
  waiver/               the waiver's text and signing rules, also imported by the App
  shared/               small helpers: auth, database refs, membership, names,
                        contributions and settlement arithmetic, gameSchedule,
                        returnUrls, stripe, storage, maintenance kill-switch
  config/               constants.ts (static) and environment.ts (secrets)
  types.ts              Collections enum and document interfaces
```

One callable per file, named after the operation (`create.ts`, `updateStatus.ts`).

## Writing a callable

```ts
export const doThing = onCall<DoThingRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request
		validateAuthentication(auth) // assertion signature; narrows auth
		// ...
	}
)
```

- Always pass `{ region: FIREBASE_CONFIG.REGION }`. Omitting it deploys to the
  wrong region and the App cannot reach it.
- Open with a docblock listing the security validations the function performs.
  Every existing callable does this and it is the fastest way to review one.
- Use the `shared/auth.ts` validators rather than hand-rolling checks:
  `validateAuthentication` (auth + verified email), `validateBasicAuthentication`
  (auth only, for pre-verification flows), `validateAdminUser`, `validateNotBanned`.
- Throw `HttpsError` with an accurate code (`invalid-argument`, `not-found`,
  `permission-denied`, `failed-precondition`). Never return an error shape.
- Its message is shown to the player as written, so write it for them: say
  what is wrong and what to do. In a catch-all, log the real error and throw
  `internal` with a fixed sentence ("Your team could not be saved. Please try
  again."); never put `error.message` in it — that sends Firestore and stack
  text to the browser.
- Take images with `parseImageUpload` and `storeImage` (`shared/images.ts`):
  one set of rules for every upload, and a clear message when one is
  refused. Parse before any work, and store before writing Firestore, so a
  failed upload changes nothing. Never accept a file URL or Storage path
  from the client.
- Multi-document writes go in a Firestore transaction or batch. Roster and
  registration state spans several documents and must not tear.
- Build document references with the helpers in `shared/database.ts`
  (`playerSeasonRef`, `teamSeasonRef`, `teamRosterEntryRef`) rather than
  assembling paths by hand.

## Triggers and retries

A Gen 2 event trigger that throws is **not retried** unless its options set
`retry: true`. Rethrowing "so the trigger retries" does nothing without the
flag — several triggers here did exactly that until
`tests/integration/trigger-retries.test.ts` caught it.

With the flag, the platform retries with backoff (10 to 600 seconds) for up
to 24 hours. So:

- **Set `retry: true` on any trigger whose lost run would lose something** —
  a registration recompute, a waiver request, a payment.
- **Make the handler idempotent first.** A retry can follow a partial
  success. Recomputes that run in a transaction are; so is anything keyed on
  a stable id.
- **Return, don't throw, on failures a retry cannot fix** — a missing
  document, an invalid offer. Throwing those just repeats the failure for a
  day.
- **Classify every new trigger** in `trigger-retries.test.ts`, which fails
  until you do.

CI therefore deploys Functions with `--force`: the CLI will not deploy a
newly retried trigger non-interactively without it. `--force` also approves
deleting a function missing from the source and changing a trigger's type,
so `scripts/ci/check-functions-deploy.js` runs first and fails the deploy if
it would do either. To delete or re-trigger a function on purpose, run
`firebase functions:delete <name>` by hand, then let CI deploy.

## Secrets

A function reads only the secrets in its `secrets` option. Removing one from
the option does **not** remove it from the deployed function: the CLI adds
secret mounts but never takes them away, even on a by-name deploy. A mounted
secret that is later deleted from Secret Manager breaks that function's next
cold start. `onPaymentCreated` still had `DROPBOX_SIGN_API_KEY` mounted, long
after it stopped using it, when the secret was due to be deleted.

So before deleting a secret, list which deployed functions mount it
(`serviceConfig.secretEnvironmentVariables` in the Cloud Functions API), and
clear a stale mount by patching that field alone.

A deployed function is pinned to the secret **version** that was latest
when it deployed. After `firebase functions:secrets:set`, let the CLI
redeploy the functions it lists, or they keep the old value. When it then
destroys the old version, its warning that the version is "in use" counts
retired revisions too; what matters is the revision serving traffic
(`trafficStatuses` on the Cloud Run service).

### The Stripe key is restricted

`STRIPE_SECRET_KEY` is a **restricted** key, created in the Dashboard, with:

- **Write:** Checkout Sessions, Customers, Products, Refunds
- **Read:** PaymentIntents (retrieve and search), Charges (for
  `expand: ['latest_charge']`), Prices
- **None:** everything else, including webhook endpoints

A call outside that list fails in production with `StripePermissionError`
("more_permissions_required"), and nothing here catches it first: the
emulator refuses live keys and the tests fake Stripe. So adding a new kind of
Stripe call means adding its permission to the key in the Dashboard in the
same change. Account housekeeping — webhook endpoints, keys — is done in the
Dashboard, not with this key.

### Changing the Stripe API version

A webhook endpoint is pinned to the API version it was created with, and
renders every event in that version whatever the SDK expects. When
`API_VERSION` in `config/constants.ts` moves, create a new endpoint on the
new version with the same URL and events, set `STRIPE_WEBHOOK_SECRET` to its
signing secret (the CLI redeploys `stripeWebhook`), then delete the old
endpoint. Until it is deleted each event goes to both, and the old one's
deliveries fail verification harmlessly; the handler is idempotent.

## Scheduled functions

`onSchedule` functions live in `triggers/scheduled/`. The two there follow
the same shape:

- `region`, a `timeZone` of `America/Chicago`, and `maxInstances: 1`.
- Honour the migration kill-switch like every trigger.
- Do the work in a service that takes `now` as an option, so tests can move
  the clock; test the scheduled wrapper with `.run({ scheduleTime })`.
- A failed run is not retried by the scheduler; the next run is the retry.
  Throw anyway, so the failure shows in the logs.

**Deploying one needs Cloud Scheduler Admin** (`roles/cloudscheduler.admin`)
on the account CI deploys as,
`github-action-666139608@minnesota-winter-league.iam.gserviceaccount.com`.
Without it the function deploys but its job does not, and the deploy fails
with a 403 on `cloudscheduler.jobs.update`. The first scheduled functions hit
exactly that; the role has since been granted.

**Rerunning a failed deploy does not repair a missing job.** The function
itself was created, so the rerun skips it as unchanged and never retries the
job — the deploy reports success and the schedule still does not exist.
Deploy the function by name, which is never skipped:
`firebase deploy --only functions:<name> --force`, then confirm the job with
Cloud Scheduler.

## Stripe in tests

Any integration suite that can reach settlement — which now includes the
contribution and registration triggers — must mock Stripe, or it calls the
real API. Use the stateful fake rather than bare `vi.fn()`s:

```ts
vi.mock('stripe', async () => ({
	default: (await import('./fake-stripe.js')).FakeStripe,
}))
```

`tests/integration/fake-stripe.ts` enforces what Stripe does — no refunding
more than is left, idempotency keys replay, a Checkout session pays only
when completed (`completeCheckout`) — and `gateRetrieves` forces concurrent
settlements to genuinely race.

## Rosters

A team's roster for a season is the subcollection
`teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}`. Before the 2026
migration it was an array field on the team document, and `TeamDocument`
extends `DocumentData`, so `teamData.roster` still **type-checks** and simply
evaluates to `undefined` at runtime. Code written against the old shape fails
silently rather than loudly — the rankings pipeline read it for months and
produced an empty leaderboard without erroring.

Read rosters through `loadRosterPlayerRefs` or a `.collection('roster')` query
off `teamSeasonRef`, and never write either side of the player↔team
relationship directly — `shared/membership.ts` writes both atomically.

## Registering

Re-export from `Functions/src/index.ts` under the matching comment banner. A
function that is not exported there is not deployed — this is the single most
common mistake in this codebase.

## Two lockfiles

`Functions/package-lock.json` exists **in addition to** the root workspace
lockfile, and it is the one that governs deployment: the `predeploy` hook in
`firebase.json` runs `npm install --prefix Functions`, which resolves against
it and ignores the workspace tree.

They drift silently. Everything local and in CI builds against the root
workspace install, so a stale `Functions/package-lock.json` passes every check
and then fails during `firebase deploy` — or worse, deploys different
dependency versions than anything that was tested.

When you change a dependency in `Functions/package.json`, update both:

```bash
npm install                                        # root workspace lockfile
npm install --prefix Functions --package-lock-only  # Functions/package-lock.json
```

`--package-lock-only` matters. Without it the command also installs a full
`Functions/node_modules`, which then **shadows the hoisted workspace tree**:
the deploy manifest resolves a package from `Functions/node_modules` while a
test's `vi.mock('<package>')` resolves the root copy, so the mock silently
stops intercepting and emulator tests fail with real network calls. The flag
writes the lockfile and nothing else, which is all that is wanted here — the
root install is what local builds and tests run against.

If you have already created `Functions/node_modules`, delete it. **A local
`firebase deploy` creates it too**: the `predeploy` hook is a full install.
After deploying from a checkout, delete it before running tests, or the
emulator suites fail with Firestore unable to serialize a
`ServerTimestampTransform` — two copies of the SDK, one writing the other's
sentinels.

CI runs the real predeploy path (`Build Functions the way firebase deploy
does`) to catch divergence before a deploy does. It is a separate job with its
own `npm ci`, so it never sees the shadowing tree.

## Batch limits

A Firestore `WriteBatch` caps at **500 operations**, counting sets, updates
and deletes together. The emulator does not enforce this — a 600-operation
batch commits there and fails in production — so any code path whose batch
size grows with the data must chunk, and must be covered by a unit test that
counts commits rather than by an emulator test. See
`services/playerRankings/persistence/rankingsSaver.ts`.

## Validation is not the App's job

`firestore.rules` denies all client writes, so every callable is the only
thing standing between a request and the database — and a callable can be
invoked by any authenticated user without going near the form. A Zod schema in
`App/` is a convenience for the reader, never a control.

Anything that sends a payer to Stripe takes its return URLs from the client,
and Stripe redirects to whatever it is given. Check them with
`isAllowedReturnUrl` from `shared/returnUrls.ts`; an unchecked one is an open
redirect off a genuine payment page.

Player names are validated by `shared/names.ts`, which mirrors the App's
`nameSchema`. When you add a field with rules in the App, add them here too.

## Lint strictness

Stricter than App: `@typescript-eslint/no-explicit-any` and
`explicit-function-return-type` are **errors**. Annotate return types on
exported functions.

## Imports

ESM with explicit `.js` extensions on relative imports (`'../../shared/auth.js'`)
— required because the package is `"type": "module"` compiled by tsc.

## Types

`Functions/src/types.ts` and `App/src/types.ts` both define `Collections` and
the document interfaces. They are intentionally separate (different Firebase
SDKs) but must stay semantically in sync. Changing a document shape means
changing both.
