# Roadmap

Planned work. Ideas that have been superseded or already shipped belong in
`docs/historical/`, not here.

## Badges

Badges already implemented are marked `x`. The rest are designed but not built.

| Done | Badge               | Condition                                                       |
| ---- | ------------------- | --------------------------------------------------------------- |
| x    | Early Bird          | First team to fully register for the season                     |
| x    | Close Call          | Last team to fully register for the season                      |
| x    | Pillar of Community | Start the season with the most karma                            |
| x    | Private Property    | Start the season with zero karma                                |
| x    | Welcome             | Start the season as a new team                                  |
| x    | Veteran             | Start the season as a rolled-over team                          |
| x    | Thin Ice            | Roster a previously banned or suspended player                  |
| x    | Schooled            | Lose to a team of high schoolers                                |
| x    | Imposters           | Caught with a player changing their name                        |
| x    | Merciless           | Beat a team by 15 points                                        |
| x    | Speedrun            | Participate in a game with at least 27 points scored            |
|      | Just Warming Up     | Score 5 or fewer points in a game                               |
|      | Show Off            | Score 18 or more points in a game                               |
|      | Streaker            | Win 10 games in a row                                           |
|      | Also a Streaker     | Lose 10 games in a row                                          |
|      | Consistent          | Score the same number of points twice in one night              |
|      | Dishonor            | Forfeit a game                                                  |
|      | Usurpers            | Roll over a team and have no previous captains                  |
|      | Kings of the North  | Have the top ranked player on your team after the season starts |
|      | Addicted            | Team exists for 3 seasons in a row                              |
|      | Dinosaurs           | Team has competed in 10 different seasons                       |
|      | Forefathers         | Team played in the inaugural season                             |
|      | 20XX                | Play in the 20XX season                                         |
|      | Improvement         | Place higher than last season                                   |
|      | Growing Pains       | Place lower than last season                                    |

## Waivers

- **Waiver history UI** — the per-season subcollection already stores every
  waiver, so a player's history across seasons can be surfaced directly.
- **Admin waiver management** — view all pending waivers, manually mark one
  signed for edge cases, cancel or resend.
- **Waiver expiration** — expire pending waivers after some window (30 days?)
  so stale requests do not accumulate.

## Blocked dependency upgrades

Two majors are held back because the surrounding ecosystem does not support
them yet. Both are worth retrying periodically.

### ESLint 10

`eslint-plugin-react` caps its peer range at `^9.7` as of 7.37.5 and crashes
under ESLint 10 with `contextOrFilename.getFilename is not a function`.
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` and
`typescript-eslint` already support 10 — only `eslint-plugin-react` blocks it.
Retry once it ships an ESLint 10-compatible release.

### TypeScript 7

`typescript-eslint` refuses to load against TS 7.0 outright
("typescript-eslint does not support TS 7.0"), which takes the whole lint step
down, not just type-aware rules. Support is tracked in
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
and is expected against TS 7.1 or later.

The TS 7 migration work itself is already done: `App/tsconfig.json` no longer
uses `baseUrl` (removed in TS 7; the `paths` entries are relative to the
tsconfig, which works identically in TS 6). Bumping `typescript` should be the
only change needed when the linter catches up.

### Known advisories

`npm audit` reports 8 moderate advisories, all transitive dependencies of
`firebase-tools` (`re2`, `stream-json`, `csv-parse`, `uuid`,
`@opentelemetry/core`). `firebase-tools` is a dev-only CLI and none of this
reaches the deployed App or Functions. npm's suggested "fix" is a downgrade to
firebase-tools 10.1.1, which is not one. Recheck when firebase-tools updates
its own dependencies.

## React effect cleanup

`eslint-plugin-react-hooks` 7.1 promoted `react-hooks/set-state-in-effect` to
an error. Seventeen of the original twenty-three call sites are fixed; the
rule is still a warning in `App/eslint.config.js` until the last six are done,
then it should be restored to `error`.

Fixed so far: the season selectors derive their default instead of seeding it
in an effect, the reset-on-change effects adjust state during render, the
snapshot-resolution effects moved to `useResolvedSnapshot` (which also fixes a
race where a slow resolve could overwrite newer rows), pure derivations became
`useMemo`, and `use-mobile` uses `useSyncExternalStore`.

Remaining, all deliberately left because they could not be exercised against
the current seed data and the change is behavioral rather than mechanical:

| Site                                                               | Why it is still open                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/carousel.tsx`                                       | shadcn-generated; notifies a parent setter from an effect. Revisit when the component is regenerated.                                                                                                                                             |
| `features/public/news/news.tsx`, `features/public/posts/posts.tsx` | The first page is seeded from a snapshot and then extended by `loadMore`. Fixing it properly means deriving the first page and keeping only the extra pages in state. The seeder creates no news or posts, so there is nothing to verify against. |
| `features/admin/swiss-rankings/swiss-rankings.tsx`                 | Loads teams for the selected Swiss season; the seeder creates no Swiss-format seasons.                                                                                                                                                            |
| `features/public/create/hooks/use-rollover-team-form.ts` (x2)      | Needs a signed-in captain with a rolled-over team from a prior season.                                                                                                                                                                            |

Seeder fixtures for news, posts, Swiss seasons and rollover-eligible captains
would make all six verifiable, and are worth adding first.

## Seeder gaps

`scripts/seed.js` was migrated to the subcollection data model (teams,
teamSeasons, roster, playerSeasons) but two gaps remain:

