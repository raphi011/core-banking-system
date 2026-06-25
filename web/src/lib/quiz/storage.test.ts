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

  it("does not throw when no storage is available", () => {
    expect(() => recordResult("ch", 50, "t")).not.toThrow();
    expect(readProgress("ch")).toBeNull();
  });
});
