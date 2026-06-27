# Quiz Diversification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the 14-chapter quiz bank from 139 lopsided questions (heavy on "a customer deposit is a liability") to ~280 diverse, de-duplicated questions — ~20 per chapter — with diversity enforced as a vitest invariant.

**Architecture:** Diversity is locked in two layers. (1) A *global concept blueprint* (in this plan) assigns each of the 41 `HintKey` concepts a home chapter, so no idea is re-taught 14×. (2) A *parametrized diversity test* (`diversity.test.ts`) encodes the rubric per chapter; each chapter is then rewritten until its test case is green. Per-chapter rewrites are independent — ideal for one subagent per chapter.

**Tech Stack:** TypeScript, vitest 3 (`npm test` → `vitest run`), Next.js 16 `web/` app. Quiz data is plain typed objects under `web/src/lib/quiz/chapters/NN-*.ts`.

## Global Constraints

These apply to **every** task below.

- **Source of truth for facts:** each chapter's `book/NN-*.md` plus `README.md` (repo root). No invented mechanics, fees, or figures. Explanations must be traceable to those sources.
- **No engine/type changes:** do not touch `types.ts`, `session.ts`, `storage.ts`, `index.ts`, the runner UI, `hint-content.ts`, `README.md`, or `book/*.md`. Quiz is web-only → **no `make book`**.
- **Valid `concept` tags only** — one of these 41 `HintKey`s (or omit `concept`):
  `double-entry, normal-balance, account-type-asset, account-type-liability, account-type-equity, account-type-revenue, account-type-expense, ledger-vs-subledger, amount-cents, idempotency-key, reversal, booking-date, value-date, balance-book, balance-holds, balance-available, overdraft, holds, hold-capture, hold-release, account-status, scheme-direction-push, scheme-direction-pull, settlement-model-net, settlement-model-gross, requires-mandate, allows-return, settlement-delay, mandate, payment-lifecycle, debtor-leg, creditor-leg, clearing-vs-settlement, netting, net-positions, reserve-account, central-bank-reserves, clearing-suspense, snapshot, statement, statement-amount`
- **Valid `explore.href`** (optional field) ∈ `/`, `/payments`, `/mandates`, `/cycles`, `/settlements`, `/central-bank`, `/schemes`.
- **Every question sets `difficulty`** (`"intro" | "core" | "challenge"`) and a unique `id` of the form `chN-qM` (M sequential within the chapter).
- **Per-chapter rubric (target ~20 questions):**
  - Kinds: ~10 `mc` · ~4 `truefalse` · ~3 `multi` · ~3 `numeric`.
  - Difficulty: ~5 `intro` · ~10 `core` · ~5 `challenge` (all three tiers MUST appear).
  - Concepts: **aim ≥10 distinct tags, hard floor 8; no single tag > 3×.**
  - Mix the **six cognitive angles**: ①recognition ②mechanism/postings ③numeric calculation ④discrimination (X vs Y) ⑤edge case / failure mode ⑥scenario / cross-chapter callback.
- **Numeric questions:** `kind: "numeric"`, `unit: "dollars"`, `tolerance: 0`, prompt ends "(Enter a number of dollars.)". Internally money is integer cents but learners answer in whole dollars.
- **"Deposit = liability" idea appears ≤3× across the WHOLE quiz** — concentrate it in Chapter 1.
- **Reuse** the strongest existing questions (verbatim or lightly edited) rather than discarding them.
- **Canonical question shapes** (copy these structures exactly):