- **No championship week.** `updateTeamPlacements` runs and finds no Week 7
  games, so every `teamSeasons.placement` stays `null`. The placement logic
  itself is intact; the game generator never produces the second playoff
  week it looks for.
- **No rankings.** The Players page reads the `rankings` collection, which is
  produced by the `rebuildPlayerRankings` admin callable rather than the
  seeder, so it is empty locally until that function is run.

## Firestore index drift

`firestore.indexes.json` declares 17 indexes; production has **23**. The six
that exist only in production are:

| Collection           | Fields                         |
| -------------------- | ------------------------------ |
| `karma_transactions` | player, reason, season, amount |
| `offers`             | player, type                   |
| `offers`             | team, type                     |
| `teams`              | season, registered             |
| `teams`              | teamId, season                 |
| `waivers`            | player, season                 |

They look like pre-migration leftovers: `karma_transactions` has **zero**
references left in the codebase, and `teams.season` / `teams.teamId` are the
flat shape that the `teamSeasons` subcollection replaced.

Nothing is at risk today — the CI deploy runs `firebase deploy --only
firestore` **without** `--force`, so indexes present only in production are
never deleted. But the two are out of step, and anyone adding `--force` would
drop them.

Worth doing, carefully: confirm each of the six is genuinely unused, then
delete them from production so the file is the whole truth. Deleting a live
index breaks any query depending on it, so verify before removing.

## A real staging environment

There is currently one cloud environment. `.firebaserc` has `staging` and
`development` aliases, but `minnesota-winter-league-staging` and
`minnesota-winter-league-dev` do not exist, and `App/.env.staging` points at
production — so `npm run build:staging` builds against production.

This also means **PR preview channels are not isolated**: they serve a new
frontend against the production database, so clicking through a preview
writes real data.

To stand one up:

1. Create the `minnesota-winter-league-staging` Firebase project.
2. Enable Firestore, Auth and Storage; deploy `firestore.rules` and the
   indexes to it.
3. Give it its own secrets: Stripe **test** keys, a Dropbox Sign sandbox
   account, and its own webhook endpoints.
4. Point `App/.env.staging` at it.
5. Add a deploy job (`firebase deploy --project staging`), and repoint the PR
   preview channel at staging so previews stop touching production.
6. Seed it, either from `npm run seed` or a sanitized production export.

Until then, the emulators are the only safe place to exercise writes.

## Testing

Roughly 437 tests across four suites, all run by `npm run verify`. Every
callable is covered for authorization, five of the six triggers are covered,
and the emulator suites are mutation-tested.

Still uncovered, in rough priority order:

- **`onPaymentCreated`.** The last untested trigger. It creates waiver
  records from Stripe payment metadata and calls Dropbox Sign, so it needs
  fixtures for both.
- **Player rankings pipeline.** The TrueSkill maths is covered; the
  orchestration around it (game loading, round grouping, decay, persistence)
  is not.
- **Deeper callable behaviour.** The authorization sweep covers all 46;
  `createTeam`, `deleteTeam`, `updateTeamRoster` and `createOffer` have
  behavioural tests. The rest are covered only at the gate.
- **App components.** Only the shell is mounted. The admin screens carry the
  most complex state and have no tests.
- **End-to-end.** No test drives a browser against the emulators.

## Inconsistent error codes on offers

`createOffer` and `updateOffer` wrap `validateAuthentication` in a try/catch
and re-throw everything as `unauthenticated`, so a verified-but-unconfirmed
email surfaces with that code rather than the `permission-denied` every other
callable uses. The request is still rejected; only the code a client sees
differs, which means the UI cannot distinguish "log in" from "verify your
email". Current behaviour is pinned in
`tests/integration/callables-authorization.test.ts`.

## Name validation swallows its own transform

`nameSchema` rejects consecutive spaces in a refine that runs before the
transform which would have collapsed them, so that part of the transform is
unreachable. Either drop the dead branch or reorder so "josh kautz"
normalises to "Josh Kautz" instead of being rejected. Current behaviour is
pinned in `App/src/shared/utils/validation.test.ts`.

## Registration window enforcement

Reviewed and implemented; recorded here because the boundaries are easy to get
wrong when touching these functions.

| Function      | File                     | Behavior                                                         |
| ------------- | ------------------------ | ---------------------------------------------------------------- |
| Team create   | `create.ts`              | Allowed before registration opens, blocked after it ends         |
| Team rollover | `rollover.ts`            | Allowed before registration opens, blocked after it ends         |
| Team delete   | `delete.ts`              | Blocked after registration ends (previously: after season start) |
| Manage player | `managePlayer.ts`        | Blocked after registration ends (previously: after season start) |
| Create offer  | `offers/create.ts`       | Blocked after registration ends (previously: after season start) |
| Update offer  | `offers/updateStatus.ts` | Blocked after registration ends (previously: after season start) |

## Swiss-format season

Outstanding items carried over from the original plan — details and suggested
implementations are in `docs/historical/IMPROVEMENTS.md`:

- Teams with no games yet should appear in standings at their seeding rank.
  The backend `getInitialSeedingRank` already exists but is unused.
- Drag-and-drop seeding, replacing the current up/down arrow buttons.
- Visual indicator of the current round in the matchup pattern table.
- Optional: auto-generate round matchups from current Swiss rankings.
- Optional: head-to-head or Sonneborn-Berger as an additional tiebreaker.
