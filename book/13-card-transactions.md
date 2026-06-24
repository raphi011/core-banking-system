# Chapter 13 — Card Transactions

A card payment is another payment scheme, no more magical than the credit transfer
we traced in Chapter 11. But it has a different *shape* than SEPA. When you tap or
swipe, the first thing that happens is not a posting at all — it is an
**authorization**, and an authorization is exactly the **hold** of Chapter 7: a
real-time reservation against your available balance that moves no money and leaves
your book balance untouched. The money moves later, in a separate step. Two
structural differences set cards apart from the SEPA flows, and the whole chapter is
about them: there are more parties involved, and there is a deliberate gap between
the moment a payment is *authorized* and the moment it is actually *settled*.

## The four-party model

A SEPA payment is, at heart, a two-party affair: a debtor's bank and a creditor's
bank, money pushed or pulled from one to the other. A card payment routes the same
debtor → creditor flow through **four** parties plus a network that connects them.

- The **cardholder** — you — who owns the card and the deposit account behind it.
- The **issuer** — the cardholder's bank, which issued the card. The issuer is the
  one that authorizes a purchase against your account and ultimately *debits* you.
- The **merchant** — the shop or website being paid.
- The **acquirer** — the merchant's bank, which "acquires" the transaction on the
  merchant's behalf and ultimately *credits* the merchant.
- The **card network** (or **scheme**) — Visa, Mastercard, and their peers — which
  sits between the issuer and the acquirer, carrying messages each way and computing
  what the banks owe one another.

Lining up who faces whom makes the shape clear. The cardholder faces the merchant
(the purchase). The issuer faces the acquirer through the network (the interbank
leg). And each bank faces its own customer: the issuer debits the cardholder, the
acquirer credits the merchant. The network is the hub the two banks meet at — it
never holds the money, it just connects the issuer's side to the acquirer's side and,
at the end of the day, tells each bank its net position, exactly the way the clearing
cycle of Chapter 11 did. SEPA had the two banks meeting at a central bank; cards add
a scheme in the middle that routes the messages and runs the netting, but the
underlying motion is still one customer's balance falling and another's rising.

## Authorization → presentment

The defining feature of a card payment is that it happens in two messages, separated
in time. This is the **dual-message** flow.

The first message is the **authorization**. At the point of sale, the terminal asks
the issuer, in real time: *will you stand behind this amount?* The issuer checks the
cardholder's available balance and account state, and if all is well, it approves —
and places a **hold**. This is the authorization–capture pattern of Chapter 7,
arriving exactly on cue. No money moves. The cardholder's **book balance is
unchanged**; only the **available balance** drops by the authorized amount, so the
funds can't be spent twice while the purchase is in flight. The approval travels back
to the terminal, the cardholder walks out with the goods, and yet nothing has been
posted to any ledger at all.

The second message comes later — often that night, sometimes a day or two on — when
the merchant, through its acquirer, submits the **presentment** (also called the
*clearing record*): the formal claim that says *this sale really happened, here is
the final amount, please pay.* It is on presentment that the issuer turns the hold
into a real posting. The hold is **captured**, and the captured amount becomes the
**debtor leg** of an actual transaction — the cardholder's deposit liability is
debited for the settled amount, just as a captured hold became a real posting in
Chapter 7:

```
Issuer:  Debit  Cardholder (Liability)        4500   // available was already reduced; now the book balance falls
         Credit Clearing Suspense (Liability) 4500   // the issuer now owes the network, in flight
```

From here the payment is an ordinary in-flight debtor leg, parked in clearing
suspense, waiting for the cycle to settle — which is the next section's business.

Not every card transaction is split in two. The **single-message** variant fuses
authorization and clearing into one step, with no separate presentment to follow. The
familiar case is a **PIN debit** purchase or an **ATM** withdrawal: you enter your
PIN, the issuer approves *and* commits the debit in the same breath, and the money is
gone immediately rather than held and captured later. There is no gap to manage
because authorization and clearing are the same message. The mental model collapses
to a single posting at the moment of approval — closer in feel to an instant payment
than to the held-then-captured purchase above. Most card purchases are dual-message;
the single-message path is the exception that proves how the two halves of the flow
are normally distinct steps that merely happen, here, to coincide.

## Authorized ≠ final amount

The two-message gap creates a possibility SEPA never had: the amount *authorized* and
the amount eventually *captured* can differ. This is not a bug — it is the whole
reason the held amount is provisional. A hold reduces the *available* balance, not the
*book* balance (Chapter 7), so the issuer can reserve an estimate now and settle the
truth later, and the books are never wrong in the meantime because nothing was posted.

Three everyday cases show the gap at work.

- **The gas-pump pre-authorization.** This is the canonical example from Chapter 7.
  The pump can't know how much fuel you'll buy, so it authorizes a fixed estimate —
  say a $100 hold — before a drop is pumped. When you finish at $45, the presentment
  captures $45, and the remaining $55 of reservation is released. The hold was a
  placeholder; only the capture was real.

- **The restaurant tip.** A waiter brings the check, you authorize the meal, and
  *then* you write in a tip on the slip. The captured amount comes in *higher* than
  what was authorized — the tip is added after the authorization — and the issuer
  honors it. The authorization established that you were good for roughly this much;
  the final amount adjusted within an expected tolerance.

- **Partial and incremental captures.** A single authorization need not be settled all
  at once. A merchant shipping an order in two boxes may take a **partial capture**
  for the part that shipped, leaving the rest of the hold to be captured or released
  later. A hotel that authorized a room for three nights and then watched you order
  room service may add an **incremental** authorization, raising the hold before the
  final capture. The reservation flexes; the ledger only records the amounts actually
  settled.

In every case the same discipline from Chapter 7 holds: the reservation lives off the
ledger and can be adjusted, expired, or released freely, and the ledger learns the
final figure exactly once, at capture. The account *states* of Chapter 8 govern this
path too. An authorization is a debit-side request, so a **frozen** account blocks it —
the issuer refuses the authorization outright, no hold is placed, and the purchase is
declined at the terminal, the same way a frozen account blocks any new debit.

## Reusing the rails

Here is the quiet payoff. Once a hold is captured, a card payment stops being special.
The captured amount is now an ordinary **debtor → creditor** flow — the cardholder's
issuer owes, the merchant's acquirer is owed — and from that point it nets and settles
through the exact machinery of Chapter 11. Card networks compute each bank's net
position over a cycle and settle the net, just as SEPA does; the issuer's clearing
suspense drains into a central-bank reserve move, the acquirer's fills the merchant's
account, and the books reconcile by the mirror-image rule we have leaned on
throughout. Clearing and settlement (Chapters 9–11) need no new mechanism for cards;
the authorization was the only genuinely new idea, and we already had it as a hold.

This is also why a card scheme is a small extension rather than a new system. Our
reference library already models authorization as holds and already has capture, so a
full card scheme would extend from there — adding the four-party routing and the
presentment step on top of machinery that, underneath, is unchanged.

And with that, the journey of Part IV is complete. We have followed money from a
single balanced entry in one bank's book all the way to final settlement across an
interbank network, and through every scheme that moves it — a credit transfer pushed,
a direct debit pulled, an instant payment settled gross, and now a card payment
authorized, captured, cleared, and settled. The motion is finished. The last part of
the book steps back from *movement* to *records*: how a bank snapshots its balances at
the close of each day, keeps an unbreakable audit trail of everything that ever
happened, and distills it all into the statements that are the only part of this
machinery a customer ever sees.
