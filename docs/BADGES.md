# Badges

Teams earn badges for what they do: winning a championship, beating the
standings leader, registering first. Every badge is awarded automatically by
a rule over the league's data; nobody awards one by hand, and a team can earn
the same badge again in a later season.

## Where things live

| Piece                                      | What it is                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `Functions/src/badges/catalog.ts`          | Every badge: id, name, description, tier, and the thresholds the rules use         |
| `Functions/src/services/badges/rules.ts`   | One pure rule per badge, over the league's data                                    |
| `Functions/src/services/badges/facts.ts`   | Reads the data the rules need                                                      |
| `Functions/src/services/badges/rebuild.ts` | Makes the stored awards match the rules                                            |
| `scripts/badge-art/`                       | Draws every badge's artwork with GIMP                                              |
| `App/public/badges/<id>.webp`              | The artwork the site serves                                                        |
| `App/src/shared/badges.ts`                 | The App's import of the catalog                                                    |
| `teams/{teamId}/badges/{badgeId}_{season}` | A badge a team earned in a season, with when and how (`TeamBadgeDocument`)         |
| `badges/{badgeId}`                         | How many teams have earned it, for the share the team page shows (`BadgeStats...`) |

The catalog file has no imports: the App, the art script and Functions all
read the same names and thresholds from it, so a description cannot drift
from the rule it describes.

## How awards are made

`rebuildBadges` reads every season, team-season, roster, game, rating history
and season standing, runs every rule over every season, and makes the stored
awards exactly match the result: it creates what is missing, rewrites an
award whose reason changed, and deletes any the rules no longer produce. It
then recounts each badge's teams, and removes badge documents (and their
uploaded images) for badges no longer defined.

So an award is a projection of the data, like the rankings. Correct a score
and a badge it no longer supports disappears at the next rebuild; delete a
game and its badges go with it.

It runs:

- every night at **11:30pm** (`awardBadgesNightly`), after the 11pm rankings
  rebuild whose ratings and standings Celebrity and Rising Stars read;
- when an admin presses **Rebuild badges** on the Badge Management page,
  which can first **Preview changes** without writing anything.

Each rule awards a team at most once a season, for the first moment it
qualified. Dynasty and Old Guard are milestones earned once ever.

### Forfeits

A game has a `forfeit` field naming the side that forfeited. Its score still
counts in the standings, but the rules never see the game: no badge is won or
lost by a team that did not play. Set it in game management. In past seasons,
the 10–0 games are almost certainly forfeits.

### When a badge can be earned

Some badges wait for the season to reach a point, so they do not appear and
then vanish:

| Waits for                                                | Badges                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| The season to start                                      | Welcome, Veteran, Old Guard, Fresh Faces, Reunion Tour, Celebrity |
| The regular season to end (playoffs, or the end)         | Perfect Season, Last Dance                                        |
| Registration to close, or every spot to be taken         | Close Call                                                        |
| The season to end                                        | Rising Stars                                                      |
| A placement to be set ([SCHEDULING.md](./SCHEDULING.md)) | Champions, Runner-up, Podium, Dynasty                             |

Season 1 was the league's first season, so every team in it earned Welcome
and every player was new to the league. A registration date after the season
began is ignored rather than trusted: Season 1 has one from the following
summer.

### The share on the team page

"78% of teams have earned it" is the teams that have earned the badge out of
every team there is (`badges/{badgeId}.teamsEarned` over a count of `teams`).
A badge that waits for a season to start counts a new team only once its
first season has begun: on 2 October 2026 Welcome stood at 25 of 32 because
six teams new for Season 5 had not played yet. Deleting a team's last season
deletes the team, so a team that never played does not hold a share down.

## The badges

Thresholds are constants in the catalog.

