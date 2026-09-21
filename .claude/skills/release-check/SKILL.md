---
name: release-check
description: Pre-merge and pre-deploy checklist for this repo — runs the full CI gate and checks the things CI does not cover, like Firestore indexes, the function deploy manifest and rules changes. Use before opening a PR, merging to main, or deploying.
---

# Release check

## 1. The gate CI runs

```bash
npm run verify
```

Equivalent to what both workflows enforce (`format:check`, `lint:check`,
`build`) plus `typecheck` and `test`, which **CI does not currently run**. A
green `verify` is necessary but, until the workflows are updated, not
sufficient evidence that CI will pass — it is stricter, so green here means
green there.

## 2. Things CI cannot catch

Walk the diff and check:

- **Deploy manifest.** Every new callable in `Functions/src/functions/**` is
  re-exported from `Functions/src/index.ts`. Unexported means undeployed, with
  no error.
- **Firestore indexes.** Any new query with two `where` clauses, or a `where`
  plus `orderBy` on a different field, has an entry in
  `firestore.indexes.json`. The emulator does not enforce indexes, so this
  passes locally and fails in production.
- **Collection-group rules.** A new `collectionGroup()` call in App code needs
  a `match /{path=**}/<name>/...` block in `firestore.rules`.
- **Type parity.** A changed document shape is reflected in *both*
  `Functions/src/types.ts` and `App/src/types.ts`.
- **Secrets.** Nothing added under `Functions/src/config/` hardcodes a key.
  `git diff` for anything resembling a token.
- **No production data.** `.emulator/` and `scripts/production/data/` are not
  staged. `git status --short` should not list them.

## 3. Rules and index changes

Hosting, Functions, and Firestore rules and indexes all deploy from CI on
merge to main. The Firestore job is gated on the rules test suite, so a change
that opens a write cannot reach production.

Still check the index question yourself: the emulator does not enforce
indexes, so a missing one passes every local check and fails only on the first
production query.

## 4. Exercise it

Run `npm run dev` and use the affected screens against the emulators. There is
almost no automated test coverage, so manual verification is the real gate.
