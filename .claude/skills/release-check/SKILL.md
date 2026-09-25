---
name: release-check
description: Pre-merge and pre-deploy checklist for this repo — runs the full CI gate and checks the things CI does not cover, like Firestore indexes, the function deploy manifest and rules changes. Use before opening a PR, merging to main, or deploying.
---

# Release check

## 1. The gate CI runs

```bash
npm run verify
```

The same gates CI runs: format, lint, typecheck, unit tests, the rules
tests, the integration tests against the emulators, and the build. Green here
means green there, except for the checks below that no test can make.

## 2. Things CI cannot catch

Walk the diff and check:

- **Deploy manifest.** Every new callable in `Functions/src/functions/**` is
  re-exported from `Functions/src/index.ts`. Unexported means undeployed, with
  no error. (The authorization sweep catches a callable exported but not
  listed there; nothing catches one written but never exported.)
- **Removed functions.** CI refuses to deploy if a function would be deleted.
  Delete it by hand first:
  `npx firebase functions:delete <name> --region us-central1 --project minnesota-winter-league --force`.
- **Stripe permissions.** A new kind of Stripe call needs its permission on
  the restricted key in the Dashboard, or it fails only in production.
- **Firestore indexes.** Any new query with two `where` clauses, or a `where`
  plus `orderBy` on a different field, has an entry in
  `firestore.indexes.json`. The emulator does not enforce indexes, so this
  passes locally and fails in production.
- **Collection-group rules.** A new `collectionGroup()` call in App code needs
  a `match /{path=**}/<name>/...` block in `firestore.rules`.
- **Type parity.** A changed document shape is reflected in _both_
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

The test suites cover the Functions and rules well but mount very little of
the App. For a UI change, run `npm run dev` and use the affected screens
against the emulators. Never against a PR preview: it writes production
data.
