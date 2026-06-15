"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";


import { CommandMenu } from "./CommandMenu";
import { activeNav, NAV_ITEMS } from "./nav";

/**
 * The Explorer shell — a persistent artifact nav spine (sidebar) + content area.
 * Object-centric: the artifacts are the navigation. Keyboard-friendly (focusable
 * links, ⌘K command palette).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const active = activeNav(pathname);

  return (
    <div className="flex min-h-screen bg-base text-fg">
      <nav
        aria-label="Artifacts"
        className="flex w-52 shrink-0 flex-col border-r border-border bg-panel"
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 border-b border-border px-4 py-4 font-display text-lg font-semibold tracking-wide text-accent"
        >
          PFM
        </Link>
        <ul className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const isActive = active?.href === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-3 py-2 text-sm outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-hover font-medium text-accent"
                      : "text-fg-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <span aria-hidden className="w-4 text-center text-fg-subtle">
                    {item.glyph}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border p-3 text-[10px] uppercase tracking-wide text-fg-subtle">
          <span>
            <kbd className="rounded border border-border-light bg-elevated px-1">
              ⌘K
            </kbd>{" "}
            to jump
          </span>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <CommandMenu />
    </div>
  );
}
