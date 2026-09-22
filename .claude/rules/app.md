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

**Writes go through callables**, never the client SDK. `firestore.rules` denies
all client writes. Add the call to `App/src/firebase/collections/functions.ts`.

## Collection-group queries: never use `doc.id`

`teamsInSeasonQuery` / `teamsBySeasonQuery` are collection-group queries over
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
