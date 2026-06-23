"use client";

import { useEffect } from "react";

import { Hint } from "./hint";
import { useConceptPanel } from "./concept-panel-provider";
import type { HintKey } from "./hint-content";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  hint?: HintKey;
  // Right-aligned actions (e.g. a "New" button).
  actions?: React.ReactNode;
}

// Standard page title block. Its `hint` both renders the inline "?" and
// registers the page's default concept for the side panel.
export function PageHeader({
  title,
  description,
  hint,
  actions,
}: PageHeaderProps) {
  const { setDefaultConcept } = useConceptPanel();

  useEffect(() => {
    setDefaultConcept(hint ?? null);
    return () => setDefaultConcept(null);
  }, [hint, setDefaultConcept]);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {hint && <Hint id={hint} />}
        </div>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
