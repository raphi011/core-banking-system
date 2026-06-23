"use client";

import { HelpCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { hintContent, type HintKey } from "./hint-content";

interface HintProps {
  // Either reference a registry entry by id…
  id?: HintKey;
  // …or pass ad-hoc content with a title and children.
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

// A small "?" button that reveals an explanation on click/tap. Built on Radix
// Popover (not Tooltip) so it works on touch devices, is keyboard- and
// screen-reader accessible, and dismisses on outside-tap or Escape.
export function Hint({ id, title, children, className }: HintProps) {
  const resolvedTitle = id ? hintContent[id].title : (title ?? "");
  const body: React.ReactNode = id ? hintContent[id].body : children;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={resolvedTitle ? `Explain: ${resolvedTitle}` : "Explain"}
          // Stop the click from triggering a parent (e.g. a clickable table
          // row). type="button" already prevents host-form submission.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
        >
          <HelpCircle className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-1.5rem)] gap-1"
      >
        {resolvedTitle && (
          <p className="text-sm font-medium">{resolvedTitle}</p>
        )}
        <div className="text-sm leading-relaxed text-muted-foreground">
          {body}
        </div>
      </PopoverContent>
    </Popover>
  );
}
