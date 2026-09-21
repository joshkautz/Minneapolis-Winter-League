# Minneapolis Winter League

Web application for running the Minneapolis Winter League — a local **ultimate
frisbee** league. It handles season setup, team rosters, the invite/request
workflow, scheduling, standings, player rankings, registration payments and
waivers.

## Layout

npm workspaces monorepo. Node 22 is required (`.nvmrc`); the Functions runtime
is pinned to `nodejs22` in `firebase.json`.

| Path         | What it is                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| `App/`       | React 19 + TypeScript + Vite front end (workspace)                           |
| `Functions/` | Firebase Cloud Functions Gen 2, the only writer to Firestore (workspace)     |
| `scripts/`   | Node maintenance and seeding scripts — **not** a workspace, run with `node`  |
| `docs/`      | Long-form documentation, grouped by area                                     |
| `.emulator/` | Local emulator snapshot. Gitignored; may contain a clone of production data. |

Shared config lives at the root: `.prettierrc`, `eslint.base.js`,
`firestore.rules`, `firestore.indexes.json`, `storage.rules`.

## Commands

Run everything from the repository root.

```bash
npm run dev            # emulators + Functions watch + Vite, all at once
npm run seed           # populate the emulators with synthetic data (no prod access)
npm run verify         # format + lint + typecheck + test + test:rules + build
npm test               # vitest across App and Functions, single run
npm run test:rules     # Firestore rules tests (boots the emulator itself)
npm run typecheck      # tsc --noEmit across both workspaces
npm run lint:fix       # eslint --fix across both workspaces
```

Run `npm run verify` before declaring work finished — both GitHub Actions
workflows gate on `format:check`, `lint:check` and `build`, so a formatting
slip fails the build.

## Architecture: Functions-first

Every write to Firestore goes through a callable Cloud Function. `firestore.rules`
denies all client writes to every collection — the client SDK reads, and nothing
else. When adding a feature that persists anything:

1. Add the callable in `Functions/src/functions/{admin,user}/<domain>/`.
2. Export it from `Functions/src/index.ts` (that file is the deploy manifest —
   a function missing from it does not exist in production).
3. Call it from the App via `App/src/firebase/collections/functions.ts`.
4. Only add a Firestore rule if a new collection needs _read_ access.

Authorization is enforced inside the function via the helpers in
`Functions/src/shared/auth.ts`, never by rules. Admin status lives on the
player document's `admin` boolean; this codebase does not use Firebase Auth
custom claims.

## Data model

Top-level collections are listed in the `Collections` enum, which is duplicated
in `Functions/src/types.ts` and `App/src/types.ts` — **keep both in sync**.
Per-season state hangs off subcollections rather than the parent document:

- `players/{uid}/playerSeasons/{seasonId}` — paid, signed, banned, captain, team
- `teams/{teamId}/teamSeasons/{seasonId}` — per-season team participation
- `teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}` — membership join

Collection-group queries over these need their own explicit
`match /{path=**}/...` block in `firestore.rules`, even when the direct path is
already allowed.

## Conventions

- Prettier owns formatting: **tabs**, no semicolons, single quotes, width 80.
  Never hand-format; run `npm run format:fix`.
- ESLint flat config. `eslint.base.js` holds the shared rules; each workspace
  extends it. Functions is stricter than App — `no-explicit-any` and
  `explicit-function-return-type` are errors there, warnings/off in App.
- Named exports throughout. Files are kebab-case in `App/`, camelCase in
  `Functions/`; match whichever directory you are in.
- Import Firebase from the `firebase/*` entry points, never `@firebase/*`.
  Mixing the two yields two SDK instances that fail each other's type checks.

## Gotchas

- `Functions/src/index.ts` is the deploy manifest. Forgetting to export is the
  most common way a new function silently does nothing.
- `.emulator/` is gitignored and may hold real production data pulled down by
  `npm run data:refresh`. Never commit it, and prefer `npm run seed` (synthetic,
  offline) unless you specifically need production shapes.
- `App/.env.test` supplies fake Firebase config for Vitest. Without it,
  `App/src/firebase/app.ts` throws at import and every component test dies.
- `react-firebase-hooks` is aliased to its ESM build in `App/vite.config.ts`;
  see the comment there before touching resolve config.

## Tests

Three suites, all run by `npm run verify`:

| Suite           | Location                     | Covers                          |
| --------------- | ---------------------------- | ------------------------------- |
| App             | `App/src/**/*.test.tsx`      | Component smoke test            |
| Functions       | `Functions/src/**/*.test.ts` | Auth validators, webhook guards |
| Firestore rules | `tests/rules/*.test.ts`      | The deny-all-writes invariant   |

The rules suite matters most: `firestore.rules` is the only thing between a
client and the database, and nothing else catches a change that opens a write.
It runs against the real emulator — `npm run test:rules` starts one.

Coverage is still thin overall (see `docs/ROADMAP.md`). When you touch a
callable's authorization or a rules block, add a test in the same change.

## Reference docs

`docs/README.md` is the index. Start there rather than guessing filenames.
