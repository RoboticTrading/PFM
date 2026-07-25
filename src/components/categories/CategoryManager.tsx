"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { CategoryPicker, type PickerCategory } from "./CategoryPicker";

const KIND_ORDER = ["Income", "Expense", "Transfer"] as const;
type Kind = (typeof KIND_ORDER)[number];

const KIND_TONE: Record<Kind, string> = {
  Income: "text-success",
  Expense: "text-danger",
  Transfer: "text-info",
};

/**
 * Editable category hierarchy — add (root-scoped or nested), rename inline,
 * re-parent/nest via a searchable picker, reorder among siblings, and delete
 * (refused server-side if the node has children, budgets, or assignments).
 * Wraps categories.create / rename / remove / reorder / setParent.
 */
export function CategoryManager() {
  const list = trpc.categories.list.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => void utils.categories.list.invalidate();

  const create = trpc.categories.create.useMutation({ onSuccess: refresh });
  const rename = trpc.categories.rename.useMutation({ onSuccess: refresh });
  const remove = trpc.categories.remove.useMutation({ onSuccess: refresh });
  const reorder = trpc.categories.reorder.useMutation({ onSuccess: refresh });
  const setParent = trpc.categories.setParent.useMutation({
    onSuccess: () => {
      refresh();
      setMovingId(null);
    },
  });

  const data = useMemo(() => list.data ?? [], [list.data]);

  const childrenOf = (id: string | null) =>
    data.filter((c) => c.parentId === id);

  /** All descendant ids of `id` (excludes `id`). */
  const descendantIds = (id: string): Set<string> => {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      for (const child of data.filter((c) => c.parentId === cur)) {
        if (!out.has(child.id)) {
          out.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return out;
  };

  function move(group: { id: string }[], id: string, dir: -1 | 1) {
    const idx = group.findIndex((g) => g.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= group.length) return;
    const ids = group.map((g) => g.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate({ ids });
  }

  // --- Add form ------------------------------------------------------------
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("Expense");
  const [parentId, setParentId] = useState<string | null>(null);

  const parentOptions = useMemo(
    () => data.filter((c) => c.kind === kind),
    [data, kind],
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), kind, parentId: parentId || null },
      { onSuccess: () => setName("") },
    );
  }

  // --- Inline edit / move state -------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);

  function startEdit(id: string, current: string) {
    setEditingId(id);
    setEditName(current);
  }
  function commitEdit() {
    if (editingId && editName.trim()) {
      rename.mutate(
        { id: editingId, name: editName.trim() },
        { onSuccess: () => setEditingId(null) },
      );
    }
  }

  if (list.isLoading) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;
  if (list.isError) return <p className="p-4 text-sm text-danger">Failed to load.</p>;

  /** Recursively render a node and its subtree (siblings share `group`). */
  function renderNode(
    node: PickerCategory,
    group: PickerCategory[],
    depth: number,
  ): React.ReactNode {
    const kids = childrenOf(node.id);
    const isRoot = node.parentId === null;
    // Valid new parents: same list minus self + its descendants + current parent.
    const blocked = descendantIds(node.id);
    blocked.add(node.id);
    if (node.parentId) blocked.add(node.parentId);
    const moveTargets = data.filter((c) => !blocked.has(c.id));

    return (
      <li key={node.id}>
        <Row
          name={node.name}
          bold={isRoot}
          canMove={!isRoot}
          editing={editingId === node.id}
          editName={editName}
          onEditName={setEditName}
          onStartEdit={() => startEdit(node.id, node.name)}
          onCommit={commitEdit}
          onCancel={() => setEditingId(null)}
          onDelete={() => remove.mutate({ id: node.id })}
          onMoveUp={() => move(group, node.id, -1)}
          onMoveDown={() => move(group, node.id, 1)}
          onToggleReparent={() =>
            setMovingId((m) => (m === node.id ? null : node.id))
          }
        />
        {movingId === node.id && (
          <div className="ml-3 mt-1 flex items-center gap-2 border-l border-accent/40 pl-3">
            <span className="text-[10px] uppercase tracking-wide text-fg-subtle">
              Move under
            </span>
            <div className="w-52">
              <CategoryPicker
                categories={moveTargets}
                value={node.parentId}
                onSelect={(newParentId) =>
                  setParent.mutate({ id: node.id, parentId: newParentId })
                }
                placeholder="Choose new parent…"
                ariaLabel="New parent"
              />
            </div>
            <button
              type="button"
              onClick={() => setMovingId(null)}
              className="text-xs text-fg-muted hover:text-fg"
            >
              cancel
            </button>
          </div>
        )}
        {kids.length > 0 && (
          <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
            {kids.map((child) => renderNode(child, kids, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add */}
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
      >
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category"
            className="w-48 rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          Kind
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setParentId(null);
            }}
            className="rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          Parent (optional)
          <div className="w-56">
            <CategoryPicker
              categories={parentOptions}
              value={parentId}
              onSelect={setParentId}
              placeholder="— top level —"
              ariaLabel="Parent category"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {remove.isError && (
        <p className="text-sm text-danger">{remove.error.message}</p>
      )}
      {setParent.isError && (
        <p className="text-sm text-danger">{setParent.error.message}</p>
      )}

      {/* Tree */}
      <div className="grid gap-4 sm:grid-cols-3">
        {KIND_ORDER.map((k) => {
          const roots = childrenOf(null).filter((r) => r.kind === k);
          return (
            <section
              key={k}
              className="rounded-md border border-border bg-surface p-4"
            >
              <h2
                className={cn(
                  "mb-2 font-display text-sm font-semibold uppercase tracking-wide",
                  KIND_TONE[k],
                )}
              >
                {k}
              </h2>
              <ul className="space-y-1">
                {roots.map((root) => renderNode(root, roots, 0))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  name,
  bold,
  canMove,
  editing,
  editName,
  onEditName,
  onStartEdit,
  onCommit,
  onCancel,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleReparent,
}: {
  name: string;
  bold?: boolean;
  canMove?: boolean;
  editing: boolean;
  editName: string;
  onEditName: (v: string) => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleReparent: () => void;
}) {
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          value={editName}
          onChange={(e) => onEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-40 rounded border border-border bg-base px-1.5 py-0.5 text-sm text-fg outline-none focus-visible:border-accent"
        />
        <button
          type="button"
          onClick={onCommit}
          className="text-xs text-accent hover:text-accent-bright"
        >
          save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-fg-muted hover:text-fg"
        >
          cancel
        </button>
      </span>
    );
  }
  return (
    <span className="group flex items-center justify-between gap-2">
      <span
        className={cn("text-sm", bold ? "font-medium text-fg" : "text-fg-muted")}
      >
        {name}
      </span>
      <span className="flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={onMoveUp}
          aria-label="Move up"
          className="text-xs text-fg-subtle hover:text-accent"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          aria-label="Move down"
          className="text-xs text-fg-subtle hover:text-accent"
        >
          ↓
        </button>
        {canMove && (
          <button
            type="button"
            onClick={onToggleReparent}
            aria-label="Re-parent"
            className="text-xs text-fg-subtle hover:text-accent"
          >
            move
          </button>
        )}
        <button
          type="button"
          onClick={onStartEdit}
          aria-label="Rename"
          className="text-xs text-fg-subtle hover:text-accent"
        >
          edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          className="text-xs text-fg-subtle hover:text-danger"
        >
          ×
        </button>
      </span>
    </span>
  );
}
