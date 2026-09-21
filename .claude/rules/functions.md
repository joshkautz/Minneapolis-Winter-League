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
  shared/               auth, database, errors, format, offers, storage helpers
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
  (auth only, for pre-verification flows), `validateAdmin`, `validateNotBanned`.
- Throw `HttpsError` with an accurate code (`invalid-argument`, `not-found`,
  `permission-denied`, `failed-precondition`). Never return an error shape.
- Multi-document writes go in a Firestore transaction or batch. Roster and
  registration state spans several documents and must not tear.
- Build document references with the helpers in `shared/database.ts`
  (`playerSeasonRef`, `teamSeasonRef`, `teamRosterEntryRef`) rather than
  assembling paths by hand.

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
npm install                      # root workspace lockfile
npm install --prefix Functions   # Functions/package-lock.json
```

CI runs the real predeploy path (`Build Functions the way firebase deploy
does`) to catch divergence before a deploy does.

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
