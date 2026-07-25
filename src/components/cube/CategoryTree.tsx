"use client";

import { useMemo, useState } from "react";

import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/** A node in the assembled category tree — amount is the roll-up of the whole subtree. */
interface Node {
  name: string;
  path: string;
  amount: number;
  n: number;
  children: Map<string, Node>;
}

function emptyNode(name: string, path: string): Node {
  return { name, path, amount: 0, n: 0, children: new Map() };
}

/** Build the nested tree from flat " / "-delimited rows, summing amounts up every ancestor. */
function buildTree(rows: { path: string; amount: string; n: number }[]): Node {
  const root = emptyNode("", "");
  for (const row of rows) {
    const amt = Number(row.amount);
    const parts = row.path.split("/").map((p) => p.trim()).filter(Boolean);
    let node = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc} / ${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = emptyNode(part, acc);
        node.children.set(part, child);
      }
      child.amount += amt;
      child.n += row.n;
      node = child;
    }
  }
  return root;
}

function amtClass(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-fg-muted";
}

function Row({ node, depth }: { node: Node; depth: number }) {
  const kids = useMemo(
    () => [...node.children.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    [node.children],
  );
  const hasKids = kids.length > 0;
  const [open, setOpen] = useState(depth < 1); // roots expanded, deeper collapsed

  return (
    <>
      <div
        onClick={() => hasKids && setOpen((o) => !o)}
        className={cn(
          "flex items-center border-b border-border-light/40 py-1.5 pr-4 text-sm",
          hasKids && "cursor-pointer hover:bg-muted/40",
        )}
        style={{ paddingLeft: `${depth * 18 + 16}px` }}
      >
        <span className="mr-1 w-3 text-fg-subtle">{hasKids ? (open ? "▾" : "▸") : ""}</span>
        <span className={cn("flex-1", depth === 0 ? "font-semibold text-accent" : "text-fg")}>
          {node.name}
        </span>
        <span className="mr-3 text-[11px] tabular-nums text-fg-subtle">{node.n}×</span>
        <span className={cn("w-28 text-right font-medium tabular-nums", amtClass(node.amount))}>
          {formatUsd(String(node.amount))}
        </span>
      </div>
      {open && kids.map((k) => <Row key={k.path} node={k} depth={depth + 1} />)}
    </>
  );
}

/**
 * The category tree — every Cube fact bucketed into Income / Expenses / Transfers, collapsible and
 * rolled-up. Bob's category-tree ask: trading structures nest under their strategy, broker fees and
 * dividends join as Income/Expenses, so the whole money picture reads as one hierarchy.
 */
export function CategoryTree({ rows }: { rows: { path: string; amount: string; n: number }[] }) {
  const roots = useMemo(() => {
    const tree = buildTree(rows);
    return [...tree.children.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [rows]);

  if (roots.length === 0) {
    return <p className="p-4 text-sm text-fg-muted">No categorized facts yet.</p>;
  }
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        Category tree · Income / Expenses / Transfers · click to expand
      </div>
      <div className="max-h-[36rem] overflow-auto">
        {roots.map((r) => (
          <Row key={r.path} node={r} depth={0} />
        ))}
      </div>
    </div>
  );
}