```ts
// multiple choice
{
  kind: "mc",
  id: "ch7-q4",
  difficulty: "core",
  concept: "balance-available",
  prompt: "An account shows a book balance of $1,000 with a $200 hold. A merchant tries to capture $250. What happens?",
  options: [
    "Declined — available balance is only $800",
    "Approved — book balance is $1,000",
    "Approved, pushing the account $50 negative",
    "Held a second time, stacking to $450 in holds",
  ],
  answer: 0,
  explanation:
    "[[balance-available]] = book − holds = $1,000 − $200 = $800. A $250 capture exceeds available funds and is declined, even though the [[balance-book|book balance]] looks sufficient.",
}

// numeric (dollars, exact)
{
  kind: "numeric",
  id: "ch2-q9",
  difficulty: "core",
  concept: "double-entry",
  prompt: "A customer deposits $100 cash. By how many dollars do the bank's total assets increase? (Enter a number of dollars.)",
  answer: 100,
  unit: "dollars",
  tolerance: 0,
  explanation:
    "Cash (an [[account-type-asset]]) rises $100 and the deposit [[account-type-liability]] rises $100. Total assets increase by **$100**.",
}
```

- **Chapter-task recipe** (every chapter task, Tasks 2–15, follows this exact 5-step cycle; only the parameters differ):
  1. Read `book/NN-*.md`, the matching `README.md` section, and the current `web/src/lib/quiz/chapters/NN-*.ts` (to harvest reusable questions).
  2. Rewrite that one file's `questions` array to ~20 questions meeting the rubric, using only the chapter's **home concepts** plus ≤1 callback per earlier concept, keeping the `Chapter` wrapper (`slug`, `number`, `part`, `title`) unchanged.
  3. `npm run typecheck` (from `web/`) → clean.
  4. `npx vitest run src/lib/quiz/diversity.test.ts -t "Chapter NN"` → that chapter's cases PASS.
  5. Commit: `git add web/src/lib/quiz/chapters/NN-*.ts && git commit -m "feat(quiz): diversify chapter NN"`.

## Global concept blueprint (home chapters)

| Ch | Home concepts (taught here; 2–3 questions each) |
|----|--------------------------------------------------|
| 01 What a Bank Is | `account`*, `account-type-asset`, `account-type-liability`, `account-type-equity` — *(`account` has no hint key; tag those questions with the closest type or omit)* |
| 02 Double-Entry | `double-entry`, `normal-balance`, `reversal` |
| 03 Chart of Accounts | `account-type-revenue`, `account-type-expense`, `normal-balance` (applied), `account-type-asset`/`-liability` (callback) |
| 04 Ledgers & Subledgers | `ledger-vs-subledger`, `amount-cents` |
| 05 Transactions & Postings | `idempotency-key`, `reversal`, `double-entry` (applied), `amount-cents` (callback) |
| 06 Booking vs Value Date | `booking-date`, `value-date` |
| 07 Balances & Holds | `balance-book`, `balance-holds`, `balance-available`, `holds`, `hold-capture`, `hold-release` |
| 08 Lifecycle & Overdraft | `account-status`, `overdraft` |
| 09 Clearing & Settlement | `clearing-vs-settlement`, `settlement-delay`, `clearing-suspense`, `settlement-model-net`, `settlement-model-gross`, `netting`, `net-positions` |
| 10 Interbank Network | `reserve-account`, `central-bank-reserves`, `net-positions` (applied) |
| 11 Payment Schemes | `scheme-direction-push`, `scheme-direction-pull`, `requires-mandate`, `allows-return`, `payment-lifecycle`, `debtor-leg`, `creditor-leg` |
| 12 SEPA | `mandate`, `requires-mandate`, `allows-return`, `payment-lifecycle`, `scheme-direction-pull` (callback) |
| 13 Card Transactions | `holds`, `hold-capture`, `hold-release`, `scheme-direction-pull`, `payment-lifecycle`, `reversal` (refund callback) |
| 14 Snapshots, Audit, Statements | `snapshot`, `statement`, `statement-amount`, `booking-date`/`value-date` (callback) |

> Narrow chapters (06, 08) reach the ≥8 distinct-concept floor via the angle-⑥ integration callbacks; the ≤3-per-concept cap still applies to callbacks.

---

### Task 1: Diversity test (the rubric as code)

