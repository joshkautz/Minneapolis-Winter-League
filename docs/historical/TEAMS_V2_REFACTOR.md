# 2026 Teams + Players Data Model Refactor — Resumption Roadmap

**Last updated**: All code gates pass. Ready for emulator smoke testing and
production cutover.

## Seasons subcollection rename (pre-cutover cleanup)

The per-team and per-player season subcollections were both originally
named `seasons`, which made `collectionGroup('seasons')` queries ambiguous
and forced every caller to filter on `doc.ref.parent.parent?.parent.id`.
They have been renamed to disambiguate:

- `teams/{teamId}/seasons/{seasonId}` → `teams/{teamId}/teamSeasons/{seasonId}`
- `players/{uid}/seasons/{seasonId}` → `players/{uid}/playerSeasons/{seasonId}`

The roster subcollection (`teams/{id}/teamSeasons/{sid}/roster/{playerId}`)
keeps its name. Both `collectionGroup('teamSeasons')` and
`collectionGroup('playerSeasons')` queries are now unambiguous and the
parent-path disambiguation filters have been removed from callers.

New helpers live next to the collection helpers and should be used in
place of `doc.ref.parent.parent` at every call site:

- `canonicalTeamIdFromTeamSeasonDoc`,
  `canonicalTeamRefFromTeamSeasonDoc`
- `canonicalPlayerIdFromPlayerSeasonDoc`,
  `canonicalPlayerRefFromPlayerSeasonDoc`

Mirrors exist in both `App/src/firebase/collections/{teams,players}.ts`
and `Functions/src/shared/database.ts`. Constants
`PLAYER_SEASONS_SUBCOLLECTION` and `TEAM_SEASONS_SUBCOLLECTION` live in
both `App/src/types.ts` and `Functions/src/types.ts` for places that need
the raw string.

The follow-ups below (captain N+1 lookup, teams.tsx player-count walk,
team-history subtitle) are unchanged by this rename.

## Quick start for next session

```bash
cd /Users/josh/Projects/joshkautz/Minneapolis-Winter-League
npm install                                       # ensures TS 6.0.2 is hoisted
npx tsc --noEmit -p Functions/tsconfig.json       # CLEAN
npx tsc --noEmit -p App/tsconfig.json             # CLEAN
npm run lint:check                                # CLEAN (0 warnings)
npm run format:check                              # CLEAN
npm run build                                     # CLEAN
```

## Status

- ✅ **Migration script** done and verified on an emulator clone of production
  (commit `2c22f8fb`).
- ✅ **Functions workspace** refactored, typechecks and builds clean.
- ✅ **App workspace** refactored, typechecks, lints, formats, and builds
  clean.

## Known follow-ups (work but suboptimal)

- ~~`team-edit-dialog.tsx` captain lookup is N+1~~ — fixed (single
  collectionGroup `playerSeasons` query on team+captain).
- ~~`public/teams/teams.tsx` registered-player-count walks per team~~ —
  fixed (single collectionGroup `playerSeasons` query on
  season+paid+signed).
- ~~`team-history.tsx` header subtitle hardcoded~~ — fixed (pulls latest
  team season name from existing `historyQuerySnapshot`).

### Pre-cutover index deploy requirement

A new collection-group index was added to `firestore.indexes.json` for the
captain lookup fix:

- `playerSeasons` (COLLECTION_GROUP): `(team ASC, captain ASC)`

This index MUST be deployed (`firebase deploy --only firestore:indexes`)
BEFORE the new App code goes live, otherwise the team-edit-dialog will
throw a missing-index error on open.

## Next: cutover sequence

See "Cutover sequence" near the bottom of this file.

## Target shape (final, locked)