| Tier     | Badge           | Earned by                                                                      |
| -------- | --------------- | ------------------------------------------------------------------------------ |
| Rare     | Champions       | Winning the championship (placement 1)                                         |
| Rare     | Runner-up       | Finishing second                                                               |
| Rare     | Dynasty         | A second championship (once ever)                                              |
| Rare     | Perfect Season  | Winning every regular-season game, at least four                               |
| Rare     | Bagel           | Winning without the other team scoring                                         |
| Rare     | Early Bird      | Being the first team to register                                               |
| Rare     | Close Call      | Being the last team to register                                                |
| Rare     | Celebrity       | Having the season's top-rated player, by all-time rating before its first game |
| Rare     | Rising Stars    | The team whose players' ratings rose most on average over the season           |
| Uncommon | Podium          | Finishing in the top three                                                     |
| Uncommon | Giant Slayer    | Beating the team with the most wins going into that night                      |
| Uncommon | Merciless       | Winning by 15 or more                                                          |
| Uncommon | Bounce Back     | Winning right after losing by 8 or more                                        |
| Uncommon | Frozen Out      | Winning while holding the other team to 3 or fewer                             |
| Uncommon | Hot Streak      | Winning 5 in a row                                                             |
| Uncommon | Show Off        | Scoring 18 or more                                                             |
| Uncommon | Speedrunners    | A game with 27 or more points in all                                           |
| Uncommon | Fresh Faces     | Starting the season with 10 or more players new to the league                  |
| Uncommon | Reunion Tour    | Starting with 5 or more of one other team's roster from last season            |
| Uncommon | Old Guard       | A team's fifth registered season (once ever)                                   |
| Common   | Universe Point  | Winning by exactly one                                                         |
| Common   | Just Warming Up | Scoring 5 or fewer                                                             |
| Common   | Welcome         | A team's first registered season                                               |
| Common   | Veteran         | Registering again after an earlier season                                      |
| Fall     | Turkey Bowl     | Winning your first game back after the Thanksgiving break                      |
| Fall     | Opening Night   | Winning your first game of the season                                          |
| Fall     | Last Dance      | Winning every game on the final night of the regular season                    |

The thresholds were set against every game played since 2023 so that each
tier's badges are about as rare as its name says.

### Celebrity and Rising Stars

Both read the ratings, among the season's registered teams.

**Celebrity** is often shared. Players who have played every game together
have exactly the same rating, so the top of the leaderboard is usually a
whole team's core, and a player who changes teams takes that rating along.
Every team rostering a player at the top rating earns it, comparing ratings
as the rankings do, so players ranked equal are equal here. In Season 3,
Nipull and Zander Stack$ each had a player rated 35.15; before ties were
shared, only whichever was read first was awarded.

**Rising Stars** goes to the team whose players' ratings rose most on
average, from the season's start (after the carry-over into it) to its end.
It favours a team that outplays its rating, not the strongest team: a
favourite gains little for winning as expected, and a rating moves less the
more games are behind it. The league's top-rated core rarely wins it for
that reason, however well it plays.

### If a rebuild fails or is slow

A rebuild is safe to run again: it only ever moves the stored awards towards
what the rules produce, so a second run finishes whatever a first left
undone. Each run logs `Badges planned` (what it will change), `Badge awards
written` and `Badges rebuilt`, each with how long it took, and every write
that fails is logged as `A badge write failed` with its document, error code
and whether it will be retried. Writes are retried at most five times, and
only for errors worth retrying; if they have not all finished within four
minutes the run fails saying how many had, rather than being cut off by the
server's limit with no message. The Rebuild button waits as long as the
server allows.

The first production rebuild, on 1 October 2026, stalled on its last few
deletes and was cut off at nine minutes with nothing logged; a second run
finished them in three seconds. That is what the logging and the deadline
are for.

## Artwork

Every badge is the same medallion: a rim in its tier's metal, a winter sky,
the same snowfall, the snowman duck at the centre and its emblem in a bubble
at the lower right. What makes each its own is the scene drawn around the
duck. `scripts/badge-art/badges.js` describes each badge's emblem, sky and
scene; `draw.scm` draws them through GIMP's Script-Fu; `render.js` runs it:

```bash
node scripts/badge-art/render.js            # every badge, plus out/sheet.png
node scripts/badge-art/render.js bagel      # just one
```

It needs GIMP 3 (`GIMP_CONSOLE` overrides where to find `gimp-console`).
Script-Fu rather than Python-Fu because it is built into GIMP. The icons are
Lucide's, which the App already uses.

## Adding a badge

1. Add it to `BADGES` in the catalog, with any threshold as a constant.
2. Add its rule to `RULES` in `rules.ts`, and tests in `rules.test.ts`: the
   catalog test fails until every badge has a rule.
3. Add its art to `scripts/badge-art/badges.js` and render it; the render and
   `tests/integration/badge-art.test.ts` fail until every badge has art and a
   published image.
4. Deploy. The next nightly rebuild, or **Rebuild badges**, awards it for
   every past season too.
