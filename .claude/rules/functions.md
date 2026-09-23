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
