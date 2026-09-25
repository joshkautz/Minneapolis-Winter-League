# Security Policy

## Supported versions

Only `main`, which is what production runs.

## Reporting a vulnerability

Report it privately: open the repository's **Security** tab on GitHub and
choose **Report a vulnerability**. Please do not open a public issue, which
would show everyone the problem before it is fixed. Expect a reply within a
week.

## The model

**Clients read; Cloud Functions write.** `firestore.rules` and
`storage.rules` deny every client write, so the callables are the only way
into the database, and each one authorizes its caller itself with the
validators in `Functions/src/shared/auth.ts`:

- a signed-in user with a **verified email** for nearly everything
  (`createPlayer` alone accepts an unverified one, since it runs at sign-up);
- `admin: true` on the caller's player document for the admin callables —
  there are no Auth custom claims;
- not `banned`, for anything that joins, pays or posts.

Validation in the App is for the reader's benefit only. Any signed-in user
can call a callable directly, so every input is checked again on the server,
and multi-document changes run in transactions so they cannot half-apply.
`tests/integration/callables-authorization.test.ts` checks that every
callable rejects a caller it should, and fails if a new callable is added
without being listed.

## What clients can read

Most league data is public: players' names, teams and rosters, seasons,
games, offers, news, posts, badges and rankings. The exceptions, each pinned
by `tests/rules/firestore.test.ts`:

| Data                                         | Readable by                        |
| -------------------------------------------- | ---------------------------------- |
| `playerContacts/{uid}` — the player's email  | that player and admins             |
| `stripe/{uid}` — checkouts and payments      | that player                        |
| `dropbox/{uid}` — pre-2026 waiver records    | that player                        |
| `players/{uid}/waiverSignatures`             | that player and admins             |
| a team-season's `contributions`, `checkouts` | that season's roster and admins    |
| `system/maintenance` — the kill-switch       | admins, and no client may write it |

Emails are kept off the public player document for the same reason: anyone
with the web config can list `players`. Waiver signatures carry
the sensitive fields — date of birth, address, emergency contacts — which is
why they are a separate, private subcollection (`docs/WAIVERS.md`).

## Files

Storage holds public images: team logos and badges. Clients never upload.
The team and badge callables take the image as base64, check it against
`Functions/src/shared/imageRules.ts` — PNG, JPEG, GIF or WebP, at most 5 MB;
SVG is refused because it can carry script — then write it with the Admin
SDK and make it public. The client never names a file: `updateTeam` used to
accept a Storage path, which let a captain point their team at another
team's file and then delete it with their own team. Team deletion also only
removes files under `teams/` that no other season of the team still uses.

## Payments

- **The server decides what is charged.** A contribution is checked against
  the team's remaining balance, less what teammates have reserved at
  checkout, and the team comes from the payer's own roster rather than the
  request.
- **Return URLs are allowlisted** (`Functions/src/shared/returnUrls.ts`), so
  Checkout cannot be used as an open redirect.
- **The webhook trusts only signed events and server-set metadata**, and
  refunds any payment it cannot attribute to a team rather than keeping it.
- **The Stripe key is restricted** to the calls the code makes (see
  `.claude/rules/functions.md`), and the emulator refuses a live key.

See `docs/TEAM_PAYMENTS.md` for the full design.

## Secrets

Stripe's key and webhook secret are Firebase secrets, mounted only on the
functions that declare them. Nothing secret is committed: the App's
`VITE_FIREBASE_*` values are the public web config, and
`Functions/.secret.local` is gitignored.
