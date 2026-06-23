import { cn } from "@/lib/utils";

// Renders an opaque backend ID (bank_1, acct_9, …) in monospace. IDs are
// everywhere in this system, so showing them consistently helps users follow
// how money moves between participants and accounts.
export function IdText({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn("font-mono text-xs text-muted-foreground", className)}
    >
      {id}
    </span>
  );
}
