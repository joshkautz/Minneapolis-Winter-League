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

| Piece                                 | Where                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| The text, as versioned data           | `Functions/src/waiver/versions.ts`                      |
| The rules a submission must meet      | `Functions/src/waiver/rules.ts`                         |
| Recording a signature                 | `signWaiver` (`functions/user/waivers/signWaiver.ts`)   |
| An admin marking someone signed       | `updatePlayerAdmin`, which also writes a record         |
| The signature records                 | `players/{uid}/waiverSignatures/{id}`                   |
| Signing page, and the printed copy    | `App/src/features/player/waiver/`                       |
| The signer's copy by email            | `waiverCopy` (`email/waiverCopy.ts`), from `signWaiver` |
| Emergency contacts by team            | Admin → Emergency Contacts, via `getEmergencyContacts`  |
| Captains reminding unsigned teammates | My Team → roster card, via `remindUnsignedTeammates`    |
| Prompts to sign                       | Profile, My Team (both views), the notification badge   |

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
never edited or deleted; a correction is a new record.

## The signer's copy

Each signature made in the app emails the signer their copy: the full text
of the version they agreed to, what they affirmed (or, for a minor, the
guardian's certification), who signed and when, and the version's SHA-256.
It is queued in the transaction that records the signature, under the
stable id `waiverCopy-{signatureId}`, so a copy goes out only for a saved
signature and never twice. It is `account` email, which cannot be turned
off, like a receipt.

The date of birth, address and emergency contacts stay out of the email;
it links to the full record at `/waiver/copy/{uid}/{signatureId}`, which
shows them and prints. An admin marking a player signed sends no copy:
there is no signer to send it to.

## Emergency contacts on game day

Admin → Emergency Contacts (`/admin/emergency-contacts`) lists a season's
registered teams, by name, with every rostered player and the emergency
contacts from the waiver they signed that season; it prints, one team to a
block, and each number can be tapped to call. It reads them through the
admin-only `getEmergencyContacts` (`services/emergencyContacts.ts`), which
logs who asked, rather than opening the private records to a client query.

A player with no contacts says why: an admin marked them signed, so the app
holds none, or they have not signed this season. Contacts from an earlier
season's waiver are never shown, and a player's own signature is preferred
to a later admin record. Captains see no contacts; only admins do.

## Reminding unsigned teammates

A captain's roster card on My Team has a button to email every teammate who
has not signed this season's waiver, counting this season's roster only and
never the captain themselves. A team sends one round a day, whichever
captain sends it (`WAIVER_REMINDER_COOLDOWN_MS` in `waiver/rules.ts`, shared
with the App); until then the button says when the last went and when the
next can. The server checks the captaincy, the cooldown and who has signed
in the transaction that queues the emails. The email is a `registration`
reminder; see "Waiver reminders" in [EMAIL.md](EMAIL.md).

## After an account is deleted

Deleting an account keeps its signatures, as it always kept the Dropbox Sign
records: a release matters most after someone has left. The confirmation a
player sees before deleting says so. Everything else about them goes; see
Account deletion in [functions/README.md](./functions/README.md#account-deletion).

With the player document gone, the admin screens can no longer reach the
records, and the player's own read access went with their sign-in. They are
still at `players/{uid}/waiverSignatures` — the Firebase console shows the
missing parent in italics. To find them by person, query the
`waiverSignatures` collection group with the Admin SDK on the `email` field,
which each record keeps.

They are kept indefinitely, by the league's decision in September 2026. A
claim can be brought years after the season it concerns — for someone who
signed as a minor the clock only starts at eighteen — so there is no point
at which a signature is safe to discard. Nothing deletes them, and nothing
should without a new decision.

Seasons signed before September 2026 went through Dropbox Sign; their
records are in `dropbox/{uid}/waivers`, kept read-only as history. The 357
signed PDFs were archived before the integration was removed, to the private
`minnesota-winter-league-firestore-backups` bucket under
`waiver-archive/dropbox-sign/`, with a manifest mapping each file to its
player and season. Not the default bucket: `storage.rules` makes everything
there publicly readable.

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

The text is the league's original, word for word, and the league's attorney
found it and the in-app signing sufficient in September 2026. Minnesota's
electronic-signature law (Minn. Stat. ch. 325L) gives a typed signature the
same effect as a written one. The waiver promises a banned player written
notice with the reasons; the app does not send it, so an admin does.
