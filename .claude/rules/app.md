---
paths:
  - App/**
description: Conventions for the React front end
---

# App (React + Vite)

## Where things go

```
App/src/
  features/{public,player,admin}/<feature>/   feature modules, each with index.ts
  components/ui/      shadcn/ui primitives — generated, avoid hand-editing
  providers/          React context providers, composed in providers-wrapper.tsx
  firebase/           SDK setup (app.ts) and per-collection query builders
  routes/             route table and lazy route components
  shared/             components, hooks, types, utils used across features
  test/setup.ts       Vitest global setup
```

Files are **kebab-case**. Each feature directory exports through its `index.ts`.

## Path aliases

`@/`, `@/features`, `@/shared`, `@/providers`, `@/routes`, `@/firebase`,
`@/components` are configured in both `vite.config.ts` and `tsconfig.json`.
Adding one means editing both.

## Firestore access

Never call `collection()` / `doc()` inline in a component. Add a typed query
builder to `App/src/firebase/collections/<domain>.ts` and consume it through
`react-firebase-hooks`:

```ts
const [snapshot, loading, error] = useCollection(seasonsQuery())
```

Import Firebase from `firebase/firestore`, never `@firebase/firestore` — the
two resolve to separate SDK instances and refs from one fail the other's type
checks.

Import each thing from the one place it lives. There is no `@/firebase`
barrel:

- query builders and callables from their module,
  `@/firebase/collections/<domain>` or `@/firebase/collections/functions`;
- the app, Auth and Firestore instances from `@/firebase/app`;
- SDK types (`DocumentReference`, `QuerySnapshot`, `User`) from the SDK;
- document shapes (`PlayerDocument`, `SeasonDocument`) from `@/types`.

A context hook throws when used outside its provider. Returning empty
defaults instead hid a missing provider as an empty page.

Shared hooks cover the patterns that recur, so reach for them before writing
an effect:

- `useQueryErrorHandler` — log and toast a failed query, once per error.
  `logger.error(message, error, context)` takes the error second; passing a
  context object there logs it as `[object Object]`.
- `useResolvedSnapshot` — follow the references on each document of a
  snapshot, without a stale resolve overwriting a newer one.
- `usePaginatedFeed` — an infinitely scrolling, season-scoped feed.

**Show errors through `errorMessage(error, fallback)`** (`@/shared/utils`),
never `error.message`. It passes a callable's refusal through as written,
translates Auth, Firestore and network errors, and otherwise shows the
fallback, so make the fallback a sentence saying what failed. Pick images
with `ImageField`, which applies the server's upload rules before sending.

**Writes go through callables**, never the client SDK. `firestore.rules` denies
all client writes. Add the call to `App/src/firebase/collections/functions.ts`.

## Collection-group queries: never use `doc.id`

`teamsInSeasonQuery` is a collection-group query over
`teamSeasons`, and those subdocs are keyed by **season id**. So every result
of a single-season query has the _same_ `doc.id`, and it is not the team's id.

This is quiet rather than loud: the code type-checks, the list renders, and the
only symptoms are duplicate React keys and a `<Select>` whose options all carry
one value that matches nothing — which is how the admin player editor came to
show a blank team for every season.

Derive the canonical id from the parent instead:

```ts
import { canonicalTeamIdFromTeamSeasonDoc } from '@/firebase/collections/teams'

const teams = snapshot.docs.map((doc) => ({
	...doc.data(),
	id: canonicalTeamIdFromTeamSeasonDoc(doc),
}))
```

The same applies to `playerSeasons`, via
`canonicalPlayerIdFromPlayerSeasonDoc`. A useful check when reviewing: if a
collection-group result's `id` is used to match against a document reference's
`.id`, it has to come from one of these helpers.

## Buttons that call the server

Every button that starts a callable shows it is working, cannot fire twice,
and is marked busy. Use the shared pieces rather than hand-rolling a spinner:

- `LoadingButton` (`@/shared/components`) — `loading` and `loadingText`
  ("Inviting..."). The spinner replaces a leading icon; it does not sit beside
  it.
- `usePendingAction` (`@/shared/hooks`) — `run(action)` guards double clicks
  with a ref. Pass `reflected` when the result arrives through a Firestore
  listener after the call returns, so the button goes from "Inviting..."
  straight to "Invited" instead of flashing back to "Invite". An action
  reports failure by resolving `false`, having already toasted why.
- `DestructiveConfirmationDialog` awaits a promise from `onConfirm` and stays
  open, busy and undismissable until it settles.

Hand-built `AlertDialogAction`s: Radix closes the dialog on click, so an async
handler needs `event.preventDefault()` and an `onOpenChange` that refuses to
close while pending — otherwise the spinner is never seen.

In a list, keep pending state per row (in the row component, or keyed by id).
One shared flag makes every row's button spin at once.

## Admin pages

Route an admin page through `AdminRoute` (`routes/route-wrappers.tsx`). It
renders `AdminGate`, which reads the player's `admin` flag from the auth
context once, so a page never checks for itself or opens its own listener
on the player document. Shared admin pieces — `BackToAdminButton`, the
season filter and its card — are in `features/admin/shared`.

The gate hides pages; it protects nothing. Every admin callable calls
`validateAdminUser` itself.

## Rules shared with the server

Validation both sides enforce is written once in Functions and imported
through `@/shared/image-rules`, `@/shared/name-rules`, `@/shared/text-rules`
and `@/shared/waiver`. Use those constants — for a field's `maxLength` and
counter too — rather than restating a limit. A new rule goes in the
Functions file, which must stay free of imports.

## Providers

`providers-wrapper.tsx` composes the full context stack and is mounted in
`main.tsx`. Anything rendering `App` outside that wrapper (including tests)
will throw from `useAuthContext`. Order matters — auth sits above the data
contexts that depend on it.

## Testing

Vitest + Testing Library, jsdom. `src/test/setup.ts` registers jest-dom
matchers and stubs `matchMedia` and `ResizeObserver`, neither of which jsdom
implements and both of which the app shell calls on mount.

Component tests that mount routed UI need `ProvidersWrapper` + `BrowserRouter`,
mirroring `main.tsx`. See `src/App.test.tsx`.

`App/.env.test` supplies fake Firebase config; `src/firebase/app.ts` throws at
import time without it.

## Styling

Tailwind v4 with shadcn/ui. Compose classes with `cn()` from `@/shared/utils`.
Prefer existing primitives in `components/ui/` over new bespoke components.

Draw a team's logo with `TeamLogo` (`@/shared/components`), which falls back
to the team's initial when there is none or it fails to load; a season of a
team's history with `SeasonHistoryRow`; and a finish with `formatPlacement`
or `ordinal` (`@/shared/utils`).
