# Learn / Quiz Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive, per-chapter quiz section ("Learn") inside the existing `web/` app — practice mode with immediate feedback, four question formats, a typed question bank, and deep-links into the concept sidebar and explorer pages.

**Architecture:** A pure, unit-tested engine (`src/lib/quiz/`: typed question bank + seeded session/scoring + localStorage progress) is consumed by client React components (`src/components/quiz/`) and three App-Router pages (`/learn`, `/learn/[chapter]`, `/learn/mixed`). Questions are typed data objects, validated by a vitest test, so adding one is a one-object edit the compiler checks. The existing concept sidebar (`useConceptPanel`) and `ConceptMarkdown` are reused — no new sidebar code.

**Tech Stack:** Next.js 16 (App Router, client components + `useParams`) · React 19 · TypeScript · Tailwind v4 (no config; tokens in `globals.css`; full default palette available) · shadcn/ui · vitest.

## Global Constraints

- **No new dependencies.** Use only what `web/package.json` already has.
- **Tailwind v4 syntax:** gradients use `bg-linear-to-r` (not `bg-gradient-to-r`); colors come from the default palette (`indigo`, `amber`, `teal`, `violet`, `emerald`) plus the theme tokens (`primary`, `muted`, `destructive`, …). Dark mode via the `dark:` variant.
- **Client pages:** every page file starts with `"use client";`; dynamic route params come from `useParams()` (Next 16 — do not `await` params in a page).
- **Path alias:** import app modules via `@/…` (`@/*` → `web/src/*`). Run all commands from `web/`.
- **Content policy:** question *content* is domain-first (answerable from understanding, never "click X in the app"); the *scaffolding* (concept tag, explore link, `[[wiki-links]]`) is app-enrichment.
- **`concept` must be a real `HintKey`** (from `@/components/hint-content`) — the compiler and the bank test both enforce this.
- **`explore.href` must be one of the network-level routes** in `EXPLORE_ROUTES` (`/`, `/payments`, `/mandates`, `/cycles`, `/settlements`, `/central-bank`, `/schemes`) — never a participant-scoped (`/participants/[pid]/…`) route.
- **Do not restyle the rest of the app.** The "lively" treatment (gradient hero, colored type badges, rings, streak) is scoped to `/learn` only.
- **All amounts** in numeric questions declare a `unit` (`"dollars"` or `"cents"`) and the prompt states the unit.

---

### Task 1: Quiz engine — types & seeded session logic

**Files:**
- Create: `web/src/lib/quiz/types.ts`
- Create: `web/src/lib/quiz/session.ts`
- Test: `web/src/lib/quiz/session.test.ts`

**Interfaces:**
- Consumes: `HintKey` from `@/components/hint-content`.
- Produces:
  - `types.ts`: `QuestionKind`, `Difficulty`, `Question` (discriminated union on `kind`), `Chapter`.
  - `session.ts`: `Response` (union on `kind`), `SessionItem { question: Question; optionOrder: number[] }`, `mulberry32(seed: number): () => number`, `shuffle<T>(input, rng): T[]`, `buildSession(questions, seed, limit?): SessionItem[]`, `isCorrect(q, r): boolean`, `ScoreResult { correct; total; missed: Question[] }`, `score(items, responses): ScoreResult`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/quiz/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  mulberry32,
  shuffle,
  buildSession,
  isCorrect,
  score,
  type Response,
} from "./session";
import type { Question } from "./types";

