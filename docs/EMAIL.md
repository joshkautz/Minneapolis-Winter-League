# Email

The league sends email through [Resend](https://resend.com) from
`notifications@mplswinterleague.com`, with replies going to
leadership@mplsmallard.com. Every email is sent by Cloud Functions; nothing
else emails players.

## How an email is sent

1. **Queue.** Code that wants an email sent writes a `mail/{id}` document —
   `queueEmail` or `queueEmailInTransaction` in `Functions/src/email/outbox.ts`
   — in the same transaction as the change it describes, where there is one.
   An email then goes out only if that change was saved.
2. **Send.** The `sendQueuedEmail` trigger (`triggers/documents/mailQueued.ts`)
   looks up the recipient, checks their preferences and the delivery switch,
   renders the template and sends it (`email/sender.ts`, `email/resend.ts`).
3. **Record.** The mail document keeps the outcome: `sent` with Resend's id,
   or why not — `held`, `skipped`, `unsubscribed`, `emulated`, `failed`.

It is retried for failures that may pass (rate limits, Resend outages) and is
idempotent: an email that is no longer `queued` is left alone, and the mail id
is Resend's idempotency key, so a retry after an unrecorded send does not
deliver twice. Give an email a stable id (e.g.
`seasonAnnouncement-{seasonId}-{playerId}`) and queueing it twice fails the
second time instead of sending it twice.

`mail/` is readable by nobody but Functions, admins included: it holds
addresses and what is being sent to them.

## The switch: `system/email`

| `mode`          | What happens                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `off` or absent | Nothing is sent. Queued email is recorded as `held` and never sent later.    |
| `test`          | Only the addresses in `testRecipients` receive email; the rest is `skipped`. |
| `live`          | Everyone's email is sent.                                                    |

```bash
node scripts/production/set-email-mode.js status
node scripts/production/set-email-mode.js test josh@mplsmallard.com
node scripts/production/set-email-mode.js live --confirm-live
```

Held email is never released when the switch turns on, so turning email on
does not flood anyone with a backlog.

**Under the emulator nothing is ever sent.** The Functions emulator reads
production secrets, and Resend has no test mode, so `deliverQueuedEmail`
renders the email and records it as `emulated` instead. (A seeded emulator
once emailed real players through Dropbox Sign this way.)

## Categories and unsubscribing

Each template has a category (`Functions/src/email/templates.tsx`):

| Category        | Can be turned off | Unsubscribe link and header | Postal address |
| --------------- | ----------------- | --------------------------- | -------------- |
| `account`       | No                | No                          | No             |
| `teams`         | Yes               | Yes                         | No             |
| `registration`  | Yes               | Yes                         | No             |
| `announcements` | Yes               | Yes                         | Yes            |

A player's choices live on their private `playerContacts/{uid}` document as
`emailPreferences` (absent means on), with `emailPreferencesUpdatedAt`. Every
link carries the player's id and a random per-player `unsubscribeToken`, so
changing preferences needs no sign-in; the token is compared in constant time,
and one player's link never opens another's preferences.

### Two ways out of every email

1. **The footer link**, "Don't want these emails? Unsubscribe", opens
   `mplswinterleague.com/email-preferences` (the App's
   `features/public/email-preferences`). One button unsubscribes from the kind
   of email the link came from, with Undo; switches below change the rest, and
   "Unsubscribe from all" turns every optional kind off. Signed in, a player
   finds the same switches on their profile.
2. **The `List-Unsubscribe` header** points at `mplswinterleague.com/unsubscribe`
   (a Hosting rewrite to `emailUnsubscribe`), with
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail, Yahoo and
   Outlook can show their own Unsubscribe button from it. A POST unsubscribes
   straight away and answers 200 — never a redirect; a GET (a mail app opening
   the address in a browser) changes nothing and redirects to the preferences
   page, because link scanners fetch every URL in a message.

Both read and write preferences through `getEmailPreferences` and
`updateEmailPreferences`, which accept either a link or the signed-in player.

### What each provider requires, and how it is met

| Source            | Requirement                                                                                  | Met by                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Gmail             | One-click `List-Unsubscribe` (RFC 8058) on promotional mail; honour within 48 hours          | The header; unsubscribing takes effect at once           |
| Yahoo             | One-click header; a clearly visible body link, which may go to a preferences page; 2 days    | Both links                                               |
| Microsoft Outlook | A visible, working unsubscribe in bulk mail; SPF, DKIM and DMARC                             | The footer link; the domain's records                    |
| RFC 8058          | One HTTPS URI; POST works without cookies or credentials, any body; no redirect; DKIM-signed | `emailUnsubscribe`; see below for checking DKIM coverage |
| CAN-SPAM          | No login, fee or more than one page; a way to stop all marketing; 10 business days; address  | The preferences page; "Unsubscribe from all"; the footer |
| Apple Mail        | Its Unsubscribe banner uses only a `mailto:` address                                         | Not offered yet; Apple Mail users use the footer link    |

**Checking DKIM covers the headers.** Gmail offers one-click only when the
DKIM signature covers `List-Unsubscribe` and `List-Unsubscribe-Post`. In Gmail,
open a received announcement, choose **Show original**, and check that the
`DKIM-Signature` header's `h=` list includes both. The first test
announcement (September 2026) passed: SPF, DKIM and DMARC, with both headers
signed.

**Gmail's button is Gmail's choice.** Correct headers make one-click
possible; Gmail decides whether to show the button, from the sender's volume
and reputation. It did not appear on the domain's first test email, and is
not expected to until the league has sent real announcements for a while.
The footer link works either way.

**Announcements are commercial email under CAN-SPAM.** They carry the league's
postal address (`EMAIL_CONFIG.POSTAL_ADDRESS` in
`Functions/src/config/constants.ts`), and the sender refuses them while it is
unset. Unsubscribe links work indefinitely.

## Templates

Templates are React components (`Functions/src/email/templates/`) rendered
with React Email to HTML and plain text. They follow the site's light theme:
the wordmark, one white card with a sky-blue top edge on the slate
background, navy headings and buttons (`templates/theme.ts` holds the site's
tokens as plain colors, since email clients ignore stylesheets).

To add one: write the component using the `EmailLayout` pieces, then register
it in `templates.tsx` with its category, subject, footer reason and a
`sample` of its props. The render tests cover every registered template.

```bash
npm run email:preview   # renders every template to .email-previews/*.html
```

To see one in a real inbox, set test mode and call `sendEmailPreview` with the
template's name; it sends the sample to each test recipient.

## Team emails

Joining a team is emailed to whoever has to act, or asked
(`email/teamOfferEmails.ts`, templates in `templates/TeamOffers.tsx`). Every
one is in the `teams` category and links to the team page, `/manage`.

| Event                   | Invitation (a captain invites a player)    | Request (a player asks to join)            |
| ----------------------- | ------------------------------------------ | ------------------------------------------ |
| Sent                    | the player (`teamInvitation`)              | each captain (`teamJoinRequest`)           |
| Accepted                | each captain (`teamInvitationAccepted`)    | the player (`teamRequestAccepted`)         |
| Declined                | each captain (`teamInvitationDeclined`)    | the player (`teamRequestDeclined`)         |
| Withdrawn by its sender | the player (`teamInvitationWithdrawn`)     | each captain (`teamRequestWithdrawn`)      |
| Player joined elsewhere | each captain (`teamPlayerJoinedElsewhere`) | each captain (`teamPlayerJoinedElsewhere`) |

"Each captain" is everyone captaining the team that season. Sending is
queued by `createOffer`, declining and withdrawing by `updateOffer`, and
accepting by the `onOfferUpdated` trigger, in the transaction that puts the
player on the roster, so nobody hears of a join that failed. The same
transaction closes the player's other pending offers that season and tells
those teams' captains why; creating or rolling over a team, or being added
by an admin, does the same through `cancelPendingOffersForPlayer`
(`shared/offers.ts`).

- **Withdrawing and re-sending cannot flood anyone, and cannot mislead.** A
  player and a team get at most two "sent" emails a day for each kind of
  offer (`OFFER_SEND_EMAILS_PER_DAY`, recorded on the offer as
  `sendEmailedAt`). A captain who withdraws by mistake and invites again is
  therefore emailed all three times, so the player's last email is the
  invitation. Past the limit an offer goes out with no email and is marked
  `sentQuietly`, and withdrawing it then emails nobody either.
- **Only the sender withdrawing is emailed as withdrawn.** A captain canceling
  a player's request through the API (the App declines requests instead) is
  emailed as declined; an admin canceling someone else's offer sends
  nothing.
- **Admin roster edits send nothing** about the roster itself: they are as
  often corrections to past seasons. Only the offers they close are told.

## The new-season announcement

`sendSeasonAnnouncement({ seasonId, audience, dryRun })`, admin only, builds
the email from the season's own dates and fee.

- `audience: 'test'` sends it to the test recipients.
- `audience: 'players', dryRun: true` counts who would receive it: everyone
  ever on a roster, with an email address, who is not banned.
- `audience: 'players'` queues it for each of them, once per season however
  often it is called. Refused unless email is `live` and the postal address is
  set.

## Setup

The domain `mplswinterleague.com` is verified in Resend (region us-east-1),
with these records in Squarespace DNS:

| Host                | Type  | Value                                   |
| ------------------- | ----- | --------------------------------------- |
| `send`              | MX    | `feedback-smtp.us-east-1.amazonses.com` |
| `send`              | TXT   | `v=spf1 include:amazonses.com ~all`     |
| `resend._domainkey` | TXT   | the DKIM key Resend issued              |
| `rsend`             | CNAME | `send.forge.rmta.net`                   |
| `_dmarc`            | TXT   | `v=DMARC1; p=none;`                     |

DMARC is in monitoring mode; tighten it to `p=quarantine` once mail has been
flowing cleanly for a few weeks. Squarespace has no DNS API, so record changes
are made by hand.

**The account is on Resend Pro** (since 27 September 2026): 50,000 emails a
month, no daily limit, and 10 requests a second. The free plan's 100 a day
would not cover it: the announcement goes to about 450 players, and the
opening day of 2025 Fall registration saw 150 invitations and requests,
each an email or more. It could drop back to free between registration
periods. Over a limit, Resend answers `daily_quota_exceeded` or
`monthly_quota_exceeded`, which the sender retries for up to a day: the
email is late, and after a day of retries it is left `queued`, never sent.
`resend usage` shows where the account stands.

Functions read `RESEND_API_KEY`, a Firebase secret holding a **send-only key
restricted to this domain**. Account work — domains, keys, webhooks, logs —
is done with the Resend CLI (`resend`, signed in with `resend login`), never
with that key.

```bash
resend doctor                    # CLI, sign-in and domain status
resend emails list               # recent sends
resend emails get <id>           # one email's delivery events
```
