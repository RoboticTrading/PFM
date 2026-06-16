"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const KIND_ORDER = ["Income", "Expense", "Transfer"] as const;
type Kind = (typeof KIND_ORDER)[number];

const KIND_TONE: Record<Kind, string> = {
  Income: "text-success",
  Expense: "text-danger",
  Transfer: "text-info",
};

/** Editable category hierarchy — add (root or child), rename inline, delete
 *  (refused server-side if referenced). Wraps categories.create/rename/remove. */
export function CategoryManager() {
  const list = trpc.categories.list.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => void utils.categories.list.invalidate();

  const create = trpc.categories.create.useMutation({ onSuccess: refresh });
  const rename = trpc.categories.rename.useMutation({ onSuccess: refresh });
  const remove = trpc.categories.remove.useMutation({ onSuccess: refresh });
  const reorder = trpc.categories.reorder.useMutation({ onSuccess: refresh });

  function move(group: { id: string }[], id: string, dir: -1 | 1) {
    const idx = group.findIndex((g) => g.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= group.length) return;
    const ids = group.map((g) => g.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate({ ids });
  }

  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("Expense");
  const [parentId, setParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const data = list.data ?? [];
  const roots = data.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => data.filter((c) => c.parentId === id);
  const kindRootsFor = (k: Kind) => roots.filter((r) => r.kind === k);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), kind, parentId: parentId || null },
      { onSuccess: () => setName("") },
    );
  }

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
              setParentId("");
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
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
          Parent (optional)
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="min-w-[12rem] rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
          >
            <option value="">— top level —</option>
            {kindRootsFor(kind).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
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

      {/* Tree */}
      <div className="grid gap-4 sm:grid-cols-3">
        {KIND_ORDER.map((k) => (
          <section key={k} className="rounded-md border border-border bg-surface p-4">
            <h2
              className={cn(
                "mb-2 font-display text-sm font-semibold uppercase tracking-wide",
                KIND_TONE[k],
              )}
            >
              {k}
            </h2>
            <ul className="space-y-1">
              {kindRootsFor(k).map((root) => (
                <li key={root.id}>
                  <Row
                    id={root.id}
                    name={root.name}
                    bold
                    editing={editingId === root.id}
                    editName={editName}
                    onEditName={setEditName}
                    onStartEdit={() => startEdit(root.id, root.name)}
                    onCommit={commitEdit}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => remove.mutate({ id: root.id })}
                    onMoveUp={() => move(kindRootsFor(k), root.id, -1)}
                    onMoveDown={() => move(kindRootsFor(k), root.id, 1)}
                  />
                  <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {childrenOf(root.id).map((child) => (
                      <li key={child.id}>
                        <Row
                          id={child.id}
                          name={child.name}
                          editing={editingId === child.id}
                          editName={editName}
                          onEditName={setEditName}
                          onStartEdit={() => startEdit(child.id, child.name)}
                          onCommit={commitEdit}
                          onCancel={() => setEditingId(null)}
                          onDelete={() => remove.mutate({ id: child.id })}
                          onMoveUp={() => move(childrenOf(root.id), child.id, -1)}
                          onMoveDown={() => move(childrenOf(root.id), child.id, 1)}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({
  name,
  bold,
  editing,
  editName,
  onEditName,
  onStartEdit,
  onCommit,
  onCancel,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  name: string;
  bold?: boolean;
  editing: boolean;
  editName: string;
  onEditName: (v: string) => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
      <span className={cn("text-sm", bold ? "font-medium text-fg" : "text-fg-muted")}>
        {name}
      </span>
      <span className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
