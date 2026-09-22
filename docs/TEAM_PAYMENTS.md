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

## What Stripe gives us

### Use inline pricing, not pay-what-you-want

Stripe has a purpose-built "customer chooses price" feature:
[`custom_unit_amount`](https://docs.stripe.com/payments/checkout/pay-what-you-want)
on a Price, with optional `preset`, `minimum` and `maximum`. The payer types
the amount into Stripe's own checkout page.

**Do not use it here.** Three reasons, in order of severity:

1. **It cannot be combined with discounts or promotion codes.** The
   returning-player coupon (`returningPlayerCouponId` on each season) would
   stop working.
2. **`minimum` and `maximum` live on the Price**, so they are fixed for
   everyone. We need "at most what this team still owes", which changes per
   team and per minute.
3. **The amount is chosen inside Stripe's UI**, so our server first learns of
   it in the webhook — after the money has moved. Validation after the fact is
   not validation.

Use [inline pricing](https://docs.stripe.com/products-prices/how-products-and-prices-work#inline-pricing)
instead: the amount is chosen in _our_ UI, validated by _our_ server, and
passed to Stripe as `price_data.unit_amount` when the Checkout Session is
created.

```ts
await stripe.checkout.sessions.create(
	{
		mode: 'payment',
		customer: stripeCustomerId,
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: 'usd',
					// Server-computed. Never the raw value from the client.
					unit_amount: amountCents,
					product: seasonConfig.teamRegistrationProductId,
				},
			},
		],
		payment_intent_data: {
			metadata: { firebaseUID, seasonId, teamId, kind: 'team_registration' },
		},
		metadata: { firebaseUID, seasonId, teamId, kind: 'team_registration' },
		success_url,
		cancel_url,
	},
	{ idempotencyKey: `team_reg_${teamId}_${seasonId}_${nonce}` }
)
```

Inline prices create throwaway `Price` objects that do not appear in the
Dashboard catalog. That is fine and expected — the `Product` stays stable and
is what shows on the receipt.

### It is not a donation

A donation is money given without receiving goods or services. This is payment
for a roster spot in a league. Stripe has
[separate requirements for accepting tips and donations](https://support.stripe.com/questions/requirements-for-accepting-tips-or-donations),
and describing league fees as donations would misrepresent the business to the
processor and to the payer.

Model it as a Product — "Team Registration" — with inline amounts. Do not set
Checkout's `submit_type` to `donate`.

### `adjustable_quantity` is the wrong shape

Checkout can let the payer change the quantity of a line item, so a $100 price
with `adjustable_quantity` would let someone buy "5 player slots" for $500.
It is tidy, but it forces every contribution to be a multiple of $100 and
rules out the "twenty players at $50" case in the brief.

### Manual capture is the interesting one

[Separate authorization and capture](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
(`payment_intent_data.capture_method = 'manual'`) places a hold rather than
taking the money. Capture it when the team completes; cancel it if they never
do. **Cancelling an uncaptured authorization is free, whereas Stripe does not
return the processing fee on a refund.** Stripe explicitly recommends this for
businesses that refund close to the time of transaction.

The blocker is the window. A card authorization lasts **7 days** online, and
our registration windows have run **15 to 31 days**. Holding every partial
contribution until the window closes is not possible.

It is still usable, but only behind a business rule: _a team has 7 days from
its first contribution to reach $1,000._ That is a product decision, not a
technical one. See "Open questions".

## Data model

Money becomes a team-season concern, so it needs a ledger. A single running
total is not enough: refunds need to know who paid what.

```
teams/{teamId}/teamSeasons/{seasonId}
  amountPaidCents: number        // denormalized running total
  registered: boolean            // recomputed from the rule below

teams/{teamId}/teamSeasons/{seasonId}/contributions/{paymentIntentId}
  player: DocumentReference<PlayerDocument>
  amountCents: number
  status: 'pending' | 'paid' | 'refunded' | 'canceled'
  paymentIntentId: string
  createdAt: Timestamp
```

The contributions subcollection is the source of truth; `amountPaidCents` is a
denormalized sum, recomputed in the same transaction that writes a
contribution. That mirrors how the roster and player-season already work, and
the same rule applies — never write one without the other.

### The registration rule

```ts
const registered =
	signedPlayerCount >= TEAM_CONFIG.MIN_PLAYERS_FOR_REGISTRATION &&
	amountPaidCents >= TEAM_CONFIG.REGISTRATION_TOTAL_CENTS // 100_000
```

`updateTeamRegistrationStatus` already recomputes registration from the roster.
It gains the second clause and changes what it counts — see below.

## Two consequences that are easy to miss

### "Fully registered player" has to stop meaning "paid"

Today a player counts toward the ten when they are **paid and signed**. If one
person pays $1,000, nobody else on the roster is paid, so under the current
rule the team has one qualifying player and can never register.

So the ten must become **ten players who are on the roster and have signed the
waiver**. Money moves to the team level entirely; `playerSeasons.paid` stops
being part of the registration test.

That leaves a question about what `paid` means at all. Suggested: keep it as a
record of whether _that person_ contributed money, useful for refunds and for
a captain chasing their team, but remove it from any gate.

### The waiver trigger has to move

`onPaymentCreated` currently sends a player their waiver when they pay. If one
person pays for the whole team, **the other nineteen never get a waiver** — and
since registration now needs ten signed players, the team cannot register.

Waiver issuance must move off payment and onto something every player does.
Joining a roster is the natural trigger: `updateTeamRoster` and the offer
acceptance path both already write membership.

This is the largest piece of work in the change and the one most likely to
break quietly, because the failure mode is a waiver that never arrives rather
than an error anyone sees.

## Refunds

Money will need returning. A team that collects $600 and never reaches $1,000
cannot be left holding it, and a team that completes but misses the twelve-spot
cut needs the whole $1,000 back.

Stripe does not return the original processing fee on a refund, so a $600
refund costs the league roughly $17.70 that it never sees again.

Three options:

|                                                     | Cost of returning money               | Constraint                               |
| --------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| **A. Capture immediately, refund later**            | ~2.9% + 30¢ per refund, unrecoverable | None                                     |
| **B. Manual capture, cancel if incomplete**         | Free                                  | 7-day authorization window               |
| **C. Require 10 signed players before any payment** | Refunds become rare                   | Defeats "pay instantly to secure a spot" |

**Recommendation: A**, with a first-class admin refund action and a scheduled
job that flags incomplete teams when registration closes. It has no constraint
on how long a team takes, and the cost is small and rare — most teams will pay
in one transaction, which is the entire point of the change.

B is worth revisiting if partial payments turn out to be common. It is a real
saving, but it buys that saving by putting a 7-day clock on every team.

C is the cheapest and the worst: it removes the speed that motivated this.

## Security

The amount is now attacker-controlled input, which it was not before.

- **Never trust a client-supplied amount.** The server computes the maximum
  from the team's live remaining balance and rejects anything above it. The
  client may _propose_ an amount; the server decides.
- **Enforce a floor** so the processing fee cannot exceed the contribution.
- **Re-derive everything in the webhook** from `metadata`, and treat the
  metadata as the only trusted channel. The session's amount is authoritative
  for what was charged; the team it applies to comes from metadata that our
  server set.
- **Idempotency keys** on session creation, and idempotent webhook handling
  keyed on the PaymentIntent id — Stripe retries.
- **Authorization**: only a player on that team's roster for that season may
  contribute to it. Captains are not special here; any rostered player can pay.

### The race worth thinking about

Two players both see "$200 remaining" and both pay $200. Both succeed, and the
team has paid $1,200.

Reserving the balance is possible but adds a whole expiry mechanism for a rare
case. Simpler and honest: **allow the overpayment, record it, and refund the
excess.** The team is registered either way, which is the outcome both payers
wanted. Surface the overage in the admin UI so it gets returned.

## Open questions

These need answers before implementation, and most are product decisions
rather than technical ones.

1. **Does the returning-player discount survive?** It is currently a per-player
   coupon on a $100 price. Against a team total it could become a reduced team
   price, a credit, or be dropped. This has to be decided — it cannot be
   carried over unchanged.
2. **Minimum contribution?** Suggested $10, so the processing fee stays a sane
   fraction.
3. **Can a player contribute before joining a roster?** Suggested no; it makes
   refunds and authorization much simpler.
4. **What happens to a team that pays $1,000 but never reaches ten signed
   players?** Refund, or hold and let them recruit until the deadline?
5. **Is there a deadline for completing a partial payment**, separate from the
   registration window close? Required if option B is ever chosen.
6. **Who can see the team's balance?** Suggested: any rostered player, since
   they are the ones being asked to chip in.

## Migration

The rule changes between seasons, so existing seasons keep their data. Past
`playerSeasons.paid` values stay as a historical record. `amountPaidCents` and
the contributions ledger start empty and are only populated for seasons using
the new model — add a per-season flag so both rules can coexist while the
change is proven.
