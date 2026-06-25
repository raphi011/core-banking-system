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
  if (raw === null) return null;
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