```
players/{uid}                            ← canonical player identity
  admin, email, firstname, lastname, createdAt
  /seasons/{seasonId}                    ← per-season subcollection
    season, team(canonical|null), paid, signed, banned, captain

teams/{teamId}                           ← canonical team identity (minimal anchor)
  createdAt, createdBy
  /seasons/{seasonId}                    ← per-season subcollection
    season, name, logo, storagePath,
    registered, registeredDate, placement, swissSeed?
    /roster/{playerId}                   ← pure membership join
      player, dateJoined
  /badges/{badgeId}                      ← cross-season badges
    badge, awardedAt, awardedBy, seasonId(denormalized)
```

Single source of truth for **captain, paid, signed, banned**: the player
season subdoc. The team's roster subcollection carries only `player` +
`dateJoined`.

## Done

### Layer 1: types + helpers
- `Functions/src/types.ts` + `App/src/types.ts` (new shapes)
- `App/src/shared/utils/interfaces.ts` (re-exports updated)
- `Functions/src/shared/database.ts` (helpers: `teamRef`, `teamSeasonRef`,
  `teamRosterEntryRef`, `teamBadgeRef`, `playerRef`, `playerSeasonRef`,
  `getPlayerSeason`, `getTeamSeason`)
- `Functions/src/shared/auth.ts` (`validateNotBanned` / `isPlayerBanned` async)

### Layer 2: services
- `Functions/src/services/teamRegistrationService.ts`
- `Functions/src/services/teamDeletionService.ts` (now
  `deleteTeamSeasonWithCleanup`)

### Layer 3: Functions callables
- `user/teams/{create,rollover,update,updateRoster,delete}.ts`
- `user/offers/{create,update}.ts`
- `user/players/{create,update,delete}.ts`
- `user/payments/createStripeCheckout.ts` (also fixed Stripe v22 type import)
- `user/posts/{createPost,createReply}.ts` (validateNotBanned only)
- `user/waivers/sendReminder.ts` (validateNotBanned only)
- `admin/teams/updateTeamAdmin.ts` (linkToTeamId removed)
- `admin/teams/deleteUnregisteredTeam.ts`
- `admin/players/updatePlayerAdmin.ts` (per-subdoc writes)
- `admin/seasons/{create,update,delete}.ts` (drops teams[] array)
- `admin/games/create.ts` (validates team season subdoc)
- `admin/badges/{awardBadge,revokeBadge}.ts` (drops teamId walk)
- `admin/swiss/{setSeeding,getRankings}.ts` (per-team-season seed)
- `admin/waivers/sendWaiverAdmin.ts`

### Layer 4: triggers + webhooks
- `triggers/documents/teamUpdated.ts` (now subscribes to roster subcollection)
- `triggers/documents/teamRegistrationLock.ts` (subscribes to team season subdoc)
- `triggers/documents/playerUpdated.ts` (subscribes to player season subdoc)
- `triggers/documents/offerUpdated.ts` (writes roster + player season)
- `triggers/auth/userDeleted.ts` (collection-group roster cleanup)
- `triggers/payments/paymentCreated.ts` (writes player season subdoc)
- `api/webhooks/dropboxSign.ts` (writes player season subdoc)

### Layer 5: config
- `firestore.rules` (adds /seasons + /roster + /player seasons rules)
- `firestore.indexes.json` (adds collection-group indexes for new shape;
  drops legacy team composite indexes)

### Layer 6: App firebase + providers + shared
- `App/src/firebase/collections/teams.ts` (full rewrite)
- `App/src/firebase/collections/players.ts` (gains player season helpers)
- `App/src/providers/teams-context.tsx` (collection-group based)
- `App/src/providers/auth-context.tsx` (exposes
  `authenticatedUserSeasonsSnapshot`)
- `App/src/shared/utils/season-utils.ts` (consume QuerySnapshot)
- `App/src/shared/hooks/use-user-status.ts`
- `App/src/shared/hooks/use-top-navigation.ts`

