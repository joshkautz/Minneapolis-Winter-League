# Documentation

Documentation for the Minneapolis Winter League application, grouped by area.

## By area

| Directory                      | Contents                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| [`setup/`](./setup/)           | Environment setup, environment variables, emulator data, reloading |
| [`app/`](./app/)               | React front end — features, error boundaries, bundle size          |
| [`functions/`](./functions/)   | Cloud Functions — API reference, player ranking algorithm          |
| [`firebase/`](./firebase/)     | Firestore collections, indexes, authentication                     |
| [`historical/`](./historical/) | Completed migrations and superseded plans, kept for context        |

Top-level documents: [Project Structure](./PROJECT_STRUCTURE.md),
[Security Guidelines](./SECURITY.md), [Roadmap](./ROADMAP.md),
[Team Payments](./TEAM_PAYMENTS.md) (design, not yet built).

## Start here

1. [Development Setup](./setup/DEVELOPMENT_SETUP.md) — get running locally
2. [Project Structure](./PROJECT_STRUCTURE.md) — how the codebase is organized
3. [Security Guidelines](./SECURITY.md) — the functions-first model
4. [Firebase Collections](./firebase/FIREBASE_COLLECTIONS_README.md) — the data model

## Security model in one paragraph

`firestore.rules` denies every client write. The client SDK reads league data
and nothing else; all mutations go through callable Cloud Functions running on
the Admin SDK, which enforce authorization themselves via
`Functions/src/shared/auth.ts`. Admin status is a boolean field on the player
document — this codebase does not use Firebase Auth custom claims. Per-user
private data (`stripe/{uid}`, `dropbox/{uid}`) is readable only by its owner.

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

Ports are defined in `firebase.json`.

## Keeping docs honest

These documents drifted badly once before: the index linked to nine files that
had been moved, and the setup guide documented ten npm scripts that did not
exist. When you change behavior, update the document in the same commit, and
verify any command you write by running it. If a document describes something
that has already happened and will not happen again, move it to
`historical/` rather than leaving it to rot in place.
