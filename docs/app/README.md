# The App

The React front end in `App/`: React 19, TypeScript, Vite, Tailwind v4 with
shadcn/ui, React Router 7, react-hook-form with Zod, and the modular Firebase
SDK read through `react-firebase-hooks`.

The conventions for writing code here — where files go, path aliases, how to
query Firestore, busy buttons, providers — are in
[`.claude/rules/app.md`](../../.claude/rules/app.md). This page is the tour.

## Layout

```
App/src/
  main.tsx, App.tsx     entry point; App mounts the global error boundary and routes
  routes/               the route table, route wrappers, lazy route components
  features/public/      pages anyone can open: home, schedule, standings, teams,
                        rankings, news, message board, sign-in, join, create
  features/player/      signed-in pages: profile, manage team, waiver
  features/admin/       one directory per admin screen
  providers/            auth, seasons, teams, offers, games, badges, site settings, theme
  firebase/             SDK setup and typed query builders per collection
  shared/               components, hooks and utils used by more than one feature
  components/ui/        shadcn/ui primitives
  types.ts              Collections enum and document shapes, mirrored in Functions
```

Each feature directory exports its public pieces through an `index.ts`; the
route table imports from there.

## Reading and writing data

The App reads Firestore directly and writes nothing: `firestore.rules` denies
every client write, and every change goes through a callable in
`firebase/collections/functions.ts`.

Reads use the query builders in `firebase/collections/<domain>.ts` with
`useCollection` / `useDocument`. A few shared hooks cover the patterns that
recur:

| Hook                        | For                                                                  |
| --------------------------- | -------------------------------------------------------------------- |
| `useQueryErrorHandler`      | Logging a failed query and toasting it, once per error               |
| `useResolvedSnapshot`       | Following references on each document of a snapshot, without races   |
| `usePaginatedFeed`          | An infinitely scrolling feed: a live first page, later pages fetched |
| `usePendingAction`          | A button that calls the server: busy state and no double submits     |
| `useIsTeamRegistrationFull` | Whether every registration spot this season is taken                 |

## Routing, code splitting and errors

`routes/route-components.ts` lazy-loads every page with `lazyImport`, so each
route is its own chunk. `routes/app-routes.tsx` renders each through
`PublicRoute` or `AuthenticatedRoute` (`routes/route-wrappers.tsx`), which add
the Suspense fallback and an `ErrorBoundary`. A page that throws shows an
error card while the navigation keeps working; `GlobalErrorBoundary` in
`App.tsx` catches anything outside a route.

After a release, a tab still running the previous build can ask for a chunk
that no longer exists. The route boundary recognises that
(`shared/utils/stale-deployment.ts`) and offers a refresh instead of
reporting a fault.

Heavy, optional code loads on first use. The particle animation behind the
home hero and the "Coming Soon" card is the largest: `shared/components/
sparkles.tsx` lazy-loads it, which keeps tsparticles (about 200 KB) out of the
entry chunk.

## Feature notes

**News** (`features/public/news`, `features/admin/news-management`). Admins
post announcements for a season with `createNews`, `updateNews` and
`deleteNews`; the page lists the selected season's newest first, ten at a
time, through `usePaginatedFeed`.

**Message board** (`features/public/posts`, `features/admin/posts-management`).
Any player with a verified email who is not banned can post and reply;
admins can delete either.
`replyCount` is kept on the post so the list needs no count query.

**Games** (`features/admin/game-management`). Games are played on Saturdays at
6:00, 6:45, 7:30 or 8:15pm Central, on fields 1 to 3, one game per field per
slot. The form sends the kickoff with the admin's UTC offset, and
`createGame` / `updateGame` check the wall-clock day and time in that string
(`Functions/src/shared/gameSchedule.ts`), so a slot stays the same slot across
the November DST change. A game's teams can be left empty as a placeholder;
the team names are copied onto the game (`homeName`, `awayName`) so the
schedule renders without a join.

**Team payments and waivers** have their own documents:
[TEAM_PAYMENTS.md](../TEAM_PAYMENTS.md) and [WAIVERS.md](../WAIVERS.md).

## Commands

From the repository root:

```bash
npm run dev             # emulators + Functions watch + Vite
npm test                # Vitest for App and Functions
npm run build           # type-checks and builds both workspaces
```

Inside `App/`, `npm run dev` points Vite at production Firebase and
`npm run dev:emulators` at the local emulators; `npm run test:watch` runs
Vitest in watch mode.

Configuration is the `VITE_FIREBASE_*` web config, `VITE_USE_EMULATORS` and
`VITE_LOG_LEVEL`; see
[ENVIRONMENT_VARIABLES.md](../setup/ENVIRONMENT_VARIABLES.md).

## Tests

Vitest with Testing Library in jsdom. `src/test/setup.ts` registers the
jest-dom matchers, stubs the browser APIs jsdom lacks and silences
Firestore's own logger; `App/.env.test` supplies a fake Firebase config,
without which `firebase/app.ts` throws at import. Components that mount
routed UI need `ProvidersWrapper` and a router, as `src/App.test.tsx` does.