### Layer 7: App pages (partial — only the player-profile and team-profile/roster paths)
- `App/src/features/player/profile/{profile,profile-actions,payment-section}.tsx`
- `App/src/features/public/teams/team-profile/team-roster-player.tsx`

### Migration script
`scripts/migrations/2026-teams-v2/run.js` — production-ready, all 5 modes
implemented and verified end-to-end on emulator.

## Resumption — App remaining work (~160 type errors)

The Functions workspace and the migration script are entirely done. Resume
the App refactor by running `cd /Users/josh/Projects/joshkautz/Minneapolis-Winter-League && npx tsc --noEmit -p App/tsconfig.json`
and fixing the listed errors. The remaining work is mostly mechanical
field renames and snapshot type adjustments.

### Common rename patterns to apply

- `team.data().roster` (array on flat team doc) →
  `useCollection(teamRosterSubcollection(teamId, seasonId))` returning
  `QuerySnapshot<TeamRosterDocument>`
- `team.data().name` and `team.data().logo` and `team.data().registered`
  and `team.data().placement` — these now live on the team's season subdoc.
  For "current season", load `teamSeasonRef(teamId, currentSeasonId)`.
- `playerData.seasons.find((s) => s.season.id === seasonId)` →
  `useDocument(playerSeasonRef(playerId, seasonId))` returning the
  `PlayerSeasonDocument` directly.
- `currentSeasonTeamsQuery(seasonSnapshot)` → `teamsInSeasonQuery(seasonSnapshot?.ref)`
- `teamsBySeasonQuery(seasonRef)` → `teamsInSeasonQuery(seasonRef)`
- `teamsHistoryQuery(teamId)` → `teamSeasonsQuery(teamId)`
- `currentSeasonTeamsQuery` import → drop, use the providers context's
  `currentSeasonTeamsQuerySnapshot` (now `QuerySnapshot<TeamSeasonDocument>`)
- For team-profile pages, the URL should now address canonical id; the
  team-profile component should load both `getTeamRef(id)` (for canonical
  doc) AND `teamSeasonRef(id, currentSeasonId)` for renderable fields.

### App files that need updating (from current typecheck errors)

#### admin pages
- `App/src/features/admin/team-management/team-management.tsx` — biggest
  single file. The legacy code maps over a flat `teams` collection with
  `{ id, ref, ...TeamDocument }` shape; needs to switch to
  `teamsInSeasonQuery` returning `TeamSeasonDocument` and walk
  `doc.ref.parent.parent.id` for the canonical team id.
- `App/src/features/admin/team-management/components/team-edit-dialog.tsx`
  — drop `linkToTeamId` UI; the file already imports a non-existent
  `TeamRosterPlayer` type.
- `App/src/features/admin/team-management/components/team-badges-dialog.tsx`
  — should be straightforward, only the team ref shape changes.
- `App/src/features/admin/player-management/player-management.tsx` —
  iterates the player's seasons array; needs to switch to subcollection.
  The form's `SeasonFormData` is fine but the seasons list comes from a
  different source now. Note: the inner `SeasonCard` component was
  recently updated for karma removal — its team ref handling needs the
  new canonical-team-id treatment.
- `App/src/features/admin/season-management/season-management.tsx`
- `App/src/features/admin/swiss-rankings/swiss-rankings.tsx`
- `App/src/features/admin/game-management/game-management.tsx`
- `App/src/features/admin/registration-management/registration-management.tsx`

