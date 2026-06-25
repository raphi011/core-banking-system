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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
