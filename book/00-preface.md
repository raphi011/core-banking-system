# Preface

Most people use banks every day without ever seeing how they work on the inside.
We deposit a paycheck, tap a card, send a transfer — and money seems to simply
appear in one place and vanish from another. But underneath that smooth surface
is a centuries-old discipline of bookkeeping, a precise vocabulary, and a set of
mechanisms for moving value between institutions that almost never fail and
almost never lose a cent.

This book explains that machinery from the ground up. It assumes no accounting
background. It starts with the single rule that all of banking is built on —
that money never appears or disappears, it only moves — and follows that rule
all the way out to the interbank networks where banks settle their debts with
one another through accounts at a central bank.

The examples are concrete and the numbers add up, because the ideas here are also
implemented as a small, working banking library. Where it helps, the text shows
how a real system models a concept. But the subject of this book is the domain,
not any particular program: what banks track, why they track it that way, and how
money actually moves.

## What you'll learn

- Why the money in your checking account is the bank's *debt*, not its asset.
- How a 500-year-old technique — double-entry bookkeeping — makes errors
  detectable by construction.
- The difference between the day a transaction is *recorded* and the day it
  takes *economic effect*, and why banks need both.
- Why your "available balance" can differ from your "current balance," and what a
  hold really is.
- What actually happens, account by account, when you send money to someone at a
  different bank — and why "clearing" and "settlement" are not the same thing.
- How banks move millions of payments while only transferring the *net* between
  themselves.