#### player pages
- `App/src/features/player/team/manage-team-detail.tsx`
- `App/src/features/player/team/manage-team-roster-card.tsx`
- `App/src/features/player/team/manage-team-roster-player.tsx`
- `App/src/features/player/team/manage-team-request-card.tsx`
- `App/src/features/player/team/manage-invite-player-*.tsx`
- `App/src/features/player/team/manage-captains-offers-panel.tsx`
- `App/src/features/player/team/manage-non-captains-offers-panel.tsx`
- `App/src/features/player/team/manage-captain-actions.tsx`
- `App/src/features/player/team/manage-non-captain-actions.tsx`
- `App/src/features/player/team/manage-edit-team-dialog.tsx`
- `App/src/features/player/team/manage-edit-team-form.tsx`
- `App/src/features/player/team/components/team-management-view.tsx`
- `App/src/features/player/team/components/team-options-view.tsx`
- `App/src/features/player/team/hooks/use-team-management.ts`
- `App/src/features/player/team/hooks/use-manage-captain-actions.ts`
- `App/src/features/player/team/hooks/use-manage-edit-team-form.ts`

#### public pages
- `App/src/features/public/teams/teams.tsx`
- `App/src/features/public/teams/team-card.tsx`
- `App/src/features/public/teams/team-profile/team-profile.tsx` (largest
  single team-profile change — needs to load canonical + current season
  subdoc)
- `App/src/features/public/teams/team-profile/team-history.tsx`
- `App/src/features/public/standings/*` (use `teamsInSeasonQuery`)
- `App/src/features/public/schedule/schedule-card.tsx` and related
- `App/src/features/public/rankings/player-ranking-history.tsx`
- `App/src/features/public/create/rollover-team-form.tsx` + hooks
- `App/src/features/public/create/hooks/use-create-team-form.ts`
- `App/src/features/public/create/hooks/use-team-creation.ts`

#### shared hooks not yet touched
- `App/src/shared/hooks/use-standings.ts`
- `App/src/shared/hooks/use-swiss-standings.ts`
- `App/src/shared/hooks/use-monrad-pairings.ts`
- `App/src/shared/hooks/use-offer.ts`
- `App/src/shared/hooks/use-account-section.ts`
- `App/src/shared/hooks/use-schedule-data.ts`

### Verification gate

After all the App files are converted, run:

```bash
cd /Users/josh/Projects/joshkautz/Minneapolis-Winter-League
npx tsc --noEmit -p App/tsconfig.json   # must be clean
npm run lint:check                      # must pass
npm run format:check                    # must pass
npm run build                           # both workspaces must build
```

## (Below: original Functions roadmap, kept for reference but completed)

## Resumption: Functions remaining (sorted by typecheck error count)

Run `cd Functions && npx tsc --noEmit` after each layer to gate progress.

### Layer A — call sites of helpers that already changed signatures

Every caller of `validateNotBanned` and `isPlayerBanned` needs `await` and the
new signature `(firestore, playerId, seasonId)`. Today they pass
`(playerData, seasonId)`.

- `Functions/src/functions/user/payments/createStripeCheckout.ts`
- `Functions/src/functions/user/posts/createPost.ts`
- `Functions/src/functions/user/posts/createReply.ts`
- `Functions/src/functions/user/waivers/sendReminder.ts`
- `Functions/src/functions/user/offers/create.ts`
- `Functions/src/functions/user/offers/update.ts`

Every caller of `deleteTeamWithCleanup` needs to call
`deleteTeamSeasonWithCleanup(firestore, teamId, seasonId)` instead.

- `Functions/src/functions/admin/teams/deleteUnregisteredTeam.ts`

### Layer B — user offers + posts + payments + waivers

These need to switch from `playerData.seasons[].find(...)` to
`getPlayerSeason(firestore, playerId, seasonId)`, and offer mutation paths
(roster array writes) become subcollection writes via the new helpers.

- `Functions/src/functions/user/offers/create.ts` — verify the requesting
  player isn't already on a team for the season; validate target team has a
  season subdoc; create the offer (no roster mutation here, that happens in
  `offerUpdated` trigger).
- `Functions/src/functions/user/offers/update.ts` — same shape changes.
- `Functions/src/functions/user/payments/createStripeCheckout.ts` — read
  `players/{uid}/seasons/{currentSeasonId}.paid` to decide if checkout is
  needed.
