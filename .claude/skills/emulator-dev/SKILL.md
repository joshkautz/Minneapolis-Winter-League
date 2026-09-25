---
name: emulator-dev
description: Start, seed, reset or troubleshoot the local Firebase Emulator Suite for this repo. Use when asked to run the app locally, get emulators going, refresh or reset local data, or when local development against Firebase is not behaving.
---

# Local development with the Firebase emulators

## First run in a fresh clone or worktree

`.emulator/` is gitignored, so a new checkout has no data.

```bash
nvm use                 # Node 22
npm ci
npm run seed            # boots throwaway emulators, seeds, writes ./.emulator
npm run dev             # emulators + Functions watch + Vite
```

`npm run seed` needs no Firebase credentials. It generates 480 Auth users, 4
seasons, 36 teams, 480 players and 216 games locally, then exports the
snapshot so later runs import it.

## Everyday loop

```bash
npm run dev
```

Starts three processes under `concurrently`, labelled `functions`, `emulators`
and `app`:

- App — <http://localhost:5173>
- Emulator UI — <http://localhost:4000>

Data is exported to `.emulator/` on clean shutdown (Ctrl-C), so state survives
restarts. Kill the terminal and you lose the session's changes.

To reseed emulators that are already running, in a second terminal:

```bash
npm run seed:attach
```

## Resetting

```bash
npm run emulators:clean   # discard ./.emulator and start empty
npm run seed              # regenerate synthetic data
```

## Working against production-shaped data

Only when reproducing a real issue — this pulls live user data onto the
machine:

```bash
gcloud auth application-default login
npm run data:refresh
```

It exports production to `scripts/production/data/`, loads it into the
emulators and snapshots to `.emulator/`. Both directories are gitignored;
neither should ever be committed.

## What reloads and what does not

| Change                     | Effect                                 |
| -------------------------- | -------------------------------------- |
| `App/src/**`               | Vite HMR, instant                      |
| `Functions/src/**`         | tsc watch recompiles, emulator reloads |
| `firestore.rules`, indexes | **restart the emulators**              |
| `firebase.json`            | **restart the emulators**              |

## The Functions emulator is not isolated

It runs against the production project id, and any secret missing from
`Functions/.secret.local` is fetched from production Secret Manager with your
credentials. `config/environment.ts` refuses a live Stripe key under the
emulator, so put a Stripe test key in `.secret.local` to exercise payments.

## When it misbehaves

Delegate to the `emulator-debugger` agent, or check in this order: is the
Functions tsc watch alive and compiling; is there data (`npm run seed`); is a
port still held by a previous run; were rules edited without a restart.
