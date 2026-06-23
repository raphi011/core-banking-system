"use client";

import { Label } from "@/components/ui/label";
import { Hint } from "./hint";
import type { HintKey } from "./hint-content";

interface FieldLabelProps {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: HintKey;
  required?: boolean;
}

// A form label that can carry a "?" hint inline.
export function FieldLabel({
  htmlFor,
  children,
  hint,
  required,
}: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>
        {children}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {hint && <Hint id={hint} />}
    </div>
  );
}