- `Functions/src/functions/user/posts/createPost.ts` — only the
  `validateNotBanned` call needs updating.
- `Functions/src/functions/user/posts/createReply.ts` — same.
- `Functions/src/functions/user/posts/updatePost.ts`,
  `updateReply.ts`, `deletePost.ts`, `deleteReply.ts` — should be no-ops
  shape-wise; verify no team/player.seasons references.
- `Functions/src/functions/user/waivers/sendReminder.ts` — only
  `validateNotBanned`.

### Layer C — user players

- `Functions/src/functions/user/players/create.ts` — already drops the
  `seasons[]` array build (committed separately during karma removal). Verify
  it now writes per-season subdocs instead. **Look at how it currently builds
  `playerSeasons` array and transform to writing
  `players/{uid}/seasons/{seasonId}` subdocs in the same transaction.**
- `Functions/src/functions/user/players/update.ts` — straightforward.
- `Functions/src/functions/user/players/delete.ts` — must walk the player's
  seasons subcollection AND walk
  `collectionGroup('roster').where('player', '==', playerRef)` to find every
  team membership and clean those up.

### Layer D — admin teams

- `Functions/src/functions/admin/teams/updateTeamAdmin.ts` — **drop the
  entire `linkToTeamId` code path**. Drop dual-write captain logic. Roster
  mutations: write `teams/{id}/seasons/{sid}/roster/{pid}` for adds, delete
  for removes; update `players/{pid}/seasons/{sid}.team` and `.captain` in
  the same transaction. Field edits land on `teams/{id}/seasons/{sid}`.
- `Functions/src/functions/admin/teams/deleteUnregisteredTeam.ts` — point at
  `deleteTeamSeasonWithCleanup`.

### Layer E — admin players

- `Functions/src/functions/admin/players/updatePlayerAdmin.ts` — single biggest
  Functions file. The `seasons[]` array rebuild becomes per-subdoc updates.
  Each `SeasonUpdate` translates to one `players/{uid}/seasons/{sid}` update.
  Team-change branch writes the new roster entry + clears the old one + flips
  the player's `team`/`captain`.
- `Functions/src/functions/admin/players/getPlayerAuthInfo.ts` — verify no
  shape references.
- `Functions/src/functions/admin/players/updatePlayerEmail.ts` — verify no
  shape references.

### Layer F — admin seasons

- `Functions/src/functions/admin/seasons/create.ts` — drop the
  `seasons/{id}.teams[]` array maintenance. New player seasons get written as
  `players/{uid}/seasons/{newSeasonId}` subdocs (one per existing player).
- `Functions/src/functions/admin/seasons/update.ts` — drop teams[] maintenance.
- `Functions/src/functions/admin/seasons/delete.ts` — same.
- `Functions/src/functions/admin/seasons/initializePlayerSeasons.ts` — write
  per-subdoc rather than rebuilding the array.

### Layer G — admin games

- `Functions/src/functions/admin/games/create.ts` — `home`/`away` are canonical
  refs. Validation: `teamRef.collection('seasons').doc(seasonRef.id).get().exists`.
- `Functions/src/functions/admin/games/update.ts` — same.
- `Functions/src/functions/admin/games/delete.ts` — verify no shape refs.

### Layer H — admin badges

- `Functions/src/functions/admin/badges/awardBadge.ts` — **delete the
  `teamsWithSameTeamId` walk entirely**. Replace with single transaction:
  read badge doc + team doc + team badge subdoc; if team badge subdoc exists →
  already-exists; otherwise write the team badge subdoc with denormalized
  `seasonId` and `FieldValue.increment(1)` on `badge.stats.totalTeamsAwarded`.
- `Functions/src/functions/admin/badges/revokeBadge.ts` — mirror simplification.
- `Functions/src/functions/admin/badges/create.ts`, `update.ts` — no shape
  changes expected.
