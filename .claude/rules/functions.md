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
  api/webhooks/         Stripe and Dropbox Sign HTTP endpoints
  services/             multi-step domain logic (playerRankings, swissRankings)
  shared/               auth, database, errors, format, offers, storage, stripe,
                        returnUrls, contributions (team payment ledger) helpers
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

`tests/integration/fake-stripe.ts` enforces what Stripe does — no capturing
a cancelled hold, no refunding more than was taken, idempotency keys replay
— and `gateRetrieves` forces concurrent settlements to genuinely race.

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

If you have already created `Functions/node_modules`, delete it.

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
