import { cn } from "@/lib/utils";

/** Small token-styled badge for an account/institution kind. */
export function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border-light bg-elevated px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-wide text-fg-muted",
      )}
    >
      {kind}
    </span>
  );
}
