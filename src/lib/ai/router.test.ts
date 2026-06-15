import { describe, expect, it, vi } from "vitest";

import { createAiRouter } from "./router";
import type { AiProvider } from "./types";

function mockProvider(): AiProvider {
  return {
    id: "mock",
    complete: vi.fn(async (_req, model) => ({
      text: "Groceries",
      model,
    })),
  };
}

describe("AiRouter", () => {
  it("routes a role to its bound (mock) provider — no network", async () => {
    const provider = mockProvider();
    const router = createAiRouter(
      {
        enabled: true,
        providers: { mock: provider },
        roles: {
          categorize: { provider: "mock", model: "test-model" },
          insights: { provider: "mock", model: "test-model" },
        },
      },
      {} as NodeJS.ProcessEnv,
    );

    const result = await router.run("categorize", {
      messages: [{ role: "user", content: "Whole Foods $82.10" }],
    });

    expect(result.text).toBe("Groceries");
    expect(result.model).toBe("test-model");
    expect(provider.complete).toHaveBeenCalledOnce();
  });

  it("is off by default (manual-first) and refuses to run", async () => {
    const router = createAiRouter(undefined, {} as NodeJS.ProcessEnv);
    expect(router.enabled).toBe(false);
    await expect(
      router.run("categorize", { messages: [] }),
    ).rejects.toThrow(/disabled/i);
  });

  it("enables only when AI_ENABLED=true and MOE_BASE_URL is set", () => {
    const off = createAiRouter(undefined, {
      AI_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(off.enabled).toBe(false);

    const on = createAiRouter(undefined, {
      AI_ENABLED: "true",
      MOE_BASE_URL: "http://lan:11434/v1",
    } as unknown as NodeJS.ProcessEnv);
    expect(on.enabled).toBe(true);
  });
});
