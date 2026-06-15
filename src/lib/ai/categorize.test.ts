import { describe, expect, it, vi } from "vitest";

import { suggestCategory } from "./categorize";
import { createAiRouter } from "./router";
import type { AiProvider } from "./types";

const CATEGORIES = [
  { id: "c-gro", name: "Groceries" },
  { id: "c-din", name: "Dining" },
  { id: "c-sal", name: "Salary" },
];

function routerReturning(text: string) {
  const provider: AiProvider = {
    id: "mock",
    complete: vi.fn(async (_req, model) => ({ text, model })),
  };
  return createAiRouter(
    {
      enabled: true,
      providers: { mock: provider },
      roles: {
        categorize: { provider: "mock", model: "test" },
        insights: { provider: "mock", model: "test" },
      },
    },
    {} as NodeJS.ProcessEnv,
  );
}

describe("suggestCategory (mocked MoE, no network)", () => {
  it("matches an exact category name", async () => {
    const s = await suggestCategory(routerReturning("Groceries"), {
      description: "WHOLE FOODS",
      amount: "-82.10",
      categories: CATEGORIES,
    });
    expect(s.categoryId).toBe("c-gro");
    expect(s.categoryName).toBe("Groceries");
  });

  it("matches when the model adds prose around the name", async () => {
    const s = await suggestCategory(
      routerReturning("This looks like Dining to me."),
      { description: "CHIPOTLE", amount: "-12.40", categories: CATEGORIES },
    );
    expect(s.categoryId).toBe("c-din");
  });

  it("returns null match (but keeps raw) when nothing matches", async () => {
    const s = await suggestCategory(routerReturning("Aardvarks"), {
      description: "???",
      amount: "0",
      categories: CATEGORIES,
    });
    expect(s.categoryId).toBeNull();
    expect(s.raw).toBe("Aardvarks");
  });

  it("refuses to run when AI is disabled (manual-first)", async () => {
    const disabled = createAiRouter(undefined, {} as NodeJS.ProcessEnv);
    await expect(
      suggestCategory(disabled, {
        description: "x",
        amount: "0",
        categories: CATEGORIES,
      }),
    ).rejects.toThrow(/disabled/i);
  });
});
