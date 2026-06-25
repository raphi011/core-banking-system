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
