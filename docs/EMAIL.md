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

| Category        | Can be turned off | Unsubscribe link | Postal address |
| --------------- | ----------------- | ---------------- | -------------- |
| `account`       | No                | No               | No             |
| `teams`         | Yes               | Yes              | No             |
| `registration`  | Yes               | Yes              | No             |
| `announcements` | Yes               | Yes              | Yes            |

A player's choices live on their private `playerContacts/{uid}` document as
`emailPreferences`. Unsubscribe links go to `mplswinterleague.com/unsubscribe`
(a Hosting rewrite to `emailUnsubscribe`) and carry the player's id, a random
per-player token and the category. The link shows a confirmation button rather
than unsubscribing on sight, because mail scanners open every link in a
message. Email that can be turned off also carries a one-click
`List-Unsubscribe` header, as Gmail and Yahoo expect.

**Announcements are commercial email under CAN-SPAM.** They must carry the
league's physical postal address — a street address, a USPS PO box, or a
private mailbox from a commercial mail receiving agency — and the sender
refuses announcements while `EMAIL_CONFIG.POSTAL_ADDRESS`
(`Functions/src/config/constants.ts`) is unset. Opt-outs must be honoured
within 10 business days; ours take effect at once.

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

Functions read `RESEND_API_KEY`, a Firebase secret holding a **send-only key
restricted to this domain**. Account work — domains, keys, webhooks, logs —
is done with the Resend CLI (`resend`, signed in with `resend login`), never
with that key.

```bash
resend doctor                    # CLI, sign-in and domain status
resend emails list               # recent sends
resend emails get <id>           # one email's delivery events
```
