# Project Structure

An npm workspaces monorepo: two workspaces, a scripts directory that is not
one, and the Firebase configuration they share. Node 22 is required.

```
App/                    React front end (workspace)
Functions/              Cloud Functions Gen 2, the only writer to Firestore (workspace)
scripts/                seeding, maintenance and CI scripts, run with plain node
tests/rules/            firestore.rules tests
tests/integration/      Functions code against the emulators
docs/                   this documentation
.claude/                rules, skills and agents for Claude Code
.github/                the two deploy workflows and Dependabot
firebase.json           emulator ports, hosting, the Functions runtime and predeploy
firestore.rules         client read access; every client write is denied
firestore.indexes.json  composite indexes
storage.rules           Storage access; clients read, Functions write
eslint.base.js          lint rules both workspaces extend
.prettierrc             formatting: tabs, no semicolons, single quotes, width 80
```

## The two workspaces

**`App/`** — React 19, Vite and Tailwind v4. Pages live in
`src/features/{public,player,admin}/`, shared pieces in `src/shared/`, and
Firestore query builders in `src/firebase/collections/`. See the
[App overview](./app/README.md).

**`Functions/`** — one callable per file under
`src/functions/{user,admin}/<domain>/`, triggers under `src/triggers/`, the
Stripe webhook under `src/api/`, and multi-step logic under `src/services/`.
`src/index.ts` is the deploy manifest: a function not exported there is not
deployed. See the [Functions reference](./functions/README.md).

The two share code in one direction only: the App imports the waiver's text
and signing rules from `Functions/src/waiver/`, which is why
`App/tsconfig.json` sets `rootDir` to the repository root. The `Collections`
enum and document types are deliberately duplicated in `App/src/types.ts`
and `Functions/src/types.ts`, and must be kept in step by hand.

`Functions/` has a second lockfile, `Functions/package-lock.json`, which is
what `firebase deploy` installs from. Change a Functions dependency and update
both lockfiles (see `.claude/rules/functions.md`).

## Tests

| Suite       | Location                      | Run with                   |
| ----------- | ----------------------------- | -------------------------- |
| App         | `App/src/**/*.test.{ts,tsx}`  | `npm test`                 |
| Functions   | `Functions/src/**/*.test.ts`  | `npm test`                 |
| Rules       | `tests/rules/*.test.ts`       | `npm run test:rules`       |
| Integration | `tests/integration/*.test.ts` | `npm run test:integration` |

The rules and integration suites start their own emulators under throwaway
project ids, so they never touch the development emulators' data.
`npm run verify` runs all four, plus format, lint, typecheck and build.

## Scripts

`scripts/seed-emulator.sh` builds a synthetic dataset offline and is the
normal way to get local data. `scripts/production/` reads and writes the live
project and needs gcloud credentials. `scripts/migrations/` holds one-off
data migrations that have already run in production. `scripts/ci/` holds the
deploy guard CI runs before deploying Functions. Conventions are in
`.claude/rules/scripts.md`.

## Environments

There is one Firebase project, `minnesota-winter-league`, and it is
production. `.firebaserc` names `staging` and `development` aliases, but those
projects do not exist. A pull request's Hosting preview serves the new front
end against production data, so anything that writes should be tried against
the emulators.
