import type { ReactNode } from "react";

/**
 * A token-only sample surface — every color, font, and radius comes from a
 * design token (no hardcoded styles), so it re-themes automatically when the
 * skin changes. Doubles as the smoke-test that the token layer renders.
 */
export function ThemedCard({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded border border-border bg-card p-5 text-fg">
      <h2 className="font-display text-xl font-semibold text-accent">{title}</h2>
      <div className="mt-2 text-sm text-fg-muted">{children}</div>
    </section>
  );
}
