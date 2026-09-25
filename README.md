# Minneapolis Winter League

Web application for running the Minneapolis Winter League, a local ultimate
frisbee league. It covers the full season lifecycle: registration and payment,
team creation and rosters, the invite/request workflow, scheduling, standings,
player rankings and signed waivers.

| Environment   | Status                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production    | [![Production](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-merge.yml)            |
| Pull requests | [![Testing](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-pull-request.yml/badge.svg)](https://github.com/joshkautz/Minneapolis-Winter-League/actions/workflows/firebase-hosting-pull-request.yml) |

## Quick start

Requires **Node 22** (see `.nvmrc`) and a JDK on your PATH for the Firebase
emulators.

```bash
git clone https://github.com/joshkautz/Minneapolis-Winter-League.git
cd Minneapolis-Winter-League
nvm use
npm ci

npm run seed   # generate local test data (no Firebase credentials needed)
npm run dev    # emulators + Functions watch + Vite dev server
```

- App: <http://localhost:5173>
- Firebase Emulator UI: <http://localhost:4000>

`npm run seed` creates a fully populated local dataset — 480 users, 4 seasons,
36 teams and 216 games — entirely offline. Production access is never required
for day-to-day development.

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui
- **Backend**: Firebase Cloud Functions Gen 2 on Node 22
- **Data**: Cloud Firestore, Firebase Auth, Cloud Storage, Firebase Hosting
- **Payments**: Stripe (custom integration, not the Firebase extension)
- **Waivers**: signed in the app (see `docs/WAIVERS.md`)
- **Testing**: Vitest + Testing Library

## Repository layout

```
├── App/              React front end (npm workspace)
├── Functions/        Cloud Functions Gen 2 (npm workspace)
├── scripts/          Seeding and maintenance scripts (plain Node, not a workspace)
├── docs/             Documentation, grouped by area
├── firestore.rules   Client access rules — all writes denied
└── firebase.json     Emulator ports, hosting, functions runtime
```

## Commands

Run from the repository root.

| Command                    | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run dev`              | Emulators, Functions watch and Vite, together                     |
| `npm run seed`             | Populate the emulators with synthetic data                        |
| `npm run seed:attach`      | Reseed emulators that are already running                         |
| `npm run emulators:clean`  | Discard local emulator data and start empty                       |
| `npm run data:refresh`     | Clone production into the emulators (needs gcloud credentials)    |
| `npm run verify`           | format, lint, typecheck, unit, rules and integration tests, build |
| `npm test`                 | Unit tests for both workspaces, single run                        |
| `npm run test:rules`       | Firestore rules tests (boots the emulator itself)                 |
| `npm run test:integration` | Functions against the emulators                                   |
| `npm run build`            | Production build of both workspaces                               |
| `npm run deploy`           | Deploy everything via the Firebase CLI                            |

## Architecture

The application is **functions-first**. `firestore.rules` denies every client
write; the client SDK reads and nothing more. All mutations go through callable
Cloud Functions, which run with the Admin SDK and enforce authorization
themselves.

This means:

- Authorization lives in `Functions/src/shared/auth.ts`, not in rules. Admin
  status is a boolean on the player document, not a Firebase Auth custom claim.
- Multi-document changes (rosters, registration state, offers) run inside
  Firestore transactions.
- `Functions/src/index.ts` is the deploy manifest — a function that is not
  re-exported there is not deployed.

Per-season state lives in subcollections rather than on the parent document:
`players/{uid}/playerSeasons/{seasonId}` and
`teams/{teamId}/teamSeasons/{seasonId}`, with roster membership as a further
subcollection under the latter.

## Documentation

[`docs/README.md`](./docs/README.md) is the index.

| Area               | Start here                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Setup and workflow | [Development Setup](./docs/setup/DEVELOPMENT_SETUP.md) · [Environment Variables](./docs/setup/ENVIRONMENT_VARIABLES.md) |
| Codebase structure | [Project Structure](./docs/PROJECT_STRUCTURE.md)                                                                        |
| Security           | [Security Guidelines](./docs/SECURITY.md) · [Authentication](./docs/firebase/AUTHENTICATION_SYSTEM.md)                  |
| Firestore          | [Collections](./docs/firebase/FIREBASE_COLLECTIONS_README.md) · [Indexes](./docs/firebase/FIRESTORE_INDEXES.md)         |
| Functions          | [Functions overview](./docs/functions/README.md) · [Player rankings](./docs/functions/PLAYER_RANKING_ALGORITHM.md)      |
| Front end          | [App overview](./docs/app/README.md)                                                                                    |
| Payments, waivers  | [Team payments](./docs/TEAM_PAYMENTS.md) · [Waivers](./docs/WAIVERS.md)                                                 |
| Planned work       | [Roadmap](./docs/ROADMAP.md)                                                                                            |

Working in this repo with Claude Code? [`CLAUDE.md`](./CLAUDE.md) carries the
conventions, with path-scoped detail in `.claude/rules/`.

## Deployment

On merge to `main`, GitHub Actions deploys Hosting and Functions. Pull requests
get a Firebase Hosting preview channel, commented on the PR. There is only one
Firebase project, so a preview serves the new front end against production
data: use the emulators for anything that writes.

Prefer CI to `npm run deploy`. CI refuses a deploy that would delete a
function; a local deploy does not, and it leaves a `Functions/node_modules`
that breaks the emulator tests until deleted.

Firestore rules and indexes deploy from CI too, in a job gated on the rules
test suite. To deploy them out of band:

```bash
firebase deploy --only firestore
```

## Contributing

1. Branch from `main`.
2. Follow the [Development Setup Guide](./docs/setup/DEVELOPMENT_SETUP.md).
3. Run `npm run verify` before opening a PR.
4. Open a pull request; the preview channel URL is posted as a comment.

## License

MIT — see [LICENSE](LICENSE).
