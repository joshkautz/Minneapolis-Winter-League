# Waivers

Every player signs the league's Waiver and Release of Liability once per
season, in the app, at `/waiver`. It replaced Dropbox Sign in September 2026:
that service cost a monthly API plan, had outages, and sent players to another
website to sign.

A player can sign any time before the season ends, including before joining a
team or before registration opens. Signing sets
`players/{uid}/playerSeasons/{seasonId}.signed`, which is all registration
reads, so nothing downstream changed.

## Pieces

| Piece                              | Where                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| The text, as versioned data        | `Functions/src/waiver/versions.ts`                    |
| The rules a submission must meet   | `Functions/src/waiver/rules.ts`                       |
| Recording a signature              | `signWaiver` (`functions/user/waivers/sign.ts`)       |
| An admin marking someone signed    | `updatePlayerAdmin`, which also writes a record       |
| The signature records              | `players/{uid}/waiverSignatures/{id}`                 |
| Signing page, and the printed copy | `App/src/features/player/waiver/`                     |
| Prompts to sign                    | Profile, My Team (both views), the notification badge |

The text and the rules are **one copy**, imported by the App from
`Functions/src/waiver/` (see `App/src/shared/waiver.ts`) rather than
duplicated, so the form and the server can never word the waiver or judge a
submission differently. Both files are plain data and pure functions with no
imports; keep them that way. The SHA-256 helper is in `fingerprint.ts` because
it needs Node's crypto.

## What a signature records

- the season, the waiver version id, and that version's SHA-256
- the participant's profile name, and the typed signature
- for a minor: that a parent or guardian signed, and their relationship
- date of birth, mailing address, and one to three emergency contacts
- the account email, a server timestamp, the client IP and user agent

Records are private to the player and admins (`firestore.rules`) because of
the personal data, unlike the public player document they sit under. They are
never edited or deleted; a correction is a new record. Deleting an account
removes the player document and player-seasons but keeps these records, as
it always kept the Dropbox Sign ones: a release matters most after someone
has left.

Seasons signed before September 2026 went through Dropbox Sign; their
records are in `dropbox/{uid}/waivers`, kept read-only as history.

A returning player's form is filled in from their last signature, except the
signature itself, which is always typed again.

## Minors

A date of birth under 18 (in Minneapolis time) turns the signature section
into the parent or guardian's: the guardian certification from the original
form, the guardian's typed name, and their relationship. The player's own
name is refused as the guardian's.

## Changing the wording

A published version never changes, because a signature is evidence of what
was agreed only while the text behind its version id is the text the player
saw. `versions.test.ts` pins each version's hash, so an edit fails CI.

To change the waiver: add a new version to `WAIVER_VERSIONS`, point
`CURRENT_WAIVER_VERSION_ID` at it, pin its hash in `versions.test.ts`, and
keep every old version for as long as its signatures are kept. Players already
signed for the season stay signed; decide separately whether a change needs
everyone to sign again.

The checkbox labels and the electronic-signature consent are part of the
version, since they are what a signer actually clicks.

## Legal

The text is the league's original, word for word. It has not been reviewed
for this format; see the open items in `docs/ROADMAP.md` under
"Waiver review". Minnesota's electronic-signature law (Minn. Stat. ch. 325L)
gives a typed signature the same effect as a written one; what decides
whether a release holds up is mostly its wording.