- `Functions/src/functions/admin/badges/delete.ts` — uses
  `collectionGroup('badges').where('badge', '==', badgeRef)`, already correct.

### Layer I — admin swiss

- `Functions/src/functions/admin/swiss/setSeeding.ts` — move from
  `seasons/{id}.swissInitialSeeding[]` array to per-team-season
  `teams/{id}/seasons/{sid}.swissSeed: number` field.
- `Functions/src/functions/admin/swiss/getRankings.ts` — read
  `swissSeed` from team season subdocs.

### Layer J — triggers

- `Functions/src/triggers/documents/teamUpdated.ts` — rename to
  `teamSeasonRosterUpdated.ts` (or keep filename, change trigger). Trigger
  pattern moves to `teams/{teamId}/seasons/{seasonId}/roster/{playerId}`.
  Calls `updateTeamRegistrationStatus(teamId, seasonId)`.
- `Functions/src/triggers/documents/teamRegistrationLock.ts` — pattern moves
  to `teams/{teamId}/seasons/{seasonId}` listening for `registered: false → true`.
  The "count registered teams in current season" query becomes
  `collectionGroup('seasons').where('season','==',seasonRef).where('registered','==',true)`.
  The "delete unregistered teams" query becomes the same shape with `==false`,
  and the result feeds `deleteUnregisteredTeamsForSeasonLock` as
  `Array<{teamId, seasonId}>`.
- `Functions/src/triggers/documents/playerUpdated.ts` — pattern moves to
  `players/{uid}/seasons/{seasonId}`. Reads the team ref from the doc and
  recomputes the team's registration via `updateTeamRegistrationStatus`.
- `Functions/src/triggers/documents/offerUpdated.ts` — when an offer is
  accepted, write the team roster entry + update the player's season subdoc
  in one transaction. The "team is full" / "player already on team" checks
  read subdocs.
- `Functions/src/triggers/auth/userDeleted.ts` — walk
  `players/{uid}/seasons/*` to find every team ref; for each, delete the
  corresponding `teams/{teamId}/seasons/{seasonId}/roster/{uid}` entry. Then
  recursive-delete the player's seasons subcollection. Then delete the player
  doc + offers.
- `Functions/src/triggers/payments/paymentCreated.ts` — write
  `players/{uid}/seasons/{seasonId}.paid = true` directly. No more array
  rebuild.

### Layer K — webhooks

- `Functions/src/api/webhooks/dropboxSign.ts` — write
  `players/{uid}/seasons/{seasonId}.signed = true` directly. The current
  array-walking code is the cause of the `season: any` errors.
- `Functions/src/api/webhooks/stripe.ts` — verify no shape references (the
  customer/checkout flow is unchanged by this refactor).

### Layer L — services

- `Functions/src/services/swissRankings/calculator.ts` and `types.ts` — verify
  team refs are consumed as canonical.
- `Functions/src/services/playerRankings/*` — same.

### Layer M — config

- `firestore.rules` — add `match /teams/{teamId}/seasons/{seasonId}` and
  `/seasons/{seasonId}/roster/{playerId}` and
  `/players/{uid}/seasons/{seasonId}` rules (all read-true, write-false).
- `firestore.indexes.json` — add collection-group indexes:
  - `seasons` (collection group, on team side): `(season ASC, registered ASC)`,
    `(season ASC)` declared explicitly
  - `seasons` (collection group, on player side): `(season ASC, paid ASC, signed ASC)`
  - `roster` (collection group): `player ASC` (for the userDeleted cleanup)
  - `badges` (collection group): `seasonId` field override
  - `offers`: `(team ASC, season ASC, status ASC)`
  Drop:
  - `teams.(teamId, season)`
  - any other indexes that mention dropped fields

## Resumption: App workspace

After Functions compiles, switch to App.

### Layer N — App firebase/collections

