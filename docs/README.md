# Documentation

Documentation for the Minneapolis Winter League application, grouped by area.

## By area

| Directory                      | Contents                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| [`setup/`](./setup/)           | Environment setup, environment variables, emulator data, reloading |
| [`app/`](./app/)               | React front end — layout, data access, routing, feature notes      |
| [`functions/`](./functions/)   | Cloud Functions — what exists, player ranking algorithm            |
| [`firebase/`](./firebase/)     | The data model, indexes, authentication                            |
| [`historical/`](./historical/) | The teams-v2 design record and the retired karma leaderboard       |

Top-level documents: [Project Structure](./PROJECT_STRUCTURE.md),
[Security Guidelines](./SECURITY.md), [Roadmap](./ROADMAP.md),
[Team Payments](./TEAM_PAYMENTS.md), [Waivers](./WAIVERS.md), [Email](./EMAIL.md),
[Badges](./BADGES.md).

## Start here

1. [Development Setup](./setup/DEVELOPMENT_SETUP.md) — get running locally
2. [Project Structure](./PROJECT_STRUCTURE.md) — how the codebase is organized
3. [Security Guidelines](./SECURITY.md) — the functions-first model
4. [Firebase Collections](./firebase/FIREBASE_COLLECTIONS_README.md) — the data model

## Security model in one sentence

Clients read and callable Cloud Functions write: `firestore.rules` denies
every client write, and each callable authorizes its caller itself.
[SECURITY.md](./SECURITY.md) has the detail, including which data is
private to whom.

## Development URLs

| Service     | URL                     |
| ----------- | ----------------------- |
| React app   | <http://localhost:5173> |
| Emulator UI | <http://localhost:4000> |
| Firestore   | <http://localhost:8080> |
| Auth        | <http://localhost:9099> |
| Functions   | <http://localhost:5001> |
| Storage     | <http://localhost:9199> |
| Hosting     | <http://localhost:5005> |

Ports are set in `firebase.json`, except the Emulator UI's, which is the
default.

## Keeping docs honest

These documents drifted badly once before: the index linked to nine files that
had been moved, and the setup guide documented ten npm scripts that did not
exist. When you change behavior, update the document in the same commit, and
verify any command you write by running it. If a document describes something
that has already happened and will not happen again, delete it — git history
keeps it — unless it is the design record behind code that still exists, in
which case move it to `historical/` with a note saying so.
