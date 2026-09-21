# Development Setup

Everything here has been verified against the repository as it stands. If a
command in this document does not work, the document is wrong — please fix it.

## Prerequisites

| Tool    | Version | Notes                                           |
| ------- | ------- | ----------------------------------------------- |
| Node.js | 22.x    | Pinned in `.nvmrc`; `nvm use` picks it up       |
| npm     | 10+     | Ships with Node 22                              |
| JDK     | 17+     | Required by the Firestore and Storage emulators |
| Git     | any     |                                                 |

The Firebase CLI does **not** need to be installed globally —
`firebase-tools` is a dev dependency and the npm scripts use the local copy.
A global install is only handy for ad-hoc `firebase` commands.

Recommended VS Code extensions are listed in `.vscode/extensions.json`.

## Install

```bash
git clone https://github.com/joshkautz/Minneapolis-Winter-League.git
cd Minneapolis-Winter-League
nvm use
npm ci
```

`npm ci` installs the root and both workspaces (`App`, `Functions`) in one
step. Do not run `npm install` inside `App/` or `Functions/` separately.

## First run

`.emulator/` holds the local emulator snapshot and is gitignored, so a fresh
clone has no data. Generate some:

```bash
npm run seed
```

This boots a throwaway emulator set, creates 480 Auth users, 4 seasons, 36
teams, 480 players and 216 games, then exports the result to `.emulator/`. It
is entirely local — no Firebase login, no production access.

Then start developing:

```bash
npm run dev
```

That runs three processes under `concurrently`:

| Label       | Process                                                 |
| ----------- | ------------------------------------------------------- |
| `functions` | `tsc --watch` over `Functions/src`                      |
| `emulators` | Firebase Emulator Suite, importing `.emulator/`         |
| `app`       | Vite in development mode with `VITE_USE_EMULATORS=true` |

| Service     | URL                     |
| ----------- | ----------------------- |
| React app   | <http://localhost:5173> |
| Emulator UI | <http://localhost:4000> |
| Firestore   | <http://localhost:8080> |
| Auth        | <http://localhost:9099> |
| Functions   | <http://localhost:5001> |
| Storage     | <http://localhost:9199> |
| Hosting     | <http://localhost:5005> |

Emulator state is exported back to `.emulator/` when you shut down cleanly
with Ctrl-C, so it survives restarts.

## Signing in locally

The seeded Auth users all have verified emails and no password. Use the Auth
tab of the Emulator UI at <http://localhost:4000/auth> to sign in as any of
them, or create a new user there.

To make a user an admin, set `admin: true` on their document in the `players`
collection via the Firestore tab. This codebase reads admin status from that
field, not from Auth custom claims.

## Daily commands

All from the repository root.

```bash
npm run dev             # the full local stack
npm run seed:attach     # reseed emulators that are already running
npm run emulators:clean # throw away local data and start empty

npm run verify          # format + lint + typecheck + test + build
npm test                # Vitest, single run
npm run test:watch      # Vitest in watch mode
npm run typecheck       # tsc --noEmit, both workspaces
npm run lint:fix        # eslint --fix, both workspaces
npm run format:fix      # prettier --write, both workspaces
npm run build           # production build, both workspaces
```

Run `npm run verify` before opening a pull request. CI gates on formatting and
linting, so an unformatted file fails the build.

## What reloads automatically

| You change                                  | What happens                         |
| ------------------------------------------- | ------------------------------------ |
| `App/src/**`                                | Vite HMR, immediate                  |
| `Functions/src/**`                          | tsc recompiles, the emulator reloads |
| `firestore.rules`, `firestore.indexes.json` | Nothing — restart the emulators      |
| `firebase.json`                             | Nothing — restart the emulators      |

The Functions emulator serves compiled output from `Functions/dist`, not
`src`. The reload chain is: you save a `.ts` file, the `functions` watch
recompiles it, the emulator notices the changed JavaScript and reloads the
function — one to three seconds end to end. If that watch process has died or
is failing to compile, your edits will appear to have no effect. Check that
pane first.

Changes to environment variables or to installed dependencies also require a
restart.

## Working with production-shaped data

Only when reproducing a real issue. This pulls live user data onto your
machine:

```bash
gcloud auth application-default login
npm run data:refresh
```

It exports production to `scripts/production/data/`, loads it into the
emulators and snapshots to `.emulator/`. Both directories are gitignored and
must never be committed.

## Environment variables

`App/.env.development`, `.env.staging` and `.env.production` hold the Vite
Firebase config per mode; `App/.env.test` holds fake values for Vitest. See
[Environment Variables](./ENVIRONMENT_VARIABLES.md).

Functions secrets (Stripe, Dropbox Sign) are managed with
`firebase functions:secrets:set` and read through
`Functions/src/config/environment.ts`. They are never committed.

## Troubleshooting

**A port is already in use.** An emulator from a previous run did not shut
down. Find it:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Or clear them all at once:

```bash
npx kill-port 5173 4000 8080 5001 9099 9199
```

**The app shows no data.** There is no seed data. Run `npm run seed`, or
`npm run seed:attach` if the emulators are already up.

**Seeding fails with `Cannot read properties of undefined (reading 'id')`.**
`seed.js` builds players from existing Auth users, so `generate-accounts.js`
must run first. `npm run seed` does both in order; running `node
scripts/seed.js` on its own against an empty Auth emulator produces this.

**A Firestore query fails with permission-denied.** If it is a
`collectionGroup()` query, it needs its own `match /{path=**}/...` block in
`firestore.rules`. Restart the emulators after editing rules.

**Functions changes have no effect.** The `functions` pane has a TypeScript
error, or the watch process died. Confirm with:

```bash
npm run build --workspace=Functions
```

**The app is talking to production.** `VITE_USE_EMULATORS` must be `true`.
`npm run dev` sets it; plain `npm run dev --workspace=App` does not. The
browser console logs "Firebase connected to emulators" when it is correct.

## Next steps

- [Project Structure](../PROJECT_STRUCTURE.md)
- [Security Guidelines](../SECURITY.md)
- [Firebase Collections](../firebase/FIREBASE_COLLECTIONS_README.md)
