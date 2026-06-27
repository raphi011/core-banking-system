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
