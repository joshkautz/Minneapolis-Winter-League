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

### The seven-day window is the real constraint

A card authorization lasts **7 days** for online payments. Registration
windows have run **15 to 31 days**, so a hold cannot simply wait for the
window to close.

[Extended authorizations](https://docs.stripe.com/payments/extended-authorization)
go up to 30 days, and at first glance solve this. They do not, quite:

- They require **IC+ pricing**. On blended pricing (which this account almost
  certainly uses) you have to ask Stripe for access.
- Visa adds **0.08% per transaction** outside hotel, lodging, vehicle rental
  and cruise categories. A sports league is outside them.
- **American Express only supports lodging and vehicle rental**, so Amex
  contributions would not get the extended window at all.
- The compliance note says extended windows are intended for cases where you
  do not know the final amount at authorization time. We do know it.

Worth a conversation with Stripe, not worth designing around.

**So: accept the 7-day window and let holds expire.** A contribution that is
still uncaptured after 7 days is released automatically and the contributor is
never charged. That is the correct outcome — the team did not come together,
so nobody should pay.

What this needs is honesty in the UI. A contributor must see, at the time of
paying and afterwards, that their money is _held, not taken_, and the date the
hold releases. `capture_before` on the charge gives the exact deadline; read it
rather than assuming seven days.

Do **not** auto-capture a hold that is about to expire for an incomplete team.
That converts a free release into a payment you will have to refund at cost,
for a team that is not playing.

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
  status: 'authorized' | 'captured' | 'released' | 'canceled'
  paymentIntentId: string
  captureBefore: Timestamp       // from the charge; when the hold expires
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

## Open questions

1. **Minimum contribution?** Suggested $10, so the processing fee stays a sane
   fraction of it.
2. **Can a player contribute before joining a roster?** Suggested no — it
   makes authorization and cancellation much simpler.
3. **A team that authorizes $1,000 but never reaches ten signed players.**
   The holds expire after 7 days and release themselves, which is the safe
   default. Is that the behaviour you want, or should the team be able to
   re-authorize and keep trying?
4. **Who can see the team's balance?** Suggested: any rostered player, since
   they are the ones being asked to chip in.
5. **Does the twelve-team cap get enforced in code?** Today it appears to be
   managed by hand. If registration becomes a race, the cap probably needs to
   be a real check — and that decides whether a thirteenth team's holds are
   cancelled automatically.

## Migration

The rule changes between seasons, so existing seasons keep their data. Past
`playerSeasons.paid` values stay as a historical record. The contributions
ledger starts empty and is only populated for seasons using the new model —
add a per-season flag so both rules can coexist while the change is proven.
