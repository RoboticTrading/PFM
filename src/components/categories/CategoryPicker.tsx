"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SPLIT_CATEGORY } from "@/lib/accounts/register-types";
import { cn } from "@/lib/utils";

/** The minimal category shape the picker needs (from `categories.list`). */
export interface PickerCategory {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
}

const KIND_ORDER = ["Income", "Expense", "Transfer"] as const;

const KIND_TONE: Record<string, string> = {
  Income: "text-success",
  Expense: "text-danger",
  Transfer: "text-info",
};

/** A flattened tree node carrying its depth + a search path (root ▸ … ▸ name). */
interface FlatNode {
  cat: PickerCategory;
  depth: number;
  path: string;
}

/** Depth-first flatten of one kind's subtree, preserving sibling input order. */
function flattenKind(cats: PickerCategory[], kind: string): FlatNode[] {
  const byParent = new Map<string | null, PickerCategory[]>();
  for (const c of cats) {
    if (c.kind !== kind) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const out: FlatNode[] = [];
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    for (const c of byParent.get(parentId) ?? []) {
      const path = prefix ? `${prefix} ▸ ${c.name}` : c.name;
      out.push({ cat: c, depth, path });
      walk(c.id, depth + 1, path);
    }
  };
  // Roots of a kind have a null parent; nested ones follow their parent.
  walk(null, 0, "");
  // Fallback: any node whose parent is in another kind (shouldn't happen) still shows.
  return out;
}

/**
 * Searchable, keyboard-friendly category picker over the Income / Expense /
 * Transfer tree. Type to filter across the whole tree (matches the full path);
 * arrow keys + Enter to choose. Reused by the register, bulk bar, and splits.
 */
export function CategoryPicker({
  categories,
  value,
  onSelect,
  disabled,
  placeholder = "uncategorized",
  ariaLabel = "Category",
  className,
  align = "start",
}: {
  categories: PickerCategory[];
  value: string | null;
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected =
    value === SPLIT_CATEGORY
      ? null
      : categories.find((c) => c.id === value) ?? null;
  const label =
    value === SPLIT_CATEGORY ? "Split" : selected ? selected.name : placeholder;
  const unset = !selected && value !== SPLIT_CATEGORY;

  const kinds = KIND_ORDER.filter((k) => categories.some((c) => c.kind === k));

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1 text-left text-sm outline-none transition-colors focus-visible:border-accent disabled:opacity-50",
          unset ? "italic text-fg-subtle" : "text-fg",
          value === SPLIT_CATEGORY && "not-italic text-info",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 w-64 rounded-md border border-border bg-elevated shadow-xl",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <Command loop>
            <CommandInput autoFocus placeholder="Search categories…" />
            <CommandList>
              <CommandEmpty>No category.</CommandEmpty>
              {kinds.map((kind) => {
                const nodes = flattenKind(categories, kind);
                if (nodes.length === 0) return null;
                return (
                  <CommandGroup
                    key={kind}
                    heading={
                      <span className={cn("font-semibold", KIND_TONE[kind])}>
                        {kind}
                      </span>
                    }
                  >
                    {nodes.map(({ cat, depth, path }) => (
                      <CommandItem
                        key={cat.id}
                        value={cat.id}
                        keywords={[cat.name, path, kind]}
                        onSelect={() => {
                          onSelect(cat.id);
                          setOpen(false);
                        }}
                      >
                        <span
                          className="truncate"
                          style={{ paddingLeft: depth * 12 }}
                        >
                          {depth > 0 && (
                            <span className="text-fg-subtle">↳ </span>
                          )}
                          {cat.name}
                        </span>
                        {cat.id === value && (
                          <Check className="ml-auto size-3.5 text-accent" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
