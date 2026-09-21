# Emulator Data

How local Firebase Emulator Suite data is created, stored and reset.

## Where it lives

`.emulator/` at the repository root, in the emulators' native export format:

| Path                            | Contents              |
| ------------------------------- | --------------------- |
| `auth_export/`                  | Auth users and config |
| `firestore_export/`             | Firestore documents   |
| `storage_export/`               | Cloud Storage objects |
| `firebase-export-metadata.json` | Export manifest       |

**`.emulator/` is gitignored and must stay that way.** It can hold a clone of
production pulled down by `npm run data:refresh`, which means real names and
email addresses. It is not shared test data and is never committed.

Because it is gitignored, a fresh clone or a new git worktree starts with no
data at all. `scripts/start-emulators.sh` handles that: it imports the
snapshot when `firebase-export-metadata.json` is present and starts empty
otherwise, rather than failing the way a bare `--import` would.

## Two ways to get data

### Synthetic (default)

```bash
npm run seed
```

Boots a throwaway emulator set, runs the seeders in order, and exports the
result to `.emulator/`. No Firebase login, no production access, no real
personal data.

It produces:

| Collection | Count | Notes                                               |
| ---------- | ----- | --------------------------------------------------- |
| Auth users | 480   | Verified emails, no passwords set                   |
| Seasons    | 4     | 2023 Fall through 2026 Winter                       |
| Teams      | 36    | Across the active seasons, with full rosters        |
| Players    | 480   | One per Auth user, varied payment and waiver states |
| Games      | 216   | Mix of completed (with scores) and upcoming         |

Placements and player rankings are **not** seeded — see
[Roadmap](../ROADMAP.md#seeder-gaps). Everything else renders.

Order matters: `generate-accounts.js` imports the Auth users, then `seed.js`
builds Firestore documents from them. Running `seed.js` against an empty Auth
emulator produces zero players and then fails while creating teams.

`seed.js` takes optional arguments, forwarded through the npm script:

```bash
npm run seed -- --setup-only            # seasons, teams and players; no games
npm run seed -- --week 1                # add a single week of results
```

To reseed emulators that are already running, from a second terminal:

```bash
npm run seed:attach
```

### Cloned from production

Only for reproducing a real issue.

```bash
gcloud auth application-default login
npm run data:refresh
```

Exports production to `scripts/production/data/` (also gitignored), loads it
into the emulators, and snapshots to `.emulator/`. Requires production
credentials and puts live user data on your machine — prefer the synthetic
path.

## Signing in

Seeded users have verified emails and no password. Sign in as any of them from
the Auth tab of the Emulator UI at <http://localhost:4000/auth>, or create a
user there.

Admin access is the `admin` boolean on the player document, not an Auth custom
claim. Set it from the Firestore tab.

## Persisting your changes

Data you create while `npm run dev` is running is exported back to
`.emulator/` on clean shutdown (Ctrl-C). Killing the terminal loses the
session.

## Resetting

```bash
npm run emulators:clean   # discard ./.emulator, start empty
npm run seed              # regenerate synthetic data
```
