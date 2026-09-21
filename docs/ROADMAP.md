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
an error. It flags 23 existing call sites; the rule is currently demoted to a
warning in `App/eslint.config.js` so it does not gate CI.

Each site needs individual judgement — some are genuine cascading-render bugs,
others are deliberate synchronize-on-mount. Work through them and restore the
rule to `error`:

- `components/ui/carousel.tsx`, `shared/hooks/use-mobile.ts`
- `features/public/news/news.tsx`, `features/public/posts/posts.tsx`
- `features/public/create/hooks/use-rollover-team-form.ts`
- `features/admin/` — badge, news, offer, posts, season, site-settings, swiss
  and team management screens

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

## Testing

Done: Firestore rules tests (`tests/rules/`), `shared/auth.ts` validator tests
and webhook guard tests (`Functions/src/**/*.test.ts`). 41 tests total.

Still thin — the App has one smoke test and no callable has an end-to-end
test. In rough priority order:

- `onPaymentCreated` — waiver creation with metadata.
- `dropboxSignSendReminderEmail` — rate limiting, authorization.
- The remaining callables' authorization paths, especially captain-only
  actions on `teams/` and `offers/`.
- Component tests for the admin screens, which have none and carry the most
  complex state.
- End-to-end tests running against the emulator suite.

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
