# Team-level payment design

Live since 2026 Fall. It covers how a team reaches a **$1,000 collective
total** paid by any combination of its players, replacing the old rule that
ten individual players must each pay $100.

It began as a proposal, and parts of it read as one; the implementation
order at the end records how it was built. One decision changed after it was
built: contributions were first held on the card and charged only when the
team registered, and since September 2026 they are charged immediately — see
"Charging on contribution".

## Why

Charging per player punishes teams for carrying a full roster: twenty players
pay twice as much as ten for the same number of minutes on the field. A fixed
team price removes that, and lets a team coordinate outside the app — pool the
money, have one person pay the lot the moment registration opens, and secure
one of the twelve spots.

## The shape of the solution

Three decisions carry the design:

1. **Inline pricing**, so the server decides the amount rather than the payer.
2. **Charge on contribution, refund what is not kept**, so every payer
   follows one rule: you pay now, and you get it back if your team does not
   play.
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

## Charging on contribution

Every contribution is charged when the payer completes Checkout. Settlement
then refunds whatever the league should not keep:

| Outcome                                   | What happens                                  |
| ----------------------------------------- | --------------------------------------------- |
| Team registers having paid exactly $1,000 | Nothing                                       |
| Team registers having paid more           | The excess is refunded, latest payments first |