**Files:**
- Create: `web/src/lib/quiz/diversity.test.ts`

**Interfaces:**
- Consumes: `chapters`, `allQuestions` from `./index`; `hintContent` from `@/components/hint-content`; `Chapter`, `Question` from `./types`.
- Produces: nothing imported elsewhere — it is a test-only module.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";

import { chapters, allQuestions } from "./index";
import type { Chapter, Question } from "./types";

function conceptCounts(ch: Chapter): Map<string, number> {
  const m = new Map<string, number>();
  for (const q of ch.questions) {
    if (q.concept) m.set(q.concept, (m.get(q.concept) ?? 0) + 1);
  }
  return m;
}

const tier = (n: number) => `Chapter ${String(n).padStart(2, "0")}`;

describe("quiz diversity — per chapter", () => {
  for (const ch of chapters) {
    describe(`${tier(ch.number)} — ${ch.title}`, () => {
      it("has ~20 questions (18–22)", () => {
        expect(ch.questions.length).toBeGreaterThanOrEqual(18);
        expect(ch.questions.length).toBeLessThanOrEqual(22);
      });

      it("uses no single concept tag more than 3×", () => {
        for (const [concept, n] of conceptCounts(ch)) {
          expect(n, `${concept} used ${n}× in ch${ch.number}`).toBeLessThanOrEqual(3);
        }
      });

      it("spans at least 8 distinct concept tags", () => {
        expect(conceptCounts(ch).size).toBeGreaterThanOrEqual(8);
      });

      it("includes all three difficulty tiers", () => {
        const tiers = new Set(ch.questions.map((q) => q.difficulty));
        for (const t of ["intro", "core", "challenge"] as const) {
          expect(tiers.has(t), `ch${ch.number} missing "${t}"`).toBe(true);
        }
      });
    });
  }
});

