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

## Team-level payment ($1,000 collective)

Live from 2026 Fall: `docs/TEAM_PAYMENTS.md`. A team registers
when it has ten signed players **and** its players have collectively
committed $1,000, in any split, replacing ten individual $100 payments.

Done: the transactional twelve-team cap, waivers on roster join, the
contribution ledger and its no-orphan guards, the registration rule, and
taking money (`createTeamContributionCheckout` plus the webhook), and the
whole settlement lifecycle: capture on registration, release on the
twelve-team lock and when registration closes, capture before expiry, an
admin release, and a daily reconciliation with Stripe; the team payment card
on My Team and the admin payments view, and cutover: 2026 Fall carries a
$1,000 total and the home page describes it. The twelve-team race was
rehearsed on the emulators on 24 September 2026
(`scripts/rehearse-registration-race.js`): fifteen simultaneous final
signatures registered exactly twelve teams. Left: one real contribution on
1 October, released from the admin payments dialog, to prove the live Stripe
path.

Three decisions carry it:

- **Inline pricing**, so the server decides the amount rather than the payer.
  Stripe's pay-what-you-want feature cannot express "at most what this team
  still owes", and hands us the amount only after the money has moved.
- **Manual capture on every contribution.** Money is held, never taken, until
  the team is going to play. Cancelling a hold is free where a refund never
  returns the processing fee, and it makes the concurrent-overpayment race
  free to resolve too. A hold is never allowed to lapse — it is captured
  shortly before the 7-day authorization would expire, so nobody is ever
  asked to pay again.
- **Waivers are the player's own step**, not tied to paying — otherwise a
  team whose captain pays for everyone can never reach ten signed players.
  Done: players sign in the app (`docs/WAIVERS.md`).

Also retires the per-player returning discount, which does not map onto a team
total.

## Waivers

Signed in the app since 2026 Fall: `docs/WAIVERS.md`. Left:

- **Emergency contacts for game day.** They are collected with each waiver
  but only visible one player at a time; organizers would want them by team.
- **A copy by email.** Players can print or save their copy; emailing one
  needs an email provider the project does not have.
- **Captains reminding teammates** who have not signed.
- **How long to keep signatures.** They outlive a deleted account and are
  kept indefinitely until the attorney says how long they must be; for a
  minor the clock starts at eighteen. Then either a scheduled deletion or a
  written policy.

### Waiver review

The league's attorney reviewed the waiver and the in-app signing in September
2026 and found both sufficient as they stand. One promise in the text is
operational rather than technical: a banned player is owed written notice
with the reasons, and the app's ban sends none, so an admin sends it.

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

Resolved: Firestore holds 17 composite indexes and `firestore.indexes.json`
declares the same 17. `scripts/production/prune-firestore-indexes.js` derives
the difference and deletes anything present only in Firestore; run
`--mode=plan` after any index change to confirm the file is still the truth.

It can drift again, because CI deploys indexes without `--force` and so never
deletes. That is deliberate — an accidental deletion breaks live queries —
but it means removals have to be made on purpose with that script.

**The emulator does not enforce composite indexes**, so a query that needs a
missing one passes locally and fails only in production. Neither the test
suites nor local development will catch it.

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
3. Give it its own secrets — Stripe **test** keys — and its own webhook
   endpoint.
4. Point `App/.env.staging` at it.
5. Add a deploy job (`firebase deploy --project staging`), and repoint the PR
   preview channel at staging so previews stop touching production.
6. Seed it, either from `npm run seed` or a sanitized production export.

Until then, the emulators are the only safe place to exercise writes.

## Testing

About 1,250 tests across four suites, all run by `npm run verify`. Every callable is
covered for authorization, **every trigger** has a suite, and the emulator
suites are mutation-tested. The conventions that keep them worth having —
mutation testing, the emulator's missing batch limit, and pinning behaviour
that is deliberately not fixed — are in `CLAUDE.md`.

Still uncovered, in rough priority order:

- **Deeper callable behaviour.** The authorization sweep covers all 46.
  `createTeam`, `deleteTeam`, `updateTeamRoster`, `createOffer`, `mergeTeams`,
  `updatePlayerAdmin`, `rolloverTeam` and the three game callables have
  behavioural tests. The rest are covered only at the gate; `deletePlayer`,
  `updateTeamRoster`'s admin counterpart and the badge callables are the next
  most consequential.
- **App components.** Only the shell is mounted. The admin screens carry the
  most complex state and have no tests.
- **End-to-end.** No test drives a browser against the emulators.
- **App-to-callable payloads.** Nothing checks what a wrapper in
  `App/src/firebase/collections/functions.ts` sends against the request type
  the callable reads; the two are declared separately. `deleteTeam` gained a
  required `seasonId` and the App kept sending only `teamId`, so a captain's
  Delete team failed every time until it was caught by hand
  (`use-manage-captain-actions.test.ts` now pins it). Sharing the request
  types between the workspaces would make the compiler catch the next one.

### Writing trigger tests

Triggers are invoked with `.run(event)` and a synthetic event carrying
`{ params, data: { before, after } }`. Two things are worth keeping:

- Every trigger suite covers the **migration kill-switch**. While
  `system/maintenance.migrationInProgress` is set, a trigger must
  early-return without writing.
- Mutation-test new suites. The payment trigger's already-paid
  short-circuit initially passed with the guard removed, because the
  waiver-exists check masked it — the gap only showed under mutation.

## One player name still needs a human decision

`players/SzxvT9AJsuhgkDORAhDD1hC4VQY2` has the firstname
`Hayden “Slotz”` — a nickname in quote marks, stored before names were
validated anywhere. Quote marks are not letters, so it fails validation.

Nothing is broken by it: the name renders, and updating their _last_ name
alone still works. But saving their first name from the profile form or the
admin editor will be refused until it is corrected, most likely to `Hayden`.

Left alone deliberately — dropping someone's nickname is their call, not a
migration's. Fix it from the admin player editor.

## Name validation duplicates the App's rules

`Functions/src/shared/names.ts` and `App/src/shared/utils/validation.ts`
enforce the same rules on player names, deliberately duplicated the way
`types.ts` is: the workspaces build against different SDKs and neither imports
from the other. **Change them together** — including
`REAL_NAMES_WRONGLY_FLAGGED`, which appears in both.

The Functions copy is the control; the App's exists so the reader sees the
error inline rather than after submitting.

### The profanity blocklist and real names

`bad-words` ships a 896-word list that includes Cox, Wang, Butt, Schaffer,
Dick, Dyke, Kuntz, Hoare, Gaylord, Fanny, Schmuck and Lipshitz — all real
surnames. Cox is a top-1000 US surname and Wang is one of the most common in
the world, so before this was corrected the sign-up form refused to let either
register.

`REAL_NAMES_WRONGLY_FLAGGED` removes them. The criterion is: an established
given name or surname whose word is not primarily a slur against a group.
Entries that are principally slurs stay blocked even where they also occur as
surnames.

This cannot be complete — surnames are not enumerable, and someone will
eventually hit a word still on the list. Two things cover that:

- The error tells them to contact the league rather than just refusing.
- **Admin edits skip the profanity check entirely.** `updatePlayerAdmin`
  passes `checkProfanity: false`, so an organizer can always set a name the
  filter refuses. The structural rules still apply.

If a real name is reported as blocked, add it to the list in **both** files.

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