The second row is a safety net rather than a flow: checkout stops a team
paying more than its total (see "Two teammates cannot pay the same
dollars"), so it only happens if a payment is recorded late.
| Team misses the twelve-spot cut | Everything is refunded |
| Registration closes without the team | Everything is refunded, within the hour |
| A payer leaves before the team registers | That payer is refunded |
| A payer leaves after the team registers | Nothing: registration is final |

**Stripe keeps its processing fee on a refund** — about $29.30 on $1,000 at
the standard 2.9% + 30¢ — and the league bears it.

### Why not card holds

The first version held every contribution on the card
(`capture_method: 'manual'`) and charged only a team that registered, because
cancelling an uncaptured hold is free where a refund is not. It was built,
tested and deployed, and replaced before any real money moved, for two
reasons.

- **A hold lasts about a week; registration lasts a month.** Visa,
  Mastercard, Amex and Discover all allow 7 days for an online payment. A
  team still recruiting after that had to be charged early rather than let
  the hold lapse, and refunded if it then missed out — so payers were
  charged at different times for reasons they could not see, which is
  exactly the confusion a hold was meant to avoid.
- **Extended holds do not cover every card.** Stripe can extend a hold to
  about 30 days, but for a business like ours only on Visa and Mastercard —
  Amex and Discover limit it to travel and lodging
  ([online](https://docs.stripe.com/payments/extended-authorization),
  [in person](https://docs.stripe.com/terminal/features/extended-authorizations))
  — and only on IC+ pricing or by request.

The league chose one rule every payer can follow over the fees a hold would
have saved. The saving was also smaller than it looked: most teams that miss
out lose the race for the twelfth spot, and would have been refunded anyway
by the time a slow week had passed.

### Two teammates cannot pay the same dollars

A Checkout session stays open for at least thirty minutes, so the balance a
contribution was checked against goes stale while the payer is on Stripe's
page. Two players who both see "$200 remaining" could both pay it, and the
later $200 would be refunded with its fee lost.

So opening a checkout **reserves** its amount
(`services/teamCheckoutReservations.ts`). What anyone else may pay is the
total, less what the roster has paid, less what teammates have reserved.
Every reservation for a team-season is on one document,
`teams/{t}/teamSeasons/{s}/checkouts/open`, so claiming one is a
single-document transaction that Firestore serialises: of two teammates
racing for the last $200, exactly one gets it, and the other is told a
teammate is paying it.

A reservation ends when:

- its payment is recorded, by the checkout webhook or the reconciliation;
- its payer comes back from Stripe without paying — the App calls
  `cancelTeamContributionCheckout`, which also closes the session at Stripe;
- its payer opens another checkout, which closes the first: one open
  checkout per payer, so their own never blocks them;
- its payer leaves the team, or the season fills without the team — the
  session is closed, so nobody pays for a team they are not playing on;
- its session expires. Expiry is not taken on trust: a reservation past its
  time is checked against Stripe before it stops counting, and if its
  session completed but the webhook has not arrived, the payment is taken
  in on the spot.

The cost is that someone who opens Checkout and walks away holds their
amount until the session expires, half an hour at most. The team's payment
card shows what teammates are paying right now, and when a held amount
frees up.

If money beyond the total ever is recorded, which of it is the excess is
decided when the team registers, oldest first: whoever paid earliest keeps
their payment, and a payer who has left is kept last.

### What the UI actually has to say

Shown above the pay button and on Stripe's page:

> Your card is charged now. If you leave the team before it registers, or it
> does not get one of the 12 spots, you are refunded in full. Refunds take 5
> to 10 business days to reach your card.

A payer should know before paying when they get their money back, and a
charge nobody expected is the one that gets disputed.

### Statement descriptors matter more than usual

A $1,000 line nobody recognises becomes a dispute, which costs the fee _and_
the amount. The account's
[statement descriptor](https://docs.stripe.com/get-started/account/statement-descriptors)
reads "MINNEAPOLIS MALLARD".

## Data model

Money becomes a team-season concern, so it needs a ledger. A single running
total is not enough: refunding a team, or one payer, needs to know who paid
what.

```
teams/{teamId}/teamSeasons/{seasonId}
  registered: boolean            // public, like the rest of the team-season

teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}
  player: DocumentReference<PlayerDocument>
  amountCents: number            // still held; what was paid, once refunded
  paidAmountCents?: number       // what was first paid, after a partial refund
  status: 'paid' | 'refunded'
  paymentIntentId: string
  refundedBy?, refundReason?, refundedAt?   // an admin's manual refund
  createdAt: Timestamp

teams/{teamId}/teamSeasons/{seasonId}/checkouts/open
  reservations: {                // checkouts open on Stripe right now
    [reservationId]: { player, amountCents, sessionId, expiresAt, createdAt }
  }
```

The contributions subcollection is the only record of a team's money. **It is
private**: `firestore.rules` lets the team's roster for that season and
admins read it, and nobody else — not other teams, not the public, and not
anyone through a collection-group query.

That is why there are no totals on the team-season. Team-season documents are
world-readable, so a running total there would publish every team's balance.
An earlier version kept running totals there, in step with the ledger; they
were removed before any season used team payments. Anything that needs a
total sums the ledger.

The registration test counts money **paid by people still on the roster**:
a payer who has left is being refunded, and must not register a team they
are not on.

### The registration rule, stated exactly

Two independent conditions, both on the team:

```ts
const registered =
	signedPlayerCount >= 10 && // roster members who have signed a waiver
	paidByRosterCents >= 100_000 // paid by people still on the roster
```

- **A player is registered when they sign their waiver.** Nothing else — not
  payment, not merely being on a roster.
- **A team is registered when it has ten registered players and $1,000
  paid**, in any split, by any of its rostered players.

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
there is no way to un-register a team and leave $1,000 kept against it.

## Returning money that should not be kept

Three events oblige the league to give money back. The first two apply to
any team holding contributions that has not registered:

1. **Twelve other teams register.** The season is full; every unregistered
   team is settled.
2. **The registration window closes.** Anything still unregistered is
   settled.
3. **A payer leaves a team that has not registered** — on their own, or
   removed by a captain. They are refunded the moment they go (the roster
   trigger settles the team), and their money stops counting toward the
   total at once, so a team can never register on the money of someone not
   on it. It also stops reducing what their former teammates may put in.

Once a team has registered, registration is final, and a payer who leaves
afterwards stays charged: their money helped secure the spot. Settlement
keeps the money of the people still on the team first and a leaver's only
for any gap, so a leaver whose payment was never needed is refunded.

Settling is always a refund, in full or in part, and Stripe keeps its
processing fee on each.

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
  a team-season still holding money cannot be deleted. Everything
  upstream then inherits it.
- **`mergeTeams` moves contributions to the winning team**, the way it
  already moves roster entries and badges — or refuses when the losing team
  holds money, which is simpler and almost certainly rare enough.
- **A reconciliation job** lists recent paid team PaymentIntents with no
  matching ledger entry, and takes them in or refunds them. A backstop, not a
  mechanism: if it ever finds something, an event was lost.

Both deletion paths need a test that a team with outstanding money cannot be
deleted, because this is exactly the kind of guarantee that decays when
someone adds a fifth path.

### This needs scheduled functions

Refunding unregistered teams when the registration window closes runs on a
clock rather than in response to a write, and so does the daily
reconciliation. They were the codebase's first `onSchedule` functions, and
take the same care as the triggers: pinned region, idempotent by
construction (settling an already-settled team is a no-op), and honouring the
migration kill-switch.

## Two consequences that are easy to miss

### "Fully registered player" has to stop meaning "paid"

Confirmed. A player counts toward the ten when they are **on the roster and
have signed their waiver**. Money moves entirely to the team level, and
`playerSeasons.paid` stops being part of the registration test.

Suggested: keep `paid` as a record of whether that person contributed money —
useful for a captain chasing their team — but remove it from every gate.

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

### Use a restricted key — done

`STRIPE_SECRET_KEY` is a
[restricted API key](https://docs.stripe.com/keys/restricted-api-keys) scoped
to what the Functions actually call, listed in `.claude/rules/functions.md`.
A new kind of Stripe call needs its permission added in the Dashboard.

## Decided

- **Minimum contribution: $10.** Below that the processing fee is a
  meaningful fraction of the contribution.
- **Only rostered players may contribute.** No paying into a team you have
  not joined; it keeps authorization and cancellation simple, and nobody
  wants it.
- **The balance is visible to rostered players only.** Not to other teams and
  not publicly — what a team paid, and who paid it, is their business.
- **A team with the money but not the players is not registered.** It keeps
  its money and keeps recruiting. If it reaches ten signed players before
  twelve other teams complete, it locks in automatically; if twelve others
  get there first, it is refunded and does not field a team.

- **Registration is irreversible.** Once a team is in, it is in for the
  season; only an admin can reverse it, and that path settles the money.
- **Any unregistered team holding money is refunded** when twelve teams
  register or the window closes.

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
thirteenth team is holding money that should never have been taken. **The cap must be enforced in the same transaction that registers a
team**, before any of this ships. See the roadmap entry.

## Resolved: holds and the seven-day window

Contributions are no longer holds; see "Why not card holds".

## Account setup

What the Stripe account needed, and where each item stands.

- **Webhook events — done.** The team flow needs
  `checkout.session.completed` and `charge.refunded`; the product and price
  events mirror the catalog. The endpoint also still receives
  `payment_intent.canceled` and `payment_intent.succeeded`, from the hold
  design, which the handler now ignores. It is on API version `2026-08-26.dahlia`, the SDK's, since
  September 2026; see "Changing the Stripe API version" in
  `.claude/rules/functions.md`.
- **The "Team Registration" Product — not needed.** The callable creates it
  on first use under the fixed id `mwl_team_registration`.
- **`automatic_delayed` capture and extended authorizations — not needed.**
  Both would only have kept holds alive longer; contributions are no longer
  holds.
- **A restricted API key — done, September 2026.** `STRIPE_SECRET_KEY` is a
  restricted key; the account's standard secret key was rolled. Its
  permissions are listed in `.claude/rules/functions.md`.
- **The statement descriptor — done.** It reads "MINNEAPOLIS MALLARD"; a
  charge nobody recognises becomes a dispute.

The two design questions this section once listed — whether registration can
be reversed, and what deleting a team does to its money — are settled:
registration is irreversible, and a team holding money cannot be deleted.

## Implementation order

Each phase is shippable and leaves the system working. Nothing before phase 3
touches money.

This is the record of how it was built, and phases 2 to 4 describe the hold
design: authorize, capture on registration, capture before expiry. That was
replaced in September 2026 by charging on contribution, which kept the
ledger, the triggers, the sweep and the reconciliation and reduced
settlement to refunds.

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

**0b. Decouple waivers from payment. — done.** `onPaymentCreated` now only
marks a player paid. Waivers were first issued through Dropbox Sign when a
player joined a roster; since September 2026 players sign them in the app,
before or after joining a team (`docs/WAIVERS.md`).

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
- **Admins may pay before the window opens, never after it closes.** An
  admin can try the whole flow with a real card ahead of opening day, and
  refund it from the Payments dialog; Stripe keeps its fee. Money that
  arrives after the window can only be sent back, so the close applies to
  everyone. (The per-player checkout lets admins pay at any time.)
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
| the roster trigger, when someone leaves      | Releases a leaver's money if the team has not registered      |
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

**4b. Registration status. — done.** Under team payments a player registers
by signing, but the App assumed paid-and-signed everywhere: roster badges,
the profile's task count and payment section, the waiver section's
precondition, and the admin waiver button. All now
follow the season's rule through `App/src/shared/utils/team-payments.ts`,
which mirrors the server's rules for the page to explain itself.

**4c. The payment page. — done.** A card on My Team, for seasons on team
payments only: money committed and players signed against what is needed,
each contribution with its state (a partial capture shows what was first
held), and a whole-dollar contribution form with the hold explained above
the button. It says plainly when the team is registered, when the season has
filled, and when registration has closed, and in the last two that any money
is released automatically. The profile points players there instead of
offering an individual payment.

Admins get a Payments dialog per team on the team management page, with the
manual release behind a required reason and a warning that a registered team
will be left short. That release is also how a registered team gets its money
back: the page never offers to delete a registered team, only unregistered
ones in the current season (`deleteUnregisteredTeam`, which is told the
season and refuses any other).

The home page's "How to Register" steps were reordered to match what now
happens in every season — join a team, then sign the waiver it triggers —
with the payment step worded for the season's pricing.

### Phase 5 — cutover

Before setting `teamRegistrationTotalCents` on the new season:

- **Rewrite the home page's season copy.** It is hardcoded for the last
  per-player season — "$100 for 7 weeks", refunds for players who do not find
  a team, "ten fully registered players". Under team payments those are wrong.
- **Set the total on the season.** The admin season form has a Pricing
  control — per player, or per team with a total in whole dollars. Once any
  team in the season holds money, the pricing cannot change.
- **Rehearse the race** described under testing, on the emulators. Done 24
  September 2026 with `scripts/rehearse-registration-race.js`.

Turn the flag on for the new season. The old rule stays available for any
season still using it.

## Testing this without a payment processor

The integration suite runs offline against the emulators, and it should stay
that way. Hitting Stripe's sandbox from CI means network, keys and rate
limits, for tests that would still not be deterministic.

**Keep the money decisions out of the Stripe-calling code.** Given a team's
contributions and its roster, deciding what to keep, what to refund and
how much is a pure function. Written that way it can be tested exhaustively
— the overpayment race, a partial refund, a payer who left, a team that
misses out — with no payment processor in sight. The Stripe layer on top is then thin enough to cover by mocking the
SDK.

Reserve a real payment for the few checks that the API shapes are right: that
a completed session produces a `succeeded` PaymentIntent carrying the
metadata, and that a refund nets out of the charge. An admin can make one
before registration opens, and refund it from the admin payments dialog.

**Rehearse the race before registration day.** Seed the emulator with fifteen
teams completing within a few seconds of each other and confirm that exactly
twelve register, that the other three are refunded in full, and that no team
ends up registered without the full amount. That rehearsal is
worth more than any single test in the suite, because the failure it is
looking for only appears under concurrency.

`scripts/rehearse-registration-race.js` does it through the real callables
and triggers: 150 players, fifteen teams with $1,000 paid each, nine waivers
per team, then the tenth on all fifteen at once. Its header has the commands.
The emulator cannot reach Stripe (a live key is refused there), so it proves
the cap, not settlement: the three losers keep their money and stay in
place, the path taken when a refund fails. The first run, on 24 September 2026, registered exactly twelve.

**Drive the whole flow, not just its pieces.**
`tests/integration/team-collective-payment.test.ts` does what players do —
open Checkout, finish on Stripe's page, sign, leave — through the real
callables and webhook, and fires every trigger production would until
nothing changes. It covers several payers funding one team, the
overpayment race, a partial refund, and leaving before and after
registration. The fake Stripe it runs on models Checkout, so a completed
session produces the payment Stripe would.

## Migration

The rule changes between seasons, so existing seasons keep their data. Past
`playerSeasons.paid` values stay as a historical record. The contributions
ledger starts empty and is only populated for seasons using the new model —
add a per-season flag so both rules can coexist while the change is proven.
