---
name: add-cloud-function
description: Add a new callable Cloud Function end to end, wiring it from Functions/src through the deploy manifest to the App client. Use when asked to add a backend operation, a new callable, or any feature that writes to Firestore.
---

# Adding a callable Cloud Function

Every Firestore write in this project goes through a callable. `firestore.rules`
denies all client writes, so there is no shortcut through the client SDK.

## 1. Write the function

Place it at `Functions/src/functions/<admin|user>/<domain>/<operation>.ts`, one
operation per file.

```ts
/**
 * <Operation> callable function
 *
 * Security validations:
 * - User must be authenticated and email verified
 * - <the rest, explicitly>
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FIREBASE_CONFIG } from '../../../config/constants.js'
import { validateAuthentication } from '../../../shared/auth.js'

interface DoThingRequest {
	thingId: string
}

export const doThing = onCall<DoThingRequest>(
	{ region: FIREBASE_CONFIG.REGION },
	async (request) => {
		const { auth, data } = request
		validateAuthentication(auth)

		if (!data.thingId) {
			throw new HttpsError('invalid-argument', 'thingId is required')
		}
		// ...
	}
)
```

Required, not optional:

- `{ region: FIREBASE_CONFIG.REGION }` — the App cannot reach a function in
  another region.
- Relative imports carry `.js` extensions (ESM compiled by tsc).
- Explicit return type on the exported function (lint error otherwise in
  Functions).
- Authorization via `shared/auth.ts` helpers. Ownership, captaincy and admin
  are checked in the function, never in rules.
- Multi-document writes inside a transaction or batch.
- Document refs built with `shared/database.ts` helpers.

## 2. Register it

Add the re-export to `Functions/src/index.ts` under the matching banner. **This
is the deploy manifest.** A function missing here does not deploy, and the
failure is silent.

## 3. Wire up the client

Add the wrapper to `App/src/firebase/collections/functions.ts`, named
`<operation>ViaFunction` and returning the response data:

```ts
export const doThingViaFunction = async (
	data: DoThingRequest
): Promise<DoThingResponse> => {
	const doThing = httpsCallable<DoThingRequest, DoThingResponse>(
		functions,
		'doThing'
	)
	const result = await doThing(data)
	return result.data
}
```

A button that calls it uses `LoadingButton` and `usePendingAction` (see
`.claude/rules/app.md`).

Keep the request/response interfaces in step with the Functions side; they are
declared separately in the two packages and nothing enforces agreement.

## 4. Rules, only if needed

A new _collection_ that the client must read needs a read rule and explicit
denials for all four write verbs. A collection-group query needs its own
`match /{path=**}/...` block. Writes stay denied.

## 5. Test it

- Add the name to `ADMIN_CALLABLES` or `USER_CALLABLES` in
  `tests/integration/callables-authorization.test.ts`, and a valid payload
  to `tests/integration/payloads.ts`. The sweep compares its lists with
  `Functions/src/index.ts` and fails until you do; the payload has to be
  valid, or the sweep proves nothing past input validation.
- Add behavioural tests in `tests/integration/` for anything that writes more
  than one document, and mutation-test them (break the rule, watch the test
  fail).
- If it calls Stripe, mock the SDK with `tests/integration/fake-stripe.ts`,
  and add any new kind of Stripe call to the restricted key's permissions.

## 6. Verify

```bash
npm run build --workspace=Functions   # catches missing .js extensions
npm run dev                           # exercise it against the emulators
npm run verify                        # full gate before opening a PR
```

Then have the `firebase-security-reviewer` agent review the diff.
