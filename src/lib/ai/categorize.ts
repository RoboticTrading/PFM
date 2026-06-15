import type { AiRouter } from "./router";

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategorySuggestion {
  /** Matched category id, or null if the model's answer matched nothing. */
  categoryId: string | null;
  categoryName: string | null;
  /** The raw model output, for transparency. */
  raw: string;
}

export interface SuggestInput {
  description: string;
  amount: string;
  categories: CategoryOption[];
}

/**
 * Suggest a category for a transaction via the AI router's "categorize" role.
 * **Suggest-only** — it returns a candidate for a human to confirm and NEVER
 * writes state (only Actions mutate). The router refuses to run unless AI is
 * explicitly enabled, keeping PFM manual-first.
 */
export async function suggestCategory(
  router: AiRouter,
  input: SuggestInput,
): Promise<CategorySuggestion> {
  const names = input.categories.map((c) => c.name);
  const result = await router.run("categorize", {
    messages: [
      {
        role: "system",
        content:
          "You categorize a personal-finance transaction. Choose the single best " +
          "category from the provided list. Reply with ONLY the exact category name.",
      },
      {
        role: "user",
        content:
          `Transaction: "${input.description}" amount ${input.amount}.\n` +
          `Categories: ${names.join(", ")}.`,
      },
    ],
    temperature: 0,
  });

  const answer = result.text.trim();
  const lower = answer.toLowerCase();
  const exact = input.categories.find((c) => c.name.toLowerCase() === lower);
  const contains =
    exact ??
    input.categories.find((c) => lower.includes(c.name.toLowerCase()));

  return {
    categoryId: contains?.id ?? null,
    categoryName: contains?.name ?? null,
    raw: answer,
  };
}