describe("quiz diversity — global", () => {
  const all = allQuestions();
  const byKind = (k: Question["kind"]) => all.filter((q) => q.kind === k).length;

  it("has roughly double the questions (≥ 250)", () => {
    expect(all.length).toBeGreaterThanOrEqual(250);
  });

  it("keeps a healthy kind mix", () => {
    expect(byKind("numeric")).toBeGreaterThanOrEqual(35);
    expect(byKind("multi")).toBeGreaterThanOrEqual(40);
    expect(byKind("truefalse")).toBeGreaterThanOrEqual(45);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails against today's bank**

Run (from `web/`): `npx vitest run src/lib/quiz/diversity.test.ts`
Expected: FAIL — current chapters have 10 questions (not 18–22), Chapter 1 exceeds the concept cap, and global counts fall short. This is the red baseline.

- [ ] **Step 3: Commit the test**

```bash
git add web/src/lib/quiz/diversity.test.ts
git commit -m "test(quiz): enforce per-chapter diversity rubric"
```

> Note: this suite stays red until Tasks 2–15 land; each chapter task turns its own cases green, and Task 16 confirms the global block.

---

### Tasks 2–15: Rewrite chapters 01–14

Each task **follows the Chapter-task recipe** in Global Constraints with the parameters in the row below. Deliverable: that chapter's `questions` array rewritten to ~20 questions meeting the rubric, its diversity test case green, typecheck clean, committed.

| Task | Ch | File | Book source | Home-concept budget & angle notes |
|------|----|------|-------------|-----------------------------------|
| 2 | 01 | `chapters/01-what-a-bank-is.ts` | `book/01-what-a-bank-is.md` | assets/liabilities/equity + accounting equation. This is the ONLY home for "deposit = liability" (≤3 here). Angles: recognition (asset vs liability), calculation (equation solves), edge case (withdrawal leaves equity unchanged), discrimination (deposit vs loan). |
| 3 | 02 | `chapters/02-double-entry-bookkeeping.ts` | `book/02-double-entry-bookkeeping.md` | `double-entry`, `normal-balance`, `reversal`. Angles: mechanism (which side debits/credits), numeric (Δ assets/liabilities), edge case (unbalanced entry rejected), reversal undo. |
| 4 | 03 | `chapters/03-the-chart-of-accounts.ts` | `book/03-the-chart-of-accounts.md` | `account-type-revenue`, `account-type-expense`, `normal-balance` applied; callbacks to asset/liability/equity. Angles: classification, normal-balance lookup, expanded-equation calc. |
| 5 | 04 | `chapters/04-ledgers-subledgers-and-money.ts` | `book/04-ledgers-subledgers-and-money.md` | `ledger-vs-subledger`, `amount-cents`. Angles: hierarchy (GL vs subledger), money representation (cents vs dollars rounding), discrimination, calculation. |
| 6 | 05 | `chapters/05-transactions-and-postings.ts` | `book/05-transactions-and-postings.md` | `idempotency-key`, `reversal`, posting mechanics, `amount-cents` callback. Angles: idempotency (duplicate request), reversal, balanced postings, failure mode. |
| 7 | 06 | `chapters/06-booking-date-vs-value-date.ts` | `book/06-booking-date-vs-value-date.md` | `booking-date`, `value-date` (deep). Reach ≥8 via callbacks: `value-date`→`balance-available`, `settlement-delay`, `statement`, `reversal`. Angles: discrimination (booking vs value), scenario (back-dated value date), calculation (interest by value date). |
| 8 | 07 | `chapters/07-balances-and-holds.ts` | `book/07-balances-and-holds.md` | `balance-book`, `balance-holds`, `balance-available`, `holds`, `hold-capture`, `hold-release`. Angles: calculation (available = book − holds), lifecycle (place→capture→release), edge case (capture > available). |
| 9 | 08 | `chapters/08-account-lifecycle-and-overdraft.ts` | `book/08-account-lifecycle-and-overdraft.md` | `account-status`, `overdraft` (deep). Reach ≥8 via callbacks: `balance-available`, `holds`, `reversal`, `account-type-asset`. Angles: state transitions, overdraft limit math, edge case (post to closed/frozen account). |
| 10 | 09 | `chapters/09-clearing-and-settlement.ts` | `book/09-clearing-and-settlement.md` | `clearing-vs-settlement`, `settlement-delay`, `clearing-suspense`, `settlement-model-net`, `settlement-model-gross`, `netting`, `net-positions`. Angles: discrimination (clearing vs settlement, net vs gross), netting calculation, suspense mechanics. |
| 11 | 10 | `chapters/10-the-interbank-network.ts` | `book/10-the-interbank-network.md` | `reserve-account`, `central-bank-reserves`, `net-positions` applied; callbacks to `netting`, `settlement-delay`. Angles: mirror balances (asset vs central-bank liability), settlement via reserves, calculation. |
| 12 | 11 | `chapters/11-payment-schemes.ts` | `book/11-payment-schemes.md` | `scheme-direction-push`, `scheme-direction-pull`, `requires-mandate`, `allows-return`, `payment-lifecycle`, `debtor-leg`, `creditor-leg`. Angles: push vs pull discrimination, lifecycle states, return windows. |
| 13 | 12 | `chapters/12-sepa.ts` | `book/12-sepa.md` | `mandate`, `requires-mandate`, `allows-return`, `payment-lifecycle`; `scheme-direction-pull` callback. Angles: mandate scenarios (SDD), return/refund rules, SCT vs SDD discrimination. |
| 14 | 13 | `chapters/13-card-transactions.ts` | `book/13-card-transactions.md` | `holds`, `hold-capture`, `hold-release`, `scheme-direction-pull`, `payment-lifecycle`, `reversal` (refund). Angles: auth→capture lifecycle, refund vs reversal, edge case (auth expiry), calculation (partial capture). |
| 15 | 14 | `chapters/14-snapshots-audit-and-statements.ts` | `book/14-snapshots-audit-and-statements.md` | `snapshot`, `statement`, `statement-amount`; `booking-date`/`value-date` callbacks. Angles: snapshot purpose (audit/replay), statement ordering, statement-amount calculation. |

Each task's concrete steps (shown here for Task 2; Tasks 3–15 are identical with the row's parameters):

- [ ] **Step 1:** Read `book/01-what-a-bank-is.md`, the relevant `README.md` section, and `web/src/lib/quiz/chapters/01-what-a-bank-is.ts`.
- [ ] **Step 2:** Rewrite the `questions` array to ~20 questions per the rubric and the Task-2 budget; keep `slug`/`number`/`part`/`title`. Use the canonical question shapes.
- [ ] **Step 3:** `npm run typecheck` → clean.
- [ ] **Step 4:** `npx vitest run src/lib/quiz/diversity.test.ts -t "Chapter 01"` → PASS (all 4 cases).
- [ ] **Step 5:** `git add web/src/lib/quiz/chapters/01-what-a-bank-is.ts && git commit -m "feat(quiz): diversify chapter 01"`.

---

### Task 16: Global verification & consistency pass

**Files:**
- Modify (status line only): `docs/superpowers/specs/2026-06-27-quiz-diversification-design.md`

- [ ] **Step 1: Full test suite green (per-chapter + global + existing)**

Run (from `web/`): `npm test`
Expected: PASS — `diversity.test.ts` (per-chapter + global blocks), `index.test.ts`, `session.test.ts`, `storage.test.ts` all green.

- [ ] **Step 2: Typecheck, lint, build**

Run (from `web/`): `npm run typecheck && npm run lint && npm run build`
Expected: all clean (build is the final gate).

- [ ] **Step 3: Consistency read-through**

Read all 14 `chapters/NN-*.ts`. Confirm: no near-duplicate prompts across chapters (esp. "deposit = liability" ≤3 total), consistent tone, every explanation traceable to `book/`/`README.md`, wiki-links resolve to real `HintKey`s. Fix any drift and re-run `npm test`.

- [ ] **Step 4: Mark the spec implemented & commit**

Edit the spec's `**Status:**` line to `Implemented 2026-06-27`.

```bash
git add docs/superpowers/specs/2026-06-27-quiz-diversification-design.md
git commit -m "docs: mark quiz-diversification spec implemented"
```

---

## Self-Review

**1. Spec coverage:**
- Full rewrite per chapter → Tasks 2–15. ✔
- ~20 even per chapter → rubric + `[18,22]` test. ✔
- Diversity enforced as test → Task 1 (`diversity.test.ts`). ✔
- Numeric = dollars/exact → Global Constraints + canonical shape. ✔
- Global concept blueprint (kills liability over-test) → blueprint table + per-chapter budgets + ≤3 cap + ≤3 global liability rule. ✔
- Six cognitive angles → Global Constraints + per-chapter angle notes. ✔
- Grounding in book/README → recipe Step 1 + Task 16 Step 3. ✔
- No engine/type/book/hint changes; no `make book` → Global Constraints. ✔
- Verification (typecheck/lint/build/vitest) → Task 16. ✔

**2. Placeholder scan:** Concrete `concept` list, explore routes, test code, commands, and per-chapter budgets are all spelled out. The per-question *content* is authored at execution (generative work), bounded by the rubric + canonical shapes + grounding source + the green-test gate — not a placeholder but a verifiable spec.

**3. Type consistency:** `Chapter`/`Question` shapes match `types.ts`; `concept` values ⊂ the 41 `HintKey`s; numeric uses `unit`/`tolerance` exactly as typed; test imports (`chapters`, `allQuestions`) match `index.ts` exports. ✔

> Caveat surfaced for execution: `account` appears in the blueprint but is **not** a valid `HintKey`. Chapter-1 questions about "what an account is" must either omit `concept` or tag the nearest valid type — noted in the Task-2 row.
