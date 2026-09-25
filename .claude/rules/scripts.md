---
paths:
  - scripts/**
description: Conventions for the maintenance and seeding scripts
---

# scripts/

Plain Node ESM, run directly (`node scripts/<name>.js`). **Not an npm
workspace** — dependencies resolve from the hoisted root `node_modules`, so
`firebase-admin` is available without a separate install.

## The two data paths

| Script                     | Source     | Needs prod access | Use for                        |
| -------------------------- | ---------- | ----------------- | ------------------------------ |
| `seed-emulator.sh`         | generated  | no                | everyday local development     |
| `refresh-emulator-data.sh` | production | yes (gcloud ADC)  | reproducing a production issue |

Prefer the synthetic path. `data:refresh` writes real user data to
`.emulator/` and `scripts/production/data/`, both gitignored.

Seeding order matters: `generate-accounts.js` must run before `seed.js`,
because `seed.js` builds player documents from the users already in Auth.
Seeding an empty Auth emulator yields zero players and then fails building
teams.

## Emulator-targeted scripts

Set the emulator host env vars at the top, before initializing the Admin SDK,
and default rather than overwrite so callers can redirect:

```js
process.env.FIRESTORE_EMULATOR_HOST =
	process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080'
```

Use `projectId: 'minnesota-winter-league'` — it must match the emulator's
project or the data lands in a different namespace.

## Anything touching production

Scripts under `scripts/production/` read and write live data. They must be
idempotent, log what they are about to change, and be runnable against the
emulators first. Never hardcode absolute filesystem paths — resolve relative to
the repository root:

```js
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..'
)
```

## CI scripts

`scripts/ci/` holds checks the deploy workflows run. They import the built
`Functions/dist`, so they run after the Functions build. Keep the decision
logic in exported pure functions and the I/O in `main()`, guarded so importing
the file does not run it — the tests in `tests/integration/` import them.
