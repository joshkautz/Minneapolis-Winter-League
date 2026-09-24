# Team-level payment design

A proposal, not yet built. It covers how a team reaches a **$1,000 collective
total** paid by any combination of its players, replacing the current rule
that ten individual players must each pay $100.

## Why

Charging per player punishes teams for carrying a full roster: twenty players
pay twice as much as ten for the same number of minutes on the field. A fixed
team price removes that, and lets a team coordinate outside the app — pool the
money, have one person pay the lot the moment registration opens, and secure
one of the twelve spots.

## The shape of the solution

Three decisions carry the design:

1. **Inline pricing**, so the server decides the amount rather than the payer.
2. **Manual capture** for every contribution, so money is only ever _taken_
   from a team that is actually going to play.
3. **Waivers issue on joining a roster**, not on paying.

The rest follows from those.

## Deciding the amount

### Inline pricing, not pay-what-you-want

Stripe has a purpose-built "customer chooses price" feature:
[`custom_unit_amount`](https://docs.stripe.com/payments/checkout/pay-what-you-want)
on a Price, with optional `preset`, `minimum` and `maximum`. The payer types
the amount into Stripe's own checkout page.

It is the obvious candidate and it is still the wrong tool, for two reasons
that survive dropping discounts:

1. **`minimum` and `maximum` live on the Price**, so they are fixed for
   everyone who uses it. What we need is "at most what _this_ team still
   owes", which differs per team and changes as contributions land. You could
   create a throwaway Price per attempt with the right `maximum`, but that is
   strictly more work than inline pricing for a worse result.
2. **The amount is chosen inside Stripe's UI**, so our server first learns of
   it in the webhook — after the money has moved. Validation after the fact is
   not validation.

(A third objection, that `custom_unit_amount` cannot be combined with
discounts or promotion codes, no longer applies: the per-player returning
discount is being retired along with per-player pricing.)

Use [inline pricing](https://docs.stripe.com/products-prices/how-products-and-prices-work#inline-pricing)
instead. The payer picks an amount in _our_ UI, where we can show the team's
remaining balance and offer sensible presets; our server validates it against
the live balance and passes it as `price_data.unit_amount`.

Inline prices create throwaway `Price` objects that do not appear in the
Dashboard catalog. That is expected — the `Product` stays stable and is what
appears on the receipt.

### It is not a donation

A donation is money given without receiving goods or services. This is payment
for a roster spot in a league. Stripe has
[separate requirements for accepting tips and donations](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations),
and describing league fees that way would misrepresent the business to the
processor and to the payer.

Model it as a Product — "Team Registration" — with inline amounts. Do not set
Checkout's `submit_type` to `donate`.

### `adjustable_quantity` is the wrong shape

Checkout can let the payer change the quantity of a line item, so a $100 price
with `adjustable_quantity` would let someone buy "5 player slots" for $500.
Tidy, but it forces every contribution to be a multiple of $100 and rules out
the "twenty players at $50" case.

## Not losing money on cancellations

This is the part worth getting right, and Stripe gives a clean answer.

**Stripe does not return the processing fee on a refund**, but **cancelling an
uncaptured authorization is free**. Stripe
[recommends manual capture explicitly](https://docs.stripe.com/refunds#cost-optimization)
for businesses that refund close to the time of transaction, which is exactly
this.

### Authorize everything; capture only a team that is going to play

Every contribution is created with
`payment_intent_data.capture_method = 'manual'`. That places a hold instead of
taking the money. Capture happens when, and only when, the team is complete:

```ts
const complete =
	signedPlayerCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION &&
	authorizedCents >= TEAM_CONFIG.REGISTRATION_TOTAL_CENTS
```

At that moment, capture every outstanding hold for the team. Until then, no
money has left anyone's account and every exit is free:

| Outcome                         | Action                        | Cost                  |
| ------------------------------- | ----------------------------- | --------------------- |
| Team completes                  | Capture all holds             | Normal processing fee |
| Team never completes            | Cancel all holds              | **Nothing**           |
| Team misses the twelve-spot cut | Cancel all holds              | **Nothing**           |
| Team overpays through a race    | Capture part, cancel the rest | **Nothing extra**     |

For the common case this is invisible. One person pays $1,000 for a team that
already has ten signed players, and the capture happens in the same second —
it behaves exactly like a normal payment.

### It also makes the overpayment race free

Two players both see "$200 remaining" and both pay $200. The team is now
holding $1,200 in authorizations.

Capture supports
[capturing less than the authorized amount](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method#capture-funds)
via `amount_to_capture`, and a partial capture automatically releases the
rest. So: capture $200 from the first and cancel the second, or capture $100
from each. Either way nobody is overcharged and no refund is issued.

Had the contributions been captured on arrival, the same race would cost a
$200 refund and its unrecoverable fee. This is the strongest argument for
manual capture — it turns an inevitable, recurring cost into nothing.

### A hold must never be allowed to expire

A card authorization lasts **7 days** for online payments, and registration
windows have run **15 to 31 days**. A hold can therefore outlive its
usefulness before the team resolves.

The wrong answer is to let it lapse and ask the contributor to pay again.
Re-authorization means emailing someone that the $1,000 they already paid has
silently come back, and asking them to do it again while their team is still
in the running. That is not a burden to put on a volunteer who has already
collected money from nineteen teammates, and it invites exactly the "did this
league just take my money twice?" reaction that produces disputes.

So: **capture before the authorization expires**, rather than letting it go.

```
Contribution authorized
        │
        ├── team registers            → capture now            (normal fee)
        ├── team loses the 12th spot  → cancel now             (free)
        └── neither, and expiry nears → capture at ~6h before  (normal fee)
                                          │
                                          └── team later fails → refund (fee lost)
```

Every path ends in the team either being charged properly or released cleanly.
Nobody is ever asked to pay twice.

Stripe can do the last branch natively.
[`capture_method: 'automatic_delayed'`](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method#automatic-delayed-capture)
with `capture_by: 'auth_expiry'` captures roughly six hours before the
authorization would lapse, and you can still capture or cancel manually before
then. It is in private preview, so it needs requesting — but if granted it
removes the need to build and operate a scheduled sweep, which is the only
fiddly part of this design. Ask for it.

Without it, the same thing is a scheduled function reading `capture_before`
off each charge and capturing anything inside its last day.

### Why not simply capture on arrival

Capturing immediately is simpler: no capture step, no expiry handling, no hold
states in the ledger. It is a reasonable thing to want, and the reason to
resist it is that it gives up free cancellation in exactly the case that
happens most.

The common failure is not a team that dithers for a fortnight. It is a team
that pays and **loses the race**, which resolves in seconds or minutes: twelve
other teams were already complete. Under holds that is a cancellation costing
nothing. Under immediate capture it is a $1,000 refund whose fee — around $29
— is gone for good, on a team that never played.

With roughly fifteen teams chasing twelve spots, that is a few hundred dollars
a season converted from nothing into a real cost, for a simplification worth
maybe a day of work.

The expiry safety net above is what removes the objection to holds. It is not
much more code than plain manual capture, and it means the seven-day window
never reaches a contributor at all.

### What the UI actually has to say

Once holds never expire, the explanation gets short, because the seven days
stop being a deadline anyone has to act on:

> **Your card is authorized for $1,000 now, and charged when your team is
> confirmed.** If your team does not get one of the twelve spots, the
> authorization is released and you are never charged.

No countdown, no expiry date, no instruction. The only thing a contributor
needs to know is that the money is committed but not yet taken, and that they
do not have to do anything else.

It is still worth showing, on the team page, that a contribution is
`authorized` rather than `paid` — a captain chasing the last two signatures
should be able to see the money is real. But that is information, not a task.

### Statement descriptors matter more than usual

A hold appears on a statement much like a charge. Someone who does not
recognise a $1,000 line disputes it, and a dispute costs the fee _and_ the
amount. Set a clear
[statement descriptor](https://docs.stripe.com/get-started/account/statement-descriptors)
and use Checkout's `custom_text` to say plainly that this is an authorization
for a team registration that will be released if the team does not complete.

## Data model

Money becomes a team-season concern, so it needs a ledger. A single running
total is not enough: cancellation and capture both need to know who paid what.

```
teams/{teamId}/teamSeasons/{seasonId}
  registered: boolean            // public, like the rest of the team-season

teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}
  player: DocumentReference<PlayerDocument>
  amountCents: number            // held, or taken after a partial capture
  authorizedAmountCents?: number // what was first held, once they differ
  status: 'authorized' | 'captured' | 'refunded' | 'canceled'
  paymentIntentId: string
  captureBefore: Timestamp       // from the charge; capture before this
  releasedBy?, releaseReason?, releasedAt?   // an admin's manual release
  createdAt: Timestamp
```

The contributions subcollection is the only record of a team's money. **It is
private**: `firestore.rules` lets the team's roster for that season and
admins read it, and nobody else — not other teams, not the public, and not
anyone through a collection-group query.

That is why there are no totals on the team-season. Team-season documents are
world-readable, so a running total there would publish every team's balance.
An earlier version kept `authorizedCents` and `capturedCents` there, in step
with the ledger; they were removed before any season used team payments.
Anything that needs a total sums the ledger.

Note that the registration test uses **authorized**, not captured: a team
secures its spot when the money is committed, and capture follows.

### The registration rule, stated exactly

Two independent conditions, both on the team:

```ts
const registered =
	signedPlayerCount >= 10 && // roster members who have signed a waiver
	authorizedCents >= 100_000 // committed by anyone on the roster
```

- **A player is registered when they sign their waiver.** Nothing else — not
  payment, not merely being on a roster.
- **A team is registered when it has ten registered players and $1,000
  committed**, in any split, from any of its rostered players.

The two conditions need not be satisfied by the same people. A team of eleven
where the captain pays the whole $1,000 and has not yet signed, while the
other ten have, **is registered**: it has ten signed players and it has the
money. The captain's own waiver decides whether _they_ can play, not whether
the team is in.

Reading it the other way — requiring the $1,000 to come from the ten signed
players specifically — would block a team on its own captain's paperwork
despite having everything the league asked for, and is incoherent in the
"one person pays for everyone" case that motivated this change: there, one
player contributes $1,000 and nine contribute nothing.

### Registration is irreversible

Once a team registers it is locked in for the season. `registered` does not
flip back if the roster later drops below ten signed players, so
`updateTeamRegistrationStatus` must lose its ability to set it to `false`.

Only an admin can reverse it, deliberately, and that path settles the money —
there is no way to un-register a team and leave $1,000 captured against it.

## Returning money that should not be kept

Two events oblige the league to give money back, and both apply to any team
holding contributions that has not registered:

1. **Twelve other teams register.** The season is full; every unregistered
   team is settled.
2. **The registration window closes.** Anything still unregistered is
   settled.

"Settle" is one operation with two branches, decided per contribution:

| Contribution state | Action                   | Cost               |
| ------------------ | ------------------------ | ------------------ |
| `authorized`       | Cancel the PaymentIntent | Nothing            |
| `captured`         | Refund it                | Fee, unrecoverable |

Most will be `authorized` and cost nothing. A contribution is only ever
`captured` while unregistered if the expiry safety net reached it first — a
team that took more than seven days and then did not make it.

### Orphaned money has to be impossible, not merely avoided

Every route that deletes a team-season is a route to losing track of a
contribution. There are four today:

- `deleteTeamSeasonWithCleanup` — the shared path, used by the lock cascade,
  the admin `deleteUnregisteredTeam`, and the captain-facing `deleteTeam`.
- `mergeTeams` — `recursiveDelete` on the losing team, which would take its
  contributions with it.

Rather than remember to settle in each, make it structural:

- **`deleteTeamSeasonWithCleanup` settles first, or refuses.** It is already
  the single chokepoint for three of the four paths. Give it the invariant:
  a team-season with unsettled contributions cannot be deleted. Everything
  upstream then inherits it.
- **`mergeTeams` moves contributions to the winning team**, the way it
  already moves roster entries and badges — or refuses when the losing team
  has unsettled money, which is simpler and almost certainly rare enough.
- **A reconciliation job** lists PaymentIntents in `requires_capture` with no
  matching live contribution, and reports them. A backstop, not a mechanism:
  if it ever finds something, the invariant above has a hole.

Both deletion paths need a test that a team with outstanding money cannot be
deleted, because this is exactly the kind of guarantee that decays when
someone adds a fifth path.

### This needs scheduled functions, which the codebase has never used

Two of these run on a clock rather than in response to a write:

- Settling unregistered teams when the registration window closes.
- Capturing a hold before it expires, if Stripe does not grant
  `automatic_delayed` capture.

There are no `onSchedule` functions in `Functions/src` today, so this is a new
capability rather than a new instance of an existing pattern. It needs the
same care as the triggers: pinned region, idempotent by construction (settling
an already-settled contribution is a no-op), and honouring the migration
kill-switch.

## Two consequences that are easy to miss

### "Fully registered player" has to stop meaning "paid"

Confirmed. A player counts toward the ten when they are **on the roster and
have signed their waiver**. Money moves entirely to the team level, and
`playerSeasons.paid` stops being part of the registration test.

Suggested: keep `paid` as a record of whether that person contributed money —
useful for a captain chasing their team, and for knowing who to talk to if a
hold needs re-taking — but remove it from every gate.

### The waiver trigger has to move

Confirmed, and it is the largest piece of work. `onPaymentCreated` currently
sends a player their waiver when they pay. If one person pays for the whole
team, **the other nineteen never get a waiver** — and since registration now
needs ten signed players, the team can never register.

Waiver issuance moves onto joining a roster. Both `updateTeamRoster` and the
offer-acceptance path already write membership, and
`Functions/src/shared/membership.ts` is the single place both go through.

The failure mode here is a waiver that never arrives rather than an error
anyone sees, so it needs a test that asserts a waiver is requested on join,
and an admin view of who on a roster is still unsigned.

## Security

The amount is now attacker-controlled input, which it was not before.

- **Never trust a client-supplied amount.** The server computes the maximum
  from the team's live remaining balance and rejects anything above it. The
  client may _propose_; the server decides.
- **Enforce a floor** so the processing fee cannot swallow the contribution.
- **Re-derive everything in the webhook** from metadata our server set. The
  amount charged is authoritative from Stripe; the team it belongs to is not
  something the client gets to assert.
- **Idempotency keys** on session creation, and idempotent webhook handling
  keyed on the PaymentIntent id — Stripe retries.
- **Authorization**: only a player rostered on that team for that season may
  contribute to it. Captains are not special; any rostered player can pay.

### Use a restricted key

The integration currently uses `STRIPE_SECRET_KEY`, which can do anything the
account can. Stripe's guidance is to use a
[restricted API key](https://docs.stripe.com/keys/restricted-api-keys) scoped
to what the Functions actually need — Checkout Sessions, PaymentIntents,
Customers and Refunds, write; everything else off.

Worth doing as its own change, independent of this one. It reduces the blast
radius of the existing integration, not just the new code.

## Decided

- **Minimum contribution: $10.** Below that the processing fee is a
  meaningful fraction of the contribution.
- **Only rostered players may contribute.** No paying into a team you have
  not joined; it keeps authorization and cancellation simple, and nobody
  wants it.
- **The balance is visible to rostered players only.** Not to other teams and
  not publicly — what a team paid, and who paid it, is their business.
- **A team with the money but not the players is not registered.** It holds
  its authorizations and keeps recruiting. If it reaches ten signed players
  before twelve other teams complete, it locks in automatically; if twelve
  others get there first, its holds are released and it does not field a
  team.

- **Registration is irreversible.** Once a team is in, it is in for the
  season; only an admin can reverse it, and that path settles the money.
- **Any unregistered team holding money is settled** when twelve teams
  register or the window closes — cancelled if still authorized, refunded if
  the expiry net captured it.

That last one about recruiting settles the ordering: **teams are ranked by when they satisfy
both conditions**, not by when their money arrived. Paying first buys nothing
on its own.

## The twelve-team cap has to move first

The cap is enforced by `onTeamRegistrationChange`, which counts registered
teams after the fact and deletes the rest. Three properties make it unfit to
decide a race for money, all pinned in
`tests/integration/registration-lock.test.ts`:

- Nothing stops a thirteenth team registering — the cap is never consulted
  when a team's `registered` flag is set.
- The lock's guard is an exact `!== 12`, so two teams completing together
  both see thirteen and neither locks. Registration stays open silently.
- It is a Firestore trigger: it runs after the write and can retry, so it can
  never be authoritative about who was twelfth.

Today that costs a team a spot it thought it had. Under this design it means a
thirteenth team is holding authorized funds that should never have been
committed. **The cap must be enforced in the same transaction that registers a
team**, before any of this ships. See the roadmap entry.

## Resolved: holds and the seven-day window

A team can authorize $1,000 and still be hunting its tenth signed player a
week later. Rather than let the hold lapse and ask for payment again, the
authorization is captured shortly before it would expire, and refunded if the
team ultimately does not play. See "A hold must never be allowed to expire".

That trades a rare refund fee for never burdening a contributor, which is the
right way round. The free cancellation still applies to the failure that
actually happens most — losing the race for the twelfth spot, which resolves
in minutes.

## Account setup

What the Stripe account needed, and where each item stands.

- **Webhook events — done.** The endpoint receives
  `checkout.session.completed`, `payment_intent.canceled`,
  `payment_intent.succeeded` and `charge.refunded`.
- **The "Team Registration" Product — not needed.** The callable creates it
  on first use under the fixed id `mwl_team_registration`.
- **`automatic_delayed` capture — no longer needed.** It would have captured
  a hold about six hours before it lapsed. The hourly sweep does the same
  job, a day ahead, so there is nothing to request.
- **Extended authorizations — not worth asking for.** They need IC+ pricing
  and add 0.08% on Visa, to solve a problem the sweep already solves.
- **A restricted API key — optional, recommended.** The Functions use the
  account's full secret key. A key scoped to Checkout Sessions,
  PaymentIntents, Customers, Products and Refunds (write) shrinks the blast
  radius of a leaked key. Stripe does not let keys be created through its
  API, so this is a Dashboard step; swapping it in is then one
  `firebase functions:secrets:set STRIPE_SECRET_KEY`.
- **The statement descriptor — worth a look.** A $1,000 hold nobody
  recognises becomes a dispute, which costs the fee _and_ the amount. It
  should read as the league.

The two design questions this section once listed — whether registration can
be reversed, and what deleting a team does to its money — are settled:
registration is irreversible, and a team holding money cannot be deleted.

## Implementation order

Each phase is shippable and leaves the system working. Nothing before phase 3
touches money.

### Phase 0 — prerequisites

**0a. Make the twelve-team cap transactional. — done.**
`updateTeamRegistrationStatus` now claims a spot inside a transaction against
`seasons/{seasonId}.registeredTeamCount`, and registration is irreversible.
Covered by `tests/integration/team-registration-cap.test.ts`, including five
teams racing for two spots. The counter is backfilled on all four production
seasons.

~~**0a. Make the twelve-team cap transactional.**~~
`updateTeamRegistrationStatus` currently sets `registered` from the roster
count with no cap, and the cap is a trigger that tidies up afterwards. Under
money that lets a thirteenth team commit funds it should never have been
asked for.

Put a counter on the season — `registeredTeamCount` — and register inside a
transaction:

```
read seasons/{seasonId}.registeredTeamCount
if count >= 12                      -> do not register
else                                -> set registered = true, increment count
```

Firestore transactions make that atomic, and the twelfth spot goes to whoever
wins it. Twelve registrations a season means no contention worth worrying
about. `onTeamRegistrationChange` keeps its cleanup job — deleting the teams
that did not make it — but stops being the thing that decides.

This is a prerequisite, not a follow-up. Do it first, on its own, while it is
still cheap to get wrong.

**0b. Move waiver issuance to roster join. — done.**
`onRosterEntryCreated` fires on
`teams/{teamId}/teamSeasons/{seasonId}/roster/{playerId}` and issues the
waiver, which catches every route onto a roster because they all write that
document. `onPaymentCreated` now only marks a player paid. The send itself
lives in `shared/waivers.ts`, shared with the admin sender, and is idempotent
on (player, season) so a retry or a team merge cannot double-send.

**0c. Give `deleteTeamSeasonWithCleanup` the no-orphan invariant. — done.**
A team-season with unsettled contributions cannot be deleted, which covers
three of the four deletion paths through their shared chokepoint.
`mergeTeams` is the fourth and refuses outright rather than moving money
whose PaymentIntent metadata names the old team.

**0d. Decide the testing approach** — see below. Worth settling before there
is code to retrofit.

### Phase 1 — the ledger, still no money

**1a. The ledger itself. — done.** `shared/contributions.ts` records a
contribution keyed on its PaymentIntent id. The arithmetic — what is
committed, what is still live — is pure and tested without a database. (It
first also kept running totals on the team-season; see the data model for
why they went.)

**1b. The registration rule. — done.** A season opts in by setting
`teamRegistrationTotalCents`; its presence selects the model and carries the
amount, so the two cannot disagree. Under it, `updateTeamRegistrationStatus`
counts players who have _signed_ and requires the committed total. Seasons
without the field keep the per-player rule unchanged.

It also needed a trigger nobody had planned for.
`updateTeamRegistrationOnContributionChange` recomputes registration when the
ledger changes. The existing recomputes fire on roster and waiver changes
only, so a team that signed its players in advance and then paid — the
common case this whole change is for — would have had its money arrive last
and never registered.

### Phase 2 — taking money — done

`createTeamContributionCheckout` opens a Checkout session for a hold, and the
webhook records it in the ledger, which fires the contribution trigger and
registers the team if that was the last thing missing. Nothing is captured
yet — that is phase 3 — and no season sets `teamRegistrationTotalCents`, so
the callable refuses every request in production until cutover.

Decisions made while building it:

- **The client never names a team.** The callable reads it from the
  caller's player-season and confirms it against the roster entry; a
  request carrying a `teamId` has it ignored.
- **No admin bypass of the registration window.** The per-player checkout
  lets admins pay at any time. Money that arrives after the window can only
  be sent back, so here the window applies to everyone.
- **Cards only.** Every card network supports manual capture, and the
  hold's expiry is read from the card details on the charge.
- **Sessions expire after 31 minutes**, just over Stripe's floor. The
  balance an amount was checked against goes stale while the payer is on
  Stripe's page; the extra minute absorbs clock drift, since Stripe rejects
  anything under thirty minutes by its own clock.
- **Two teammates can both pay the last $200.** Refusing that would need a
  reservation system for a race that costs nothing: the excess is a hold,
  and settlement releases it.
- **The ledger is insert-only.** `recordContribution` leaves an existing
  entry untouched, so a webhook Stripe redelivers after capture cannot wind
  the status back to authorized. Status changes go through
  `setContributionStatus` alone.
- **Money that cannot be attributed is released in the webhook.** A team
  deleted while its payer was on the Checkout page is not protected by the
  deletion guard — the money is not in its ledger yet — so the webhook
  cancels the hold (or refunds a capture) rather than retrying forever
  against a team that is gone. Incomplete metadata is handled the same way.
- **The amount comes from Stripe.** The webhook records the PaymentIntent's
  capturable amount, read from a fresh retrieve rather than the event, so a
  redelivery after settlement sees the settled state.

It also closed an open redirect in the existing per-player checkout, which
passed client-supplied return URLs to Stripe unchecked. Both callables now
share `shared/returnUrls.ts`: the league's domains, the Firebase Hosting
defaults and this project's preview channels, plus localhost under the
emulator only.

Phase 3 needs the Stripe webhook endpoint subscribed to more than
`checkout.session.completed` — at least `payment_intent.canceled`,
`payment_intent.amount_capturable_updated` and `charge.refunded` — so a hold
that is cancelled, expires or is refunded outside our code still reaches the
ledger.

### Phase 3 — the capture and settlement lifecycle

**Prerequisite: triggers that retry. — done.** No trigger set `retry: true`,
so every one that rethrew "so the trigger retries" was never retried, and a
recompute lost during the race was simply gone. The five whose lost run
loses something now retry, a suite requires every trigger to be classified,
and CI deploys with `--force` behind a guard that still refuses deleting or
re-triggering a function. See `.claude/rules/functions.md`.

**3a. Settlement on registration and on the lock. — done.** One idempotent
operation, `settleTeamSeason`, brings a team's money into line with where
the team stands, and everything that can change that calls it:

| Where it runs                                | What it does                                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| `onTeamRegistrationChange`, for the new team | Captures exactly the total, oldest first; releases the rest   |
| the same trigger, when the twelfth registers | Releases every unregistered team's money, then deletes it     |
| the contribution trigger, on a new hold      | Releases a hold that landed too late; leaves a live one alone |
| the webhook, on Dashboard or bank changes    | Corrects the ledger to what Stripe says                       |

The decisions are a pure planner (`shared/settlement.ts`) with no Stripe in
it; the executor (`services/teamSettlementService.ts`) reads each
PaymentIntent before acting, keys every write, and records what Stripe
reports afterwards rather than what it asked for.

Decisions made while building it:

- **Oldest contributions are charged first.** In an overpaid team, whoever
  committed earliest pays, and whoever piled on after the team was covered
  is released. Ties break on PaymentIntent id so concurrent settlements
  plan identically.
- **A partial capture keeps the original amount on record** as
  `authorizedAmountCents`.
- **Contributions are whole dollars.** A remainder can then never fall
  below Stripe's 50-cent minimum, so settlement never has to choose between
  overcharging and writing money off. A season total that is not whole
  dollars is refused at checkout.
- **A team whose release fails is not deleted.** The cascade releases each
  losing team separately, deletes only those that succeeded, and throws so
  the retry picks up the rest.
- **A registered team that ends up short is logged, not unregistered.**
  Registration is irreversible; a hold the bank released after the team got
  in is for a person to chase.
- **Deleting a team-season leaves its contributions in place**, so the
  record of whose hold was released survives the cascade.

The Stripe webhook endpoint now handles `payment_intent.canceled`,
`payment_intent.succeeded` and `charge.refunded` for team contributions.
The endpoint is subscribed to those events.

**3b. The clock, and the backstops. — done.** The codebase's first scheduled
functions, both in `triggers/scheduled/`:

- **`sweepTeamPaymentsHourly`** settles every team holding money, in every
  season on team payments. Settlement already decides from the current time
  what money should be doing, so this is what releases unregistered teams
  once registration closes and captures a hold in the last day before it
  would expire. Nothing new decides anything.
- **`reconcileTeamPaymentsDaily`** checks Stripe and the ledger against each
  other at 04:00. A hold Stripe has and the ledger does not is taken in
  exactly as the checkout webhook would have — recorded, or released if its
  team is gone — and logged as an error, since finding one means an event
  was lost. A live ledger entry Stripe disagrees with is corrected, which
  matters because registration counts committed money: a lapsed hold must
  stop counting.

**`releaseTeamContribution`** is the admin's manual release: it cancels a
hold or refunds a capture, and records who did it, when and why. It checks
Stripe first, so if the money is not where the ledger says, the ledger is
corrected and nothing is claimed. It does not touch registration.

Decisions made while building it:

- **A failed sweep is not retried by the scheduler.** The next hourly run is
  the retry; the failed one throws so it shows in the logs.
- **Past seasons are swept too.** A hold from last season is still money,
  whichever season is newest.
- **The checkout webhook and the reconciliation share one intake**
  (`services/teamContributionIntake.ts`), so a hold found late is treated
  exactly like one found on time.

Phase 3 is complete.

### Phase 4 — UI

**4a. Privacy first. — done.** The team-season totals were public, which would
have shown every team's balance to anyone; they are gone, and the ledger has
a read rule for the roster and admins. The hourly sweep now finds teams by
their live holds, and past seasons whose money is all settled cost a query
per team and nothing more.

**4b. Left:** the team payment page — balance, remaining, contribute, and each
contribution's state — and the admin view of a team's ledger with the manual
release.

### Phase 5 — cutover

Turn the flag on for the new season. The old rule stays available for any
season still using it.

## Testing this without a payment processor

The integration suite runs offline against the emulators, and it should stay
that way. Hitting Stripe's sandbox from CI means network, keys and rate
limits, for tests that would still not be deterministic.

**Keep the money decisions out of the Stripe-calling code.** Given a team's
contributions and its roster, deciding what to capture, what to cancel and
for how much is a pure function. Written that way it can be tested
exhaustively against the emulator — the overpayment race, partial capture,
expiry ordering, a team that fails after capture — with no payment processor
in sight. The Stripe layer on top is then thin enough to cover by mocking the
SDK, the way `payment-trigger.test.ts` already mocks Dropbox Sign.

Reserve Stripe test mode for a small set of manual checks that the API shapes
are right: that a manual-capture session really does produce
`requires_capture`, that `capture_before` is populated, that a partial capture
releases the rest.

**Rehearse the race before registration day.** Seed the emulator with fifteen
teams completing within a few seconds of each other and confirm that exactly
twelve register, that the other three are cancelled rather than refunded, and
that no team ends up registered without the full amount. That rehearsal is
worth more than any single test in the suite, because the failure it is
looking for only appears under concurrency.

## Migration

The rule changes between seasons, so existing seasons keep their data. Past
`playerSeasons.paid` values stay as a historical record. The contributions
ledger starts empty and is only populated for seasons using the new model —
add a per-season flag so both rules can coexist while the change is proven.