- `App/src/firebase/collections/teams.ts` — rewrite as documented in the plan
  message:
  ```ts
  getTeamRef(teamId): DocumentReference<TeamDocument>
  allTeamsQuery(): Query<TeamDocument>                          // canonical
  teamSeasonRef(teamId, seasonId): DocumentReference<TeamSeasonDocument>
  teamSeasonsQuery(teamId): Query<TeamSeasonDocument>
  teamsInSeasonQuery(seasonRef): Query<TeamSeasonDocument>      // collectionGroup
  teamRosterRef(teamId, seasonId, playerId): DocumentReference<TeamRosterDocument>
  teamRosterSubcollection(teamId, seasonId): CollectionReference<TeamRosterDocument>
  ```
  Delete `teamsHistoryQuery`, `currentSeasonTeamsQuery`, `teamsBySeasonQuery`
  in their current form.
- `App/src/firebase/collections/players.ts` — gain `playerSeasonRef`,
  `playerSeasonsSubcollection`, `playerSeasonsInSeasonQuery`.
- `App/src/firebase/collections/games.ts` — verify canonical refs.
- `App/src/firebase/collections/offers.ts` — verify canonical refs.
- `App/src/firebase/collections/badges.ts` — already a subcollection;
  no shape change.

### Layer O — App providers

