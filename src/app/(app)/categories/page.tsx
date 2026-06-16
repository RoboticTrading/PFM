import { CategoryManager } from "@/components/categories/CategoryManager";

export const metadata = { title: "Categories — PFM" };

export default function CategoriesPage() {
  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Categories
        </h1>
        <p className="text-sm text-fg-muted">
          The Income / Expense / Transfer hierarchy — add, rename, remove.
        </p>
      </header>
      <CategoryManager />
    </main>
  );
}
