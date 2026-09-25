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
paid $1,000, in any split, replacing ten individual $100 payments.

Done: the transactional twelve-team cap, waivers on roster join, the
contribution ledger and its no-orphan guards, the registration rule, and
taking money (`createTeamContributionCheckout` plus the webhook), and the
whole settlement lifecycle: refunding any excess on registration, refunding
the teams that miss the twelve-team lock and those unregistered when
registration closes, refunding a payer who leaves, an admin refund, and a
daily reconciliation with Stripe; the team payment card
on My Team and the admin payments view, and cutover: 2026 Fall carries a
$1,000 total and the home page describes it. The twelve-team race was
rehearsed on the emulators on 24 September 2026
(`scripts/rehearse-registration-race.js`): fifteen simultaneous final
signatures registered exactly twelve teams. Left: one real admin
contribution before 1 October, refunded from the admin payments dialog, to
prove the live Stripe path.

Three decisions carry it:

- **Inline pricing**, so the server decides the amount rather than the payer.
  Stripe's pay-what-you-want feature cannot express "at most what this team
  still owes", and hands us the amount only after the money has moved.
- **Charge immediately, refund what is not kept.** Every contribution is
  charged when it is made. A card hold would have made refunds free, but a
  hold lasts a week on most cards against a month of registration, and
  extended holds cover only Visa and Mastercard for a league. So the league
  bears the processing fee on refunds, for one rule every payer can follow:
  you pay, and you get it back if your team does not play.
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

`npm audit` reports moderate advisories in two places, none reachable:

- **Dev tooling:** `uuid` via `gaxios`, and `@opentelemetry/core` via
  `@google-cloud/pubsub`, all under `firebase-tools`. It is a dev-only CLI,
  and npm's suggested "fix" is a downgrade from firebase-tools 15 to 14.23.0.
- **The deployed Functions:** `uuid` 9 via `gaxios` 6, which
  `@google-cloud/storage` (under `firebase-admin`) still pins. The advisory
  is a missing bounds check in uuid's v3, v5 and v6 when a caller passes a
  buffer; gaxios calls only `v4()`, with no buffer.

Recheck when firebase-tools or `@google-cloud/storage` move to gaxios 7.

## Seeder gaps

`scripts/seed.js` was migrated to the subcollection data model (teams,
teamSeasons, roster, playerSeasons) but three gaps remain:

- **No championship week.** `updateTeamPlacements` runs and finds no Week 7
  games, so every `teamSeasons.placement` stays `null`. The placement logic
  itself is intact; the game generator never produces the second playoff
  week it looks for.
- **No rankings.** The Players page reads the `rankings` collection, which is
  produced by the `rebuildPlayerRankings` admin callable rather than the
  seeder, so it is empty locally until that function is run.
- **No news, posts, Swiss-format seasons or rollover-eligible captains.** The
  pages that read them are covered by hook tests
  (`use-paginated-feed.test.ts`, `use-rollover-team-form.test.ts`) but cannot
  be tried by hand against seeded data.

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

About 1,370 tests across four suites, all run by `npm run verify`. Every callable is
covered for authorization, **every trigger** has a suite, and the emulator
suites are mutation-tested. The conventions that keep them worth having —
mutation testing, the emulator's missing batch limit, and pinning behaviour
that is deliberately not fixed — are in `CLAUDE.md`.

Still uncovered, in rough priority order:

- **Deeper callable behaviour.** The authorization sweep covers all 44.
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

## Team logo size

`createTeam` and `updateTeam` check that a logo is an image but not how large
it is, unlike the badge callables, which cap images at 5 MB. The only bound
is the callable's request size, so a large phone photo fails with an opaque
error instead of a message, and a logo can be far larger than it is ever
shown. Decide a limit, or resize in the browser before upload, and check it
on the server either way.

## Swiss-format season

Outstanding items carried over from the original plan — details and suggested
implementations are in `docs/historical/IMPROVEMENTS.md`:

- Teams with no games yet should appear in standings at their seeding rank.
  The backend `getInitialSeedingRank` already exists but is unused.
- Drag-and-drop seeding, replacing the current up/down arrow buttons.
- Visual indicator of the current round in the matchup pattern table.
- Optional: auto-generate round matchups from current Swiss rankings.
- Optional: head-to-head or Sonneborn-Berger as an additional tiebreaker.
