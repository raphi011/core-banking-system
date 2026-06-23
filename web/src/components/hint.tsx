"use client";

import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConceptPanel } from "./concept-panel-provider";
import { hintContent, type HintKey } from "./hint-content";

interface HintProps {
  id: HintKey;
  className?: string;
}

// A small "?" button that opens the referenced concept in the side panel. It
// owns its click (preventDefault/stopPropagation) so it's safe inside links and
// clickable rows.
export function Hint({ id, className }: HintProps) {
  const { openConcept } = useConceptPanel();
  const title = hintContent[id].title;

  return (
    <button
      type="button"
      aria-label={`Explain: ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openConcept(id);
      }}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <HelpCircle className="size-3.5" />
    </button>
  );
}