const mc: Question = {
  kind: "mc",
  id: "t-mc",
  prompt: "p",
  explanation: "e",
  options: ["a", "b", "c", "d"],
  answer: 2,
};
const tf: Question = { kind: "truefalse", id: "t-tf", prompt: "p", explanation: "e", answer: true };
const multi: Question = {
  kind: "multi",
  id: "t-multi",
  prompt: "p",
  explanation: "e",
  options: ["a", "b", "c"],
  answers: [0, 2],
};
const num: Question = {
  kind: "numeric",
  id: "t-num",
  prompt: "p",
  explanation: "e",
  answer: 100,
  unit: "dollars",
  tolerance: 1,
};

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("shuffle", () => {
  it("returns a permutation (same multiset)", () => {
    const out = shuffle([1, 2, 3, 4, 5], mulberry32(7));
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("buildSession", () => {
  it("is deterministic for the same seed", () => {
    const a = buildSession([mc, tf, multi, num], 123);
    const b = buildSession([mc, tf, multi, num], 123);
    expect(a.map((i) => i.question.id)).toEqual(b.map((i) => i.question.id));
    expect(a[0].optionOrder).toEqual(b[0].optionOrder);
  });

  it("gives mc/multi an option permutation and others an empty order", () => {
    const items = buildSession([mc, tf, multi, num], 9);
    const mcItem = items.find((i) => i.question.id === "t-mc")!;
    expect([...mcItem.optionOrder].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    expect(items.find((i) => i.question.id === "t-tf")!.optionOrder).toEqual([]);
    expect(items.find((i) => i.question.id === "t-num")!.optionOrder).toEqual([]);
  });

  it("respects the limit", () => {
    expect(buildSession([mc, tf, multi, num], 1, 2)).toHaveLength(2);
  });
});

describe("isCorrect", () => {
  it("grades mc by index", () => {
    expect(isCorrect(mc, { kind: "mc", choice: 2 })).toBe(true);
    expect(isCorrect(mc, { kind: "mc", choice: 0 })).toBe(false);
  });
  it("grades truefalse", () => {
    expect(isCorrect(tf, { kind: "truefalse", choice: true })).toBe(true);
    expect(isCorrect(tf, { kind: "truefalse", choice: false })).toBe(false);
  });
  it("grades multi independent of order", () => {
    expect(isCorrect(multi, { kind: "multi", choices: [2, 0] })).toBe(true);
    expect(isCorrect(multi, { kind: "multi", choices: [0] })).toBe(false);
    expect(isCorrect(multi, { kind: "multi", choices: [0, 1, 2] })).toBe(false);
  });
  it("grades numeric within tolerance", () => {
    expect(isCorrect(num, { kind: "numeric", value: 100.5 })).toBe(true);
    expect(isCorrect(num, { kind: "numeric", value: 102 })).toBe(false);
  });
  it("is false for null or mismatched-kind responses", () => {
    expect(isCorrect(mc, null)).toBe(false);
    expect(isCorrect(mc, { kind: "numeric", value: 2 } as Response)).toBe(false);
  });
});

describe("score", () => {
  it("counts correct and collects missed", () => {
    const items = buildSession([mc, tf], 5);
    const responses: (Response | null)[] = items.map((i) =>
      i.question.id === "t-mc" ? { kind: "mc", choice: 2 } : null,
    );
    const r = score(items, responses);
    expect(r.correct).toBe(1);
    expect(r.total).toBe(2);
    expect(r.missed.map((q) => q.id)).toEqual(["t-tf"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/quiz/session.test.ts`
Expected: FAIL — cannot resolve `./session` / `./types`.

- [ ] **Step 3: Write the types**

Create `web/src/lib/quiz/types.ts`:

```ts
import type { HintKey } from "@/components/hint-content";

export type QuestionKind = "mc" | "truefalse" | "multi" | "numeric";
export type Difficulty = "intro" | "core" | "challenge";

interface BaseQuestion {
  /** Stable, globally unique, e.g. "ch2-q3". */
  id: string;
  /** The question text (plain text). */
  prompt: string;
  /** Shown after answering. Supports markdown and [[concept]] wiki-links. */
  explanation: string;
  /** Drives the right sidebar while this question is on screen. */
  concept?: HintKey;
  /** Optional deep-link to a relevant explorer page (network-level routes only). */
  explore?: { href: string; label: string };
  difficulty?: Difficulty;
}

export type Question =
  | (BaseQuestion & { kind: "mc"; options: string[]; answer: number })
  | (BaseQuestion & { kind: "truefalse"; answer: boolean })
  | (BaseQuestion & { kind: "multi"; options: string[]; answers: number[] })
  | (BaseQuestion & {
      kind: "numeric";
      answer: number;
      unit?: "cents" | "dollars";
      /** Accepted absolute deviation from `answer`; defaults to 0. */
      tolerance?: number;
    });

export interface Chapter {
  /** Matches the book filename stem, e.g. "02-double-entry-bookkeeping". */
  slug: string;
  /** 1..14 */
  number: number;
  /** Book Part heading, used to group chapters on the index. */
  part: string;
  title: string;
  questions: Question[];
}
```

- [ ] **Step 4: Write the session logic**

Create `web/src/lib/quiz/session.ts`:

```ts
import type { Question } from "./types";

/** A reader's answer; its shape depends on the question kind. */
export type Response =
  | { kind: "mc"; choice: number }
  | { kind: "truefalse"; choice: boolean }
  | { kind: "multi"; choices: number[] }
  | { kind: "numeric"; value: number };

/** A question prepared for display, with its options pre-shuffled. */
export interface SessionItem {
  question: Question;
  /** Display order of option indices for mc/multi; [] for truefalse/numeric. */
  optionOrder: number[];
}

/** Small deterministic PRNG so (questions, seed) always yields the same session. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function optionCount(q: Question): number {
  return q.kind === "mc" || q.kind === "multi" ? q.options.length : 0;
}

export function buildSession(
  questions: readonly Question[],
  seed: number,
  limit?: number,
): SessionItem[] {
  const rng = mulberry32(seed);
  const ordered = shuffle(questions, rng);
  const chosen = typeof limit === "number" ? ordered.slice(0, limit) : ordered;
  return chosen.map((question) => ({
    question,
    optionOrder: shuffle(
      Array.from({ length: optionCount(question) }, (_, i) => i),
      rng,
    ),
  }));
}

export function isCorrect(q: Question, r: Response | null): boolean {
  if (!r || r.kind !== q.kind) return false;
  switch (q.kind) {
    case "mc":
      return r.kind === "mc" && r.choice === q.answer;
    case "truefalse":
      return r.kind === "truefalse" && r.choice === q.answer;
    case "multi": {
      if (r.kind !== "multi") return false;
      const want = [...q.answers].sort((x, y) => x - y);
      const got = [...r.choices].sort((x, y) => x - y);
      return want.length === got.length && want.every((v, i) => v === got[i]);
    }
    case "numeric":
      return r.kind === "numeric" && Math.abs(r.value - q.answer) <= (q.tolerance ?? 0);
  }
}

export interface ScoreResult {
  correct: number;
  total: number;
  missed: Question[];
}

export function score(
  items: readonly SessionItem[],
  responses: readonly (Response | null)[],
): ScoreResult {
  let correct = 0;
  const missed: Question[] = [];
  items.forEach((item, i) => {
    if (isCorrect(item.question, responses[i] ?? null)) correct++;
    else missed.push(item.question);
  });
  return { correct, total: items.length, missed };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/quiz/session.test.ts`
Expected: PASS (all suites green).

- [ ] **Step 6: Commit**

```bash
cd web && git add src/lib/quiz/types.ts src/lib/quiz/session.ts src/lib/quiz/session.test.ts
git commit -m "feat(quiz): add typed question model and seeded session engine"
```

---

### Task 2: Progress storage (localStorage)

**Files:**
- Create: `web/src/lib/quiz/storage.ts`
- Test: `web/src/lib/quiz/storage.test.ts`

**Interfaces:**
- Produces: `ChapterProgress { bestPct: number; lastPct: number; lastAttempt: string }`, `readProgress(slug, store?): ChapterProgress | null`, `recordResult(slug, pct, now, store?): ChapterProgress`. The optional `store?: Storage` param lets tests inject a fake; in the browser it defaults to `localStorage`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/quiz/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { readProgress, recordResult } from "./storage";

function fakeStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  };
}

describe("progress storage", () => {
  it("returns null when nothing is stored", () => {
    expect(readProgress("02-double-entry-bookkeeping", fakeStore())).toBeNull();
  });

  it("records and reads back a result", () => {
    const s = fakeStore();
    recordResult("02-double-entry-bookkeeping", 80, "2026-06-25T00:00:00.000Z", s);
    expect(readProgress("02-double-entry-bookkeeping", s)).toEqual({
      bestPct: 80,
      lastPct: 80,
      lastAttempt: "2026-06-25T00:00:00.000Z",
    });
  });

  it("keeps the maximum as bestPct but updates lastPct", () => {
    const s = fakeStore();
    recordResult("ch", 80, "t1", s);
    const after = recordResult("ch", 60, "t2", s);
    expect(after.bestPct).toBe(80);
    expect(after.lastPct).toBe(60);
    expect(after.lastAttempt).toBe("t2");
  });

  it("returns null on corrupt JSON", () => {
    const s = fakeStore();
    s.setItem("quiz:ch", "{not json");
    expect(readProgress("ch", s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/quiz/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/quiz/storage.ts`:

```ts
export interface ChapterProgress {
  bestPct: number;
  lastPct: number;
  /** ISO timestamp of the most recent attempt. */
  lastAttempt: string;
}

function keyFor(slug: string): string {
  return `quiz:${slug}`;
}

function resolveStore(store?: Storage): Storage | null {
  if (store) return store;
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function readProgress(slug: string, store?: Storage): ChapterProgress | null {
  const s = resolveStore(store);
  if (!s) return null;
  const raw = s.getItem(keyFor(slug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChapterProgress>;
    if (typeof parsed.bestPct !== "number" || typeof parsed.lastPct !== "number") {
      return null;
    }
    return {
      bestPct: parsed.bestPct,
      lastPct: parsed.lastPct,
      lastAttempt: typeof parsed.lastAttempt === "string" ? parsed.lastAttempt : "",
    };
  } catch {
    return null;
  }
}

export function recordResult(
  slug: string,
  pct: number,
  now: string,
  store?: Storage,
): ChapterProgress {
  const s = resolveStore(store);
  const prev = s ? readProgress(slug, s) : null;
  const next: ChapterProgress = {
    bestPct: Math.max(pct, prev?.bestPct ?? 0),
    lastPct: pct,
    lastAttempt: now,
  };
  if (s) s.setItem(keyFor(slug), JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/quiz/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/lib/quiz/storage.ts src/lib/quiz/storage.test.ts
git commit -m "feat(quiz): add per-chapter localStorage progress"
```

---

### Task 3: Chapter data, assembly & bank validation

**Files:**
- Create: `web/src/lib/quiz/chapters/02-double-entry-bookkeeping.ts` (fully authored exemplar)
- Create: the other 13 chapter files (listed below) with `questions: []`
- Create: `web/src/lib/quiz/index.ts`
- Test: `web/src/lib/quiz/index.test.ts`

**Interfaces:**
- Consumes: `Chapter`, `Question` from `./types`.
- Produces (from `index.ts`): `EXPLORE_ROUTES` (readonly tuple), `chapters: Chapter[]` (ordered 1..14), `getChapter(slug): Chapter | undefined`, `allQuestions(): Question[]`, `mixedQuestions(): Question[]`, `Part { name; chapters }`, `chaptersByPart(): Part[]`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/quiz/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { chapters, allQuestions, getChapter, chaptersByPart, EXPLORE_ROUTES } from "./index";
import { hintContent } from "@/components/hint-content";

const BOOK_SLUGS = [
  "01-what-a-bank-is",
  "02-double-entry-bookkeeping",
  "03-the-chart-of-accounts",
  "04-ledgers-subledgers-and-money",
  "05-transactions-and-postings",
  "06-booking-date-vs-value-date",
  "07-balances-and-holds",
  "08-account-lifecycle-and-overdraft",
  "09-clearing-and-settlement",
  "10-the-interbank-network",
  "11-payment-schemes",
  "12-sepa",
  "13-card-transactions",
  "14-snapshots-audit-and-statements",
];

describe("quiz bank", () => {
  it("has the 14 book chapters, in order, with unique known slugs", () => {
    expect(chapters).toHaveLength(14);
    expect(chapters.map((c) => c.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    const slugs = chapters.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(BOOK_SLUGS).toContain(s);
  });

  it("resolves a chapter by slug", () => {
    expect(getChapter("02-double-entry-bookkeeping")?.number).toBe(2);
    expect(getChapter("nope")).toBeUndefined();
  });

  it("groups every chapter under exactly one part", () => {
    const grouped = chaptersByPart().flatMap((p) => p.chapters);
    expect(grouped).toHaveLength(14);
  });

  it("has globally unique question ids", () => {
    const ids = allQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed questions", () => {
    for (const q of allQuestions()) {
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.explanation.trim().length).toBeGreaterThan(0);
      if (q.kind === "mc") {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
      } else if (q.kind === "multi") {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.answers.length).toBeGreaterThanOrEqual(1);
        expect(new Set(q.answers).size).toBe(q.answers.length);
        for (const a of q.answers) {
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(q.options.length);
        }
      } else if (q.kind === "numeric") {
        expect(Number.isFinite(q.answer)).toBe(true);
      } else {
        expect(typeof q.answer).toBe("boolean");
      }
      if (q.concept) expect(q.concept in hintContent).toBe(true);
      if (q.explore) expect(EXPLORE_ROUTES).toContain(q.explore.href);
    }
  });

  it("ships at least the Chapter 2 exemplar", () => {
    expect(getChapter("02-double-entry-bookkeeping")!.questions.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/quiz/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Author Chapter 2 (the exemplar — all four kinds)**

Create `web/src/lib/quiz/chapters/02-double-entry-bookkeeping.ts`:

```ts
import type { Chapter } from "../types";

export const chapter: Chapter = {
  slug: "02-double-entry-bookkeeping",
  number: 2,
  part: "Part I · The Foundations of Bank Accounting",
  title: "Double-Entry Bookkeeping",
  questions: [
    {
      kind: "mc",
      id: "ch2-q1",
      difficulty: "core",
      concept: "double-entry",
      prompt:
        "A customer deposits $100 in cash. The bank debits its Cash account. What does it credit?",
      options: [
        "The customer's Deposit account — a liability",
        "The bank's Equity account",
        "The customer's Loan account",
        "The bank's Revenue account",
      ],
      answer: 0,
      explanation:
        "Your deposit is the bank's **debt**, not its asset — it owes you the money back. Debit Cash (an asset rises), credit the Deposit (a liability rises); the two sides are equal, so the entry balances. See [[double-entry]] and [[account-type-liability]].",
    },
    {
      kind: "truefalse",
      id: "ch2-q2",
      difficulty: "intro",
      concept: "double-entry",
      prompt: "Every transaction must record equal total debits and total credits.",
      answer: true,
      explanation:
        "This is the single rule of [[double-entry]]: within any transaction the debits and credits are equal, so value is never created or destroyed — it only moves.",
    },
    {
      kind: "truefalse",
      id: "ch2-q3",
      difficulty: "core",
      concept: "normal-balance",
      prompt: "A credit always increases an account's balance.",
      answer: false,
      explanation:
        "Whether a credit raises or lowers a balance depends on the account's type — its [[normal-balance]]. Credits increase liabilities, equity and revenue, but decrease assets and expenses.",
    },
    {
      kind: "mc",
      id: "ch2-q4",
      difficulty: "core",
      concept: "double-entry",
      prompt: "When a trial balance shows total debits equal to total credits, what does that prove?",
      options: [
        "The books are internally balanced",
        "Every transaction is economically correct",
        "No fraud has occurred",
        "Every account has a positive balance",
      ],
      answer: 0,
      explanation:
        "A balanced trial balance proves only that the records are internally consistent — equal debits and credits. It cannot tell you a posting went to the wrong (but still balancing) account. See [[double-entry]].",
    },
    {
      kind: "numeric",
      id: "ch2-q5",
      difficulty: "core",
      concept: "account-type-liability",
      unit: "dollars",
      prompt:
        "A customer deposits $100 in cash. By how many dollars does the bank's total liabilities change? (Enter a number of dollars.)",
      answer: 100,
      explanation:
        "Cash (an asset) rises by $100 and the Deposit (a [[account-type-liability]]) rises by $100. Both sides of the balance sheet grow together.",
    },
    {
      kind: "numeric",
      id: "ch2-q6",
      difficulty: "challenge",
      concept: "account-type-liability",
      unit: "dollars",
      prompt:
        "One customer transfers $50 to another customer at the same bank. By how many dollars does the bank's TOTAL liabilities change? (Enter a number of dollars.)",
      answer: 0,
      explanation:
        "The bank still owes the same total — the obligation just moved from one customer to another. One deposit falls $50, another rises $50; total [[account-type-liability]] is unchanged. No cash left the building.",
    },
    {
      kind: "multi",
      id: "ch2-q7",
      difficulty: "challenge",
      concept: "double-entry",
      prompt: "Which of these are true of double-entry bookkeeping? (Select all that apply.)",
      options: [
        "Every transaction touches at least two accounts",
        "Total debits must equal total credits",
        "A single transaction may have three or more entries",
        "It stores just one running balance per customer",
      ],
      answers: [0, 1, 2],
      explanation:
        "The 'double' means every transaction is recorded from two perspectives — where value came from and where it went — and it always balances, even when it spans three or more accounts. Storing a single balance is exactly what [[double-entry]] avoids.",
    },
    {
      kind: "mc",
      id: "ch2-q8",
      difficulty: "challenge",
      concept: "double-entry",
      prompt:
        "A proposed transaction has debits of $30 and credits of $20. What should a correct banking system do?",
      options: [
        "Reject it — debits must equal credits",
        "Record it and flag it for later review",
        "Silently add a $10 balancing entry",
        "Record only the credit side",
      ],
      answer: 0,
      explanation:
        "An unbalanced set of entries is a corruption of the records, not a small problem. The balance rule of [[double-entry]] is enforced at posting time and the transaction is refused outright.",
    },
    {
      kind: "mc",
      id: "ch2-q9",
      difficulty: "intro",
      concept: "normal-balance",
      prompt: "When your bank says it has 'credited your account,' your balance…",
      options: ["Went up", "Went down", "Stayed the same", "Was frozen"],
      answer: 0,
      explanation:
        "Everyday language has it backwards. Your account is the bank's liability, and credits increase liabilities — so a credit raises your balance. See [[normal-balance]].",
    },
  ],
};
```

- [ ] **Step 4: Create the other 13 chapter files (empty question arrays)**

Create one file per chapter below, each exporting `export const chapter: Chapter = { … questions: [] }` with the exact `slug`, `number`, `part`, and `title` shown. (Chapter 2 already exists from Step 3.)

`web/src/lib/quiz/chapters/01-what-a-bank-is.ts`:

```ts
import type { Chapter } from "../types";

export const chapter: Chapter = {
  slug: "01-what-a-bank-is",
  number: 1,
  part: "Part I · The Foundations of Bank Accounting",
  title: "What a Bank Is",
  questions: [],
};
```

Create the remaining files with the same shape, substituting these values:

| File | slug | number | part | title |
|---|---|---|---|---|
| `03-the-chart-of-accounts.ts` | `03-the-chart-of-accounts` | 3 | `Part I · The Foundations of Bank Accounting` | `The Chart of Accounts` |
| `04-ledgers-subledgers-and-money.ts` | `04-ledgers-subledgers-and-money` | 4 | `Part I · The Foundations of Bank Accounting` | `Ledgers, Subledgers, and Money` |
| `05-transactions-and-postings.ts` | `05-transactions-and-postings` | 5 | `Part II · Transactions and Time` | `Transactions and Postings` |
| `06-booking-date-vs-value-date.ts` | `06-booking-date-vs-value-date` | 6 | `Part II · Transactions and Time` | `Booking Date vs. Value Date` |
| `07-balances-and-holds.ts` | `07-balances-and-holds` | 7 | `Part II · Transactions and Time` | `Balances and Holds` |
| `08-account-lifecycle-and-overdraft.ts` | `08-account-lifecycle-and-overdraft` | 8 | `Part III · Accounts Over a Lifetime` | `The Account Lifecycle and Overdraft` |
| `09-clearing-and-settlement.ts` | `09-clearing-and-settlement` | 9 | `Part IV · Moving Money Between Banks` | `Clearing and Settlement` |
| `10-the-interbank-network.ts` | `10-the-interbank-network` | 10 | `Part IV · Moving Money Between Banks` | `The Interbank Network` |
| `11-payment-schemes.ts` | `11-payment-schemes` | 11 | `Part IV · Moving Money Between Banks` | `Payment Schemes` |
| `12-sepa.ts` | `12-sepa` | 12 | `Part IV · Moving Money Between Banks` | `SEPA: Credit Transfers and Direct Debits` |
| `13-card-transactions.ts` | `13-card-transactions` | 13 | `Part IV · Moving Money Between Banks` | `Card Transactions` |
| `14-snapshots-audit-and-statements.ts` | `14-snapshots-audit-and-statements` | 14 | `Part V · Records and Reporting` | `Snapshots, Audit Trails, and Statements` |

- [ ] **Step 5: Write the assembly module**

Create `web/src/lib/quiz/index.ts`:

```ts
import type { Chapter, Question } from "./types";

import { chapter as ch01 } from "./chapters/01-what-a-bank-is";
import { chapter as ch02 } from "./chapters/02-double-entry-bookkeeping";
import { chapter as ch03 } from "./chapters/03-the-chart-of-accounts";
import { chapter as ch04 } from "./chapters/04-ledgers-subledgers-and-money";
import { chapter as ch05 } from "./chapters/05-transactions-and-postings";
import { chapter as ch06 } from "./chapters/06-booking-date-vs-value-date";
import { chapter as ch07 } from "./chapters/07-balances-and-holds";
import { chapter as ch08 } from "./chapters/08-account-lifecycle-and-overdraft";
import { chapter as ch09 } from "./chapters/09-clearing-and-settlement";
import { chapter as ch10 } from "./chapters/10-the-interbank-network";
import { chapter as ch11 } from "./chapters/11-payment-schemes";
import { chapter as ch12 } from "./chapters/12-sepa";
import { chapter as ch13 } from "./chapters/13-card-transactions";
import { chapter as ch14 } from "./chapters/14-snapshots-audit-and-statements";

/** Network-level explorer routes a question may deep-link to. */
export const EXPLORE_ROUTES = [
  "/",
  "/payments",
  "/mandates",
  "/cycles",
  "/settlements",
  "/central-bank",
  "/schemes",
] as const;

export const chapters: Chapter[] = [
  ch01, ch02, ch03, ch04, ch05, ch06, ch07,
  ch08, ch09, ch10, ch11, ch12, ch13, ch14,
];

export function getChapter(slug: string): Chapter | undefined {
  return chapters.find((c) => c.slug === slug);
}

export function allQuestions(): Question[] {
  return chapters.flatMap((c) => c.questions);
}

export function mixedQuestions(): Question[] {
  return allQuestions();
}

export interface Part {
  name: string;
  chapters: Chapter[];
}

/** Chapters grouped by their `part`, preserving chapter order. */
export function chaptersByPart(): Part[] {
  const parts: Part[] = [];
  for (const c of chapters) {
    let p = parts.find((x) => x.name === c.part);
    if (!p) {
      p = { name: c.part, chapters: [] };
      parts.push(p);
    }
    p.chapters.push(c);
  }
  return parts;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/quiz/index.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd web && git add src/lib/quiz/index.ts src/lib/quiz/index.test.ts src/lib/quiz/chapters
git commit -m "feat(quiz): assemble chapter bank with validation and Chapter 2 exemplar"
```

---

### Task 4: Presentational atoms — TypeBadge & ProgressRing

**Files:**
- Create: `web/src/components/quiz/type-badge.tsx`
- Create: `web/src/components/quiz/progress-ring.tsx`

**Interfaces:**
- Consumes: `QuestionKind` from `@/lib/quiz/types`, `cn` from `@/lib/utils`.
- Produces: `TypeBadge({ kind, className })`, `ProgressRing({ pct, size?, stroke?, className?, children? })`.

- [ ] **Step 1: Write TypeBadge**

Create `web/src/components/quiz/type-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { QuestionKind } from "@/lib/quiz/types";

const LABEL: Record<QuestionKind, string> = {
  mc: "Multiple choice",
  truefalse: "True / False",
  multi: "Select all",
  numeric: "Numeric",
};

const STYLE: Record<QuestionKind, string> = {
  mc: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  truefalse: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  multi: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  numeric: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

export function TypeBadge({ kind, className }: { kind: QuestionKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-semibold",
        STYLE[kind],
        className,
      )}
    >
      {LABEL[kind]}
    </span>
  );
}
```

- [ ] **Step 2: Write ProgressRing**

Create `web/src/components/quiz/progress-ring.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function ProgressRing({
  pct,
  size = 44,
  stroke = 4,
  className,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="stroke-primary transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {children != null && (
        <span className="absolute text-xs font-semibold">{children}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0 (no errors).

- [ ] **Step 4: Commit**

```bash
cd web && git add src/components/quiz/type-badge.tsx src/components/quiz/progress-ring.tsx
git commit -m "feat(quiz): add TypeBadge and ProgressRing"
```

---

### Task 5: QuestionCard

**Files:**
- Create: `web/src/components/quiz/question-card.tsx`

**Interfaces:**
- Consumes: `SessionItem`, `Response`, `isCorrect` from `@/lib/quiz/session`; `ConceptMarkdown`; `Button`, `Card`, `Input`; `TypeBadge`.
- Produces: `QuestionCard({ item, response, phase, onResponse, onCheck, onNext, isLast })` where `phase: "answering" | "answered"`.

- [ ] **Step 1: Write the component**

Create `web/src/components/quiz/question-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConceptMarkdown } from "@/components/concept-markdown";
import { cn } from "@/lib/utils";
import { isCorrect, type Response, type SessionItem } from "@/lib/quiz/session";
import type { Question } from "@/lib/quiz/types";
import { TypeBadge } from "./type-badge";

const DIFF_LABEL = { intro: "Intro", core: "Core", challenge: "Challenge" } as const;

type OptionState = "idle" | "selected" | "correct" | "wrong";

const OPTION_CLASS: Record<OptionState, string> = {
  idle: "border-border bg-background hover:border-foreground/30",
  selected: "border-primary ring-1 ring-primary",
  correct: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  wrong: "border-destructive bg-destructive/5",
};

export function QuestionCard({
  item,
  response,
  phase,
  onResponse,
  onCheck,
  onNext,
  isLast,
}: {
  item: SessionItem;
  response: Response | null;
  phase: "answering" | "answered";
  onResponse: (r: Response) => void;
  onCheck: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const q = item.question;
  const answered = phase === "answered";
  const correct = answered && isCorrect(q, response);

  const hasResponse =
    response != null &&
    (response.kind !== "multi" || response.choices.length > 0) &&
    (response.kind !== "numeric" || Number.isFinite(response.value));

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <TypeBadge kind={q.kind} />
        {q.difficulty && (
          <span className="text-xs font-medium text-muted-foreground">
            {DIFF_LABEL[q.difficulty]}
          </span>
        )}
      </div>

      <h2 className="mt-3 text-lg font-semibold leading-snug">{q.prompt}</h2>

      <div className="mt-4 space-y-2">{renderInputs(q)}</div>

      {answered && (
        <div
          className={cn(
            "mt-4 rounded-lg border p-4",
            correct
              ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30"
              : "border-destructive/40 bg-destructive/5",
          )}
        >
          <div
            className={cn(
              "mb-1 text-sm font-bold",
              correct ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {correct ? "✓ Correct" : "✗ Not quite"}
          </div>
          <ConceptMarkdown body={q.explanation} />
          {q.explore && (
            <Link
              href={q.explore.href}
              className="mt-1 inline-block text-sm font-medium text-primary underline underline-offset-2"
            >
              → {q.explore.label}
            </Link>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        {answered ? (
          <Button onClick={onNext}>{isLast ? "See results →" : "Next question →"}</Button>
        ) : (
          <Button onClick={onCheck} disabled={!hasResponse}>
            Check answer →
          </Button>
        )}
      </div>
    </Card>
  );

  function renderInputs(question: Question) {
    if (question.kind === "mc") {
      return item.optionOrder.map((orig) => {
        const state: OptionState = !answered
          ? response?.kind === "mc" && response.choice === orig
            ? "selected"
            : "idle"
          : orig === question.answer
            ? "correct"
            : response?.kind === "mc" && response.choice === orig
              ? "wrong"
              : "idle";
        return (
          <button
            key={orig}
            type="button"
            disabled={answered}
            onClick={() => onResponse({ kind: "mc", choice: orig })}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
              OPTION_CLASS[state],
            )}
          >
            {question.options[orig]}
          </button>
        );
      });
    }

    if (question.kind === "truefalse") {
      return (["True", "False"] as const).map((label, i) => {
        const value = i === 0;
        const state: OptionState = !answered
          ? response?.kind === "truefalse" && response.choice === value
            ? "selected"
            : "idle"
          : question.answer === value
            ? "correct"
            : response?.kind === "truefalse" && response.choice === value
              ? "wrong"
              : "idle";
        return (
          <button
            key={label}
            type="button"
            disabled={answered}
            onClick={() => onResponse({ kind: "truefalse", choice: value })}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
              OPTION_CLASS[state],
            )}
          >
            {label}
          </button>
        );
      });
    }

    if (question.kind === "multi") {
      const chosen = response?.kind === "multi" ? response.choices : [];
      return item.optionOrder.map((orig) => {
        const isChosen = chosen.includes(orig);
        const state: OptionState = !answered
          ? isChosen
            ? "selected"
            : "idle"
          : question.answers.includes(orig)
            ? "correct"
            : isChosen
              ? "wrong"
              : "idle";
        return (
          <button
            key={orig}
            type="button"
            disabled={answered}
            onClick={() =>
              onResponse({
                kind: "multi",
                choices: isChosen ? chosen.filter((c) => c !== orig) : [...chosen, orig],
              })
            }
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
              OPTION_CLASS[state],
            )}
          >
            <span
              className={cn(
                "grid size-4 place-items-center rounded border text-[10px]",
                isChosen ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {isChosen ? "✓" : ""}
            </span>
            {question.options[orig]}
          </button>
        );
      });
    }

    // numeric
    const value =
      response?.kind === "numeric" && Number.isFinite(response.value) ? String(response.value) : "";
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          disabled={answered}
          value={value}
          onChange={(e) =>
            onResponse({
              kind: "numeric",
              value: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
          className={cn(
            "max-w-40",
            answered && (correct ? "border-emerald-500" : "border-destructive"),
          )}
        />
        {question.unit && (
          <span className="text-sm text-muted-foreground">
            {question.unit === "dollars" ? "dollars" : "cents"}
          </span>
        )}
      </div>
    );
  }
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
cd web && git add src/components/quiz/question-card.tsx
git commit -m "feat(quiz): add QuestionCard with per-kind inputs and feedback"
```

---

### Task 6: QuizResult

**Files:**
- Create: `web/src/components/quiz/quiz-result.tsx`

**Interfaces:**
- Consumes: `ScoreResult` from `@/lib/quiz/session`; `Question` from `@/lib/quiz/types`; `ProgressRing`; `Button`, `Card`.
- Produces: `QuizResult({ result, bestPct, isNewBest, onRetry, onRetryMissed, onBack })`.

- [ ] **Step 1: Write the component**

Create `web/src/components/quiz/quiz-result.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ScoreResult } from "@/lib/quiz/session";
import type { Question } from "@/lib/quiz/types";
import { ProgressRing } from "./progress-ring";

function correctText(q: Question): string {
  switch (q.kind) {
    case "mc":
      return q.options[q.answer];
    case "truefalse":
      return q.answer ? "True" : "False";
    case "multi":
      return q.answers.map((i) => q.options[i]).join(", ");
    case "numeric":
      return q.unit === "dollars" ? `$${q.answer}` : String(q.answer);
  }
}

export function QuizResult({
  result,
  bestPct,
  isNewBest,
  onRetry,
  onRetryMissed,
  onBack,
}: {
  result: ScoreResult;
  bestPct: number;
  isNewBest: boolean;
  onRetry: () => void;
  onRetryMissed: () => void;
  onBack: () => void;
}) {
  const pct = result.total === 0 ? 0 : Math.round((result.correct / result.total) * 100);

  return (
    <Card className="p-6 text-center">
      <div className="flex flex-col items-center">
        <ProgressRing pct={pct} size={128} stroke={10}>
          <span className="flex flex-col leading-tight">
            <span className="text-2xl font-bold">
              {result.correct}/{result.total}
            </span>
            <span className="text-xs text-muted-foreground">{pct}% correct</span>
          </span>
        </ProgressRing>
        <h2 className="mt-4 text-lg font-bold">
          {isNewBest ? "Nicely done — new best for this chapter!" : "Practice complete"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Your best so far: {bestPct}%</p>
      </div>

      {result.missed.length > 0 && (
        <div className="mt-6 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Review your {result.missed.length}{" "}
            {result.missed.length === 1 ? "miss" : "misses"}
          </p>
          <div className="space-y-2">
            {result.missed.map((q) => (
              <div key={q.id} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{q.prompt}</div>
                <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Correct: {correctText(q)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry}>Retry chapter</Button>
        <Button variant="outline" onClick={onRetryMissed} disabled={result.missed.length === 0}>
          Practice {result.missed.length} missed
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back to chapters
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
cd web && git add src/components/quiz/quiz-result.tsx
git commit -m "feat(quiz): add QuizResult summary with missed review"
```

---

### Task 7: QuizRunner

**Files:**
- Create: `web/src/components/quiz/quiz-runner.tsx`

**Interfaces:**
- Consumes: `buildSession`, `score`, `isCorrect`, `Response`, `SessionItem` from `@/lib/quiz/session`; `Question` from `@/lib/quiz/types`; `readProgress`, `recordResult` from `@/lib/quiz/storage`; `useConceptPanel`; `ProgressRing`, `QuestionCard`, `QuizResult`.
- Produces: `QuizRunner({ slug, title, questions })`.

- [ ] **Step 1: Write the component**

Create `web/src/components/quiz/quiz-runner.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useConceptPanel } from "@/components/concept-panel-provider";
import {
  buildSession,
  isCorrect,
  score,
  type Response,
  type SessionItem,
} from "@/lib/quiz/session";
import type { Question } from "@/lib/quiz/types";
import { readProgress, recordResult } from "@/lib/quiz/storage";
import { ProgressRing } from "./progress-ring";
import { QuestionCard } from "./question-card";
import { QuizResult } from "./quiz-result";

export function QuizRunner({
  slug,
  questions,
}: {
  slug: string;
  title: string;
  questions: Question[];
}) {
  const router = useRouter();
  const { setDefaultConcept } = useConceptPanel();

  const [seed, setSeed] = useState(() => Date.now());
  const [pool, setPool] = useState<Question[]>(questions);
  const session = useMemo<SessionItem[]>(() => buildSession(pool, seed), [pool, seed]);

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<(Response | null)[]>(() => session.map(() => null));
  const [phase, setPhase] = useState<"answering" | "answered">("answering");
  const [finished, setFinished] = useState(false);
  const [streak, setStreak] = useState(0);
  const [recorded, setRecorded] = useState<{ bestPct: number; isNewBest: boolean } | null>(null);

  // A new session (retry / retry-missed) resets all per-session state.
  useEffect(() => {
    setResponses(session.map(() => null));
    setIndex(0);
    setPhase("answering");
    setFinished(false);
    setStreak(0);
    setRecorded(null);
  }, [session]);

  const current = session[index];

  // Mirror PageHeader: drive the right sidebar with the current concept.
  useEffect(() => {
    setDefaultConcept(current?.question.concept ?? null);
    return () => setDefaultConcept(null);
  }, [current, setDefaultConcept]);

  if (session.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions in this chapter yet — check back soon.
      </p>
    );
  }

  const result = score(session, responses);

  if (finished) {
    return (
      <QuizResult
        result={result}
        bestPct={recorded?.bestPct ?? 0}
        isNewBest={recorded?.isNewBest ?? false}
        onRetry={() => {
          setPool(questions);
          setSeed(Date.now());
        }}
        onRetryMissed={() => {
          setPool(result.missed);
          setSeed(Date.now());
        }}
        onBack={() => router.push("/learn")}
      />
    );
  }

  if (!current) return null; // transient: session changed, reset effect pending

  const answeredCount = responses.filter((r) => r !== null).length;
  const correctSoFar = session.reduce(
    (n, item, i) => n + (isCorrect(item.question, responses[i] ?? null) ? 1 : 0),
    0,
  );
  const progressPct = Math.round((index / session.length) * 100);

  function setResponse(r: Response) {
    setResponses((prev) => {
      const next = [...prev];
      next[index] = r;
      return next;
    });
  }

  function check() {
    setPhase("answered");
    setStreak((s) => (isCorrect(current.question, responses[index] ?? null) ? s + 1 : 0));
  }

  function next() {
    if (index + 1 >= session.length) {
      const finalPct = Math.round((score(session, responses).correct / session.length) * 100);
      const prevBest = readProgress(slug)?.bestPct ?? 0;
      const saved = recordResult(slug, finalPct, new Date().toISOString());
      setRecorded({ bestPct: saved.bestPct, isNewBest: finalPct > prevBest });
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setPhase("answering");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ProgressRing pct={progressPct} size={44}>
          {index + 1}/{session.length}
        </ProgressRing>
        <span className="text-sm text-muted-foreground">
          Score {correctSoFar}/{answeredCount}
        </span>
        {streak >= 2 && (
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            🔥 {streak} in a row
          </span>
        )}
      </div>

      <QuestionCard
        item={current}
        response={responses[index] ?? null}
        phase={phase}
        onResponse={setResponse}
        onCheck={check}
        onNext={next}
        isLast={index + 1 >= session.length}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0. (If lint flags `title` as unused, it is part of the public prop contract used by callers; prefix with `_` or remove from the destructure while keeping it in the type — keep the type so pages can pass it.)

- [ ] **Step 3: Commit**

```bash
cd web && git add src/components/quiz/quiz-runner.tsx
git commit -m "feat(quiz): add QuizRunner orchestrating session, sidebar and scoring"
```

---

### Task 8: ChapterCard, Learn index page & nav entry

**Files:**
- Create: `web/src/components/quiz/chapter-card.tsx`
- Create: `web/src/app/learn/page.tsx`
- Modify: `web/src/components/app-shell.tsx` (add the `Learn` nav item)

**Interfaces:**
- Consumes: `Chapter` from `@/lib/quiz/types`; `ChapterProgress`, `readProgress` from `@/lib/quiz/storage`; `chaptersByPart` from `@/lib/quiz`; `PageHeader`, `Card`.
- Produces: `ChapterCard({ chapter, progress })`; default-exported `LearnPage`; a new `NETWORK_NAV` entry `{ href: "/learn", label: "Learn", icon: GraduationCap }`.

- [ ] **Step 1: Write ChapterCard**

Create `web/src/components/quiz/chapter-card.tsx`:

```tsx
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/lib/quiz/types";
import type { ChapterProgress } from "@/lib/quiz/storage";

export function ChapterCard({
  chapter,
  progress,
}: {
  chapter: Chapter;
  progress: ChapterProgress | null;
}) {
  const count = chapter.questions.length;
  const empty = count === 0;

  const pill = empty
    ? "Coming soon"
    : progress == null
      ? "Not started"
      : progress.bestPct >= 100
        ? "100%"
        : `Best ${progress.bestPct}%`;

  const pillClass = empty
    ? "bg-muted text-muted-foreground"
    : progress == null
      ? "bg-muted text-muted-foreground"
      : progress.bestPct >= 100
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";

  const body = (
    <Card
      size="sm"
      className={cn(
        "relative h-full p-4 pt-5 transition-shadow",
        empty ? "opacity-60" : "hover:shadow-md",
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-indigo-500/80" />
      <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
        CHAPTER {chapter.number}
      </div>
      <div className="mt-1 text-sm font-semibold leading-snug">{chapter.title}</div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {empty ? "—" : `${count} ${count === 1 ? "question" : "questions"}`}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", pillClass)}>{pill}</span>
      </div>
    </Card>
  );

  return empty ? body : <Link href={`/learn/${chapter.slug}`}>{body}</Link>;
}
```

- [ ] **Step 2: Write the Learn index page**

Create `web/src/app/learn/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shuffle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ChapterCard } from "@/components/quiz/chapter-card";
import { chaptersByPart } from "@/lib/quiz";
import { readProgress, type ChapterProgress } from "@/lib/quiz/storage";

export default function LearnPage() {
  const parts = useMemo(() => chaptersByPart(), []);
  const [progress, setProgress] = useState<Record<string, ChapterProgress | null>>({});

  useEffect(() => {
    const next: Record<string, ChapterProgress | null> = {};
    for (const part of parts) {
      for (const c of part.chapters) next[c.slug] = readProgress(c.slug);
    }
    setProgress(next);
  }, [parts]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learn"
        description="Practice the concepts from each chapter. Answer, get instant feedback, and dig deeper in the sidebar."
      />

      <Link
        href="/learn/mixed"
        className="flex items-center gap-4 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 p-5 text-white transition-opacity hover:opacity-95"
      >
        <Shuffle className="size-6 shrink-0" />
        <div className="flex-1">
          <div className="text-base font-semibold">Mixed review</div>
          <div className="text-sm text-white/85">
            A fresh shuffle of questions drawn from every chapter.
          </div>
        </div>
        <span className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-indigo-600">
          Start →
        </span>
      </Link>

      {parts.map((part) => (
        <section key={part.name} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {part.name}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {part.chapters.map((c) => (
              <ChapterCard key={c.slug} chapter={c} progress={progress[c.slug] ?? null} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the nav entry**

In `web/src/components/app-shell.tsx`, add `GraduationCap` to the `lucide-react` import block (alongside the other icons), then add the `Learn` item to `NETWORK_NAV` right after the Dashboard entry:

```tsx
const NETWORK_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/learn", label: "Learn", icon: GraduationCap },
  { href: "/payments", label: "Payments", icon: ArrowLeftRight },
  { href: "/mandates", label: "Mandates", icon: FileSignature },
  { href: "/cycles", label: "Clearing cycles", icon: RefreshCw },
  { href: "/settlements", label: "Settlements", icon: Landmark },
  { href: "/central-bank", label: "Central bank", icon: Building2 },
  { href: "/schemes", label: "Schemes", icon: Network },
];
```

(The existing `active` logic — `pathname.startsWith(href)` for non-root hrefs — already highlights `/learn` and its sub-pages.)

- [ ] **Step 4: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/components/quiz/chapter-card.tsx src/app/learn/page.tsx src/components/app-shell.tsx
git commit -m "feat(quiz): add Learn index, ChapterCard, and nav entry"
```

---

### Task 9: Chapter & Mixed runner pages

**Files:**
- Create: `web/src/app/learn/[chapter]/page.tsx`
- Create: `web/src/app/learn/mixed/page.tsx`

**Interfaces:**
- Consumes: `useParams` (Next 16); `getChapter`, `mixedQuestions` from `@/lib/quiz`; `QuizRunner`; `PageHeader`, `Button`.
- Produces: the two default-exported page components.

Note: a static `/learn/mixed` route takes precedence over the dynamic `/learn/[chapter]` segment in the App Router, so `mixed` is safely reserved.

- [ ] **Step 1: Write the chapter runner page**

Create `web/src/app/learn/[chapter]/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { getChapter } from "@/lib/quiz";

export default function ChapterQuizPage() {
  const { chapter: slug } = useParams<{ chapter: string }>();
  const chapter = getChapter(slug);

  if (!chapter) {
    return (
      <div className="space-y-4">
        <PageHeader title="Chapter not found" />
        <Button asChild variant="outline">
          <Link href="/learn">← Back to Learn</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Chapter ${chapter.number} · ${chapter.title}`}
        description="Answer, check, and learn from the explanation. Your best score is saved on this device."
      />
      <QuizRunner slug={chapter.slug} title={chapter.title} questions={chapter.questions} />
    </div>
  );
}
```

- [ ] **Step 2: Write the mixed runner page**

Create `web/src/app/learn/mixed/page.tsx`:

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { mixedQuestions } from "@/lib/quiz";

export default function MixedQuizPage() {
  const questions = mixedQuestions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mixed review"
        description="A fresh shuffle of questions drawn from every chapter."
      />
      <QuizRunner slug="mixed" title="Mixed review" questions={questions} />
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `cd web && npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd web && git add src/app/learn/[chapter]/page.tsx src/app/learn/mixed/page.tsx
git commit -m "feat(quiz): add chapter and mixed-review runner pages"
```

---

### Task 10: Author remaining chapters & full verification

This task fills in question content for chapters 1 and 3–14 (each currently `questions: []`) by appending objects following the Chapter 2 pattern, then verifies the whole feature end-to-end. The bank test from Task 3 guards correctness as you go.

**Files:**
- Modify: `web/src/lib/quiz/chapters/01-…`, `03-…` through `14-…` (append questions)

**Per-chapter concept map** (use these `HintKey`s for `concept`; use the listed `explore` route only where the prompt naturally points at a network-level page — never a `/participants/[pid]/…` route):

| Chapter | Suggested `concept` keys | Suitable `explore.href` |
|---|---|---|
| 1 What a Bank Is | `account-type-asset`, `account-type-liability`, `account-type-equity`, `double-entry` | `/` |
| 3 The Chart of Accounts | `normal-balance`, `account-type-asset`, `account-type-liability`, `account-type-equity`, `account-type-revenue`, `account-type-expense` | — |
| 4 Ledgers, Subledgers, and Money | `ledger-vs-subledger`, `amount-cents` | — |
| 5 Transactions and Postings | `double-entry`, `idempotency-key`, `reversal` | — |
| 6 Booking vs. Value Date | `booking-date`, `value-date` | — |
| 7 Balances and Holds | `balance-book`, `balance-available`, `balance-holds`, `holds`, `hold-capture`, `hold-release` | — |
| 8 Account Lifecycle and Overdraft | `account-status`, `overdraft` | — |
| 9 Clearing and Settlement | `clearing-vs-settlement`, `netting`, `net-positions` | `/cycles`, `/settlements` |
| 10 The Interbank Network | `reserve-account`, `central-bank-reserves`, `clearing-suspense` | `/central-bank` |
| 11 Payment Schemes | `scheme-direction-push`, `scheme-direction-pull`, `settlement-model-net`, `settlement-model-gross`, `requires-mandate`, `allows-return`, `settlement-delay` | `/schemes` |
| 12 SEPA | `mandate`, `payment-lifecycle`, `debtor-leg`, `creditor-leg` | `/mandates`, `/payments` |
| 13 Card Transactions | `holds`, `hold-capture`, `hold-release`, `scheme-direction-pull` | `/payments` |
| 14 Snapshots, Audit & Statements | `snapshot`, `statement`, `statement-amount` | — |

**Authoring rules** (enforced by `src/lib/quiz/index.test.ts`):
- Unique `id` per question, convention `ch<N>-q<M>` (e.g. `ch9-q1`).
- Use a mix of all four `kind`s across each chapter; aim for **≥8 questions per chapter**.
- `concept` must be one of the keys above (or any other real `HintKey`); explanations may add `[[concept]]` wiki-links.
- Numeric questions set `unit` and state it in the prompt.
- Keep content domain-first: never instruct the reader to operate the app.

- [ ] **Step 1: Author chapters 1 and 3–14**

Append question objects to each chapter file following the Chapter 2 exemplar and the map above. Re-run the bank test frequently while authoring:

Run: `cd web && npx vitest run src/lib/quiz/index.test.ts`
Expected: PASS after each chapter (fix any reported id/answer/concept issue before moving on).

- [ ] **Step 2: Run the full unit suite**

Run: `cd web && npm run test`
Expected: all quiz suites (`session`, `storage`, `index`) and existing suites PASS.

- [ ] **Step 3: Typecheck, lint, and production build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. The build is the final gate.

- [ ] **Step 4: Browser verification (against a running backend)**

Start the backend from the repo root (`go run ./cmd/server`) and the frontend (`cd web && npm run dev`), then in a browser confirm:
- `Learn` appears in the left nav and `/learn` lists all 14 chapters grouped by Part, with the Mixed-review hero.
- Opening Chapter 2 runs the quiz: each kind renders; "Check" reveals correct/incorrect + explanation; `[[concept]]` links open the right sidebar; the sidebar shows the current question's concept; "Next" advances; the streak pill appears after 2 correct in a row.
- Finishing shows the results ring, the missed-review list, and "Retry" / "Practice missed" / "Back to chapters" all work.
- Re-opening the chapter shows the saved best score on the index card.
- A chapter with content authored in Step 1 behaves the same; an empty chapter (if any remain) shows "Coming soon" and is not clickable.
- `/learn/mixed` runs a shuffled cross-chapter session.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/lib/quiz/chapters
git commit -m "feat(quiz): author question banks for chapters 1 and 3-14"
```

---

## Self-Review

**1. Spec coverage:**
- Placement & routing (`/learn`, `/learn/[chapter]`, `/learn/mixed`, nav) → Tasks 8, 9. ✓
- Content policy (domain-first + concept/explore/wiki-link enrichment) → Global Constraints; Task 3 exemplar; Task 10 map. ✓
- Data model (discriminated union, `Chapter`) → Task 1. ✓
- Data files & assembly → Task 3. ✓
- Pure logic (seeded shuffle, isCorrect, score) → Task 1; storage → Task 2. ✓
- Components (QuizRunner, QuestionCard, QuizResult, ChapterCard, ProgressRing, TypeBadge) → Tasks 4–8. ✓
- Concept-sidebar integration (`setDefaultConcept`, `ConceptMarkdown`, explore Link) → Tasks 5, 7. ✓
- Visual direction (gradient hero, colored badges, rings, streak, results ring) → Tasks 4–8. ✓
- Testing (bank validation, session, storage) → Tasks 1–3; build/browser gate → Task 10. ✓
- Out-of-scope items (no spaced repetition, no test mode, localStorage only, no authoring UI, no bespoke journal-entry builder) → respected; nothing in the plan adds them. ✓

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling" steps; every code step contains complete code. Task 10 is genuine content authoring with a concrete per-chapter map and a validating test, not a placeholder.

**3. Type consistency:** `Question`/`Chapter` (Task 1) used identically in Tasks 3–9; `Response`/`SessionItem`/`ScoreResult` (Task 1) consumed unchanged by `QuestionCard`/`QuizResult`/`QuizRunner`; `ChapterProgress`/`readProgress`/`recordResult` (Task 2) consumed by Task 7 and Task 8; `EXPLORE_ROUTES`/`getChapter`/`mixedQuestions`/`chaptersByPart` (Task 3) consumed by Tasks 8–9 with matching names. `QuizRunner` is called with `{ slug, title, questions }` in Task 9, matching its prop type in Task 7.
