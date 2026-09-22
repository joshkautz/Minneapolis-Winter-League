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
  authorizedCents: number        // sum of holds not yet captured or released
  capturedCents: number          // money actually taken
  registered: boolean            // recomputed from the rule above

teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}
  player: DocumentReference<PlayerDocument>
  amountCents: number
  status: 'authorized' | 'captured' | 'refunded' | 'canceled'
  paymentIntentId: string
  captureBefore: Timestamp       // from the charge; capture before this
  createdAt: Timestamp
```

The contributions subcollection is the source of truth; the two totals are
denormalized and recomputed in the same transaction that writes a
contribution. That mirrors the roster and player-season pairing already in the
codebase, and the same rule applies — never write one side without the other.

Note that the registration test uses **authorized**, not captured: a team
secures its spot when the money is committed, and capture follows.

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

That last one settles the ordering: **teams are ranked by when they satisfy
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

## Migration

The rule changes between seasons, so existing seasons keep their data. Past
`playerSeasons.paid` values stay as a historical record. The contributions
ledger starts empty and is only populated for seasons using the new model —
add a per-season flag so both rules can coexist while the change is proven.