- `App/src/providers/teams-context.tsx` — expose
  `currentSeasonTeamSeasonsQuerySnapshot: QuerySnapshot<TeamSeasonDocument>`
  (each doc's `ref.parent.parent.id` is the canonical team id).
- `App/src/providers/auth-context.tsx` — load the player's season subdoc for
  the current season alongside the player parent doc.
- `App/src/providers/offers-context.tsx` — verify no shape changes.

### Layer P — App shared utils + hooks

- `App/src/shared/utils/player-utils.ts` (or wherever
  `isPlayerCaptainForSeason`/`isPlayerPaidForSeason`/`isPlayerSignedForSeason`
  live): change shape from "walk player.seasons[]" to "take a
  PlayerSeasonDocument". Or remove and inline.
- `App/src/shared/hooks/use-account-section.ts`,
  `use-top-navigation.ts`, `use-user-status.ts` — read player season subdoc
  via the new collection helper.
- `App/src/shared/hooks/use-standings.ts`, `use-swiss-standings.ts`,
  `use-monrad-pairings.ts` — build `Map<teamId, teamSeasonData>` from
  `teamsInSeasonQuery`.
- New: `App/src/shared/hooks/use-team-map.ts` (IMPROVEMENTS.md #3)
- New: `App/src/shared/hooks/use-current-team-season.ts`
- New: `App/src/shared/components/team-logo.tsx` (IMPROVEMENTS.md #1)
- New: `App/src/shared/utils/team-styling.ts` exporting
  `getPointDifferentialColor` (IMPROVEMENTS.md #2)

### Layer Q — App public pages

- `App/src/features/public/teams/teams.tsx` + `team-card.tsx` — iterate
  collection-group team season query.
- `App/src/features/public/teams/team-profile/team-profile.tsx` — load
  `(canonicalTeam, currentTeamSeasonSubdoc, rosterSubcollection)` and join
  for display. Roster section: query subcollection + load each player's
  doc and the matching player season subdoc.
- `App/src/features/public/teams/team-profile/team-history.tsx` — iterate
  `teamSeasonsQuery`.
- `App/src/features/public/teams/team-profile/team-roster-player.tsx` —
  read player season subdoc for paid/signed/captain.
- `App/src/features/public/standings/*` — already gets the Safari fix;
  the data source change is the only update.
- `App/src/features/public/schedule/*` — load team data from team season
  subdocs.
- `App/src/features/public/rankings/*` — canonical team refs from games.
- `App/src/features/public/create/rollover-team-form.tsx` + hooks — list
  the user's "canonical teams they were ever a captain of" by walking
  the player's seasons subcollection.

### Layer R — App player pages

- `App/src/features/player/profile/*` — read player season status from
  subcollection.
- `App/src/features/player/team/manage-team-detail.tsx` and ~10 sibling files
  + `hooks/` — replace `teamDoc.data().roster` with roster subcollection
  query joined with player + player season subdocs.

### Layer S — App admin pages

- `App/src/features/admin/team-management/*` — drop `linkToTeamId` UI
  control entirely. Table rows source from `teamsInSeasonQuery`.
- `App/src/features/admin/player-management/player-management.tsx` —
  `SeasonCard` component iterates the player's seasons subcollection.
  Each save writes one subdoc per changed season.
- `App/src/features/admin/swiss-rankings/*`, `game-management/*`,
  `offer-management/*`, `season-management/*`,
  `registration-management/*`, `email-verification/*` — update for new
  shapes as needed.

### Layer T — final pass

- `cd /Users/josh/Projects/joshkautz/Minneapolis-Winter-League && npm run build` — must complete clean
- `npm run lint:check` — must pass
- `npm run format:check` — must pass

## Cutover sequence (when code is compiling and ready)

The kill-switch flag at `system/maintenance.migrationInProgress` makes
every Firestore trigger no-op while the migration writes to canonical
collections. Always flip it on before `--mode=migrate` and off after the
final `--mode=validate`.

Note: the new collection-group indexes must be live BEFORE the migration
runs in production, otherwise validation queries against the new shape
will error with missing-index. Deploy indexes first, wait for the build,
then run the migration.

### Emulator dry run

1. Refresh local emulator data from production: `npm run data:refresh`
2. Flip the kill switch on:
   ```
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/set-maintenance.js on
   ```
3. Run migrate → validate → cutover → validate against the emulator:
   ```
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/run.js --mode=migrate --commit
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/run.js --mode=validate
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/run.js --mode=cutover --commit
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/run.js --mode=validate
   ```
4. Flip the kill switch off:
   ```
   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=minnesota-winter-league \
     node scripts/migrations/2026-teams-v2/set-maintenance.js off
   ```
5. Smoke test the dev app (`npm run dev`) — login, view standings, view a
   team profile, create a team, accept an offer, award a badge, edit a
   player as admin

### Production cutover

6. Take a Firestore export of production to GCS as the rollback snapshot
   (`gcloud firestore export gs://...`)
7. Deploy the new collection-group indexes and WAIT for the build to
   complete:
   ```
   firebase deploy --only firestore:indexes
   ```
8. Flip the kill switch on (production, no emulator host):
   ```
   node scripts/migrations/2026-teams-v2/set-maintenance.js on
   ```
9. Run migrate → validate → cutover → validate against production:
   ```
   node scripts/migrations/2026-teams-v2/run.js --mode=plan
   node scripts/migrations/2026-teams-v2/run.js --mode=migrate --commit
   node scripts/migrations/2026-teams-v2/run.js --mode=validate
   node scripts/migrations/2026-teams-v2/run.js --mode=cutover --commit
   node scripts/migrations/2026-teams-v2/run.js --mode=validate
   ```
10. Flip the kill switch off:
    ```
    node scripts/migrations/2026-teams-v2/set-maintenance.js off
    ```
11. Deploy the new Functions + App + rules:
    ```
    npm run deploy
    ```
12. Smoke test in production

## Notes from the discovery

- The migration script identified **4 players** whose `captain` field on
  their player document is a `DocumentReference` instead of a boolean
  (historical write bug). The script now correctly normalizes captain status
  from the team-side roster (which is consistently boolean). After cutover,
  these 4 entries will be cleanly captured as `captain: false` if they
  shouldn't have been captains.
- 27 canonical teams will replace 48 instance docs (≈44% have multi-season
  history)
- 1,765 player season subdocs will replace 596 player array entries
- 22 badges to migrate, zero dedup needed
- 312 games and 675 offers to rewrite team refs
