import { createMoeProvider } from "./providers/moe";
import type { AiProvider, AiRole } from "./types";

export interface RoleBinding {
  /** Provider id to use for this role (must exist in `providers`). */
  provider: string;
  /** Model name passed to the provider. */
  model: string;
}

export interface AiConfig {
  /** Master switch — **false by default** (manual-first). */
  enabled: boolean;
  /** Role → provider+model binding. */
  roles: Record<AiRole, RoleBinding>;
  /** Available providers, keyed by id. */
  providers: Record<string, AiProvider>;
}

/** AI is opt-in: enabled only when `AI_ENABLED=true` AND a MoE URL is set. */
export function aiEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_ENABLED === "true" && Boolean(env.MOE_BASE_URL);
}

/**
 * Build the default config from the environment. Providers are always
 * registered (so the wiring is testable), but `enabled` gates any real call.
 */
export function defaultAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiConfig {
  const providers: Record<string, AiProvider> = {};
  if (env.MOE_BASE_URL) {
    providers.moe = createMoeProvider({
      baseUrl: env.MOE_BASE_URL,
      apiKey: env.MOE_API_KEY,
    });
  }
  return {
    enabled: aiEnabledFromEnv(env),
    roles: {
      categorize: { provider: "moe", model: env.MOE_MODEL ?? "qwen2.5" },
      insights: { provider: "moe", model: env.MOE_MODEL ?? "qwen2.5" },
    },
    providers,
  };
}
