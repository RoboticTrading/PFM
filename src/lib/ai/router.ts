import { type AiConfig, defaultAiConfig } from "./config";
import type { AiRequest, AiResult, AiRole } from "./types";

/**
 * Routes a *role* to its bound provider+model. Refuses to run when the AI layer
 * is disabled — PFM is manual-first, so nothing calls a model unless explicitly
 * turned on. Suggest-only by contract: callers surface results for human
 * confirmation; only Actions write state.
 */
export class AiRouter {
  constructor(private readonly config: AiConfig) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async run(role: AiRole, req: AiRequest): Promise<AiResult> {
    if (!this.config.enabled) {
      throw new Error(
        "AI is disabled (manual-first). Set AI_ENABLED=true and MOE_BASE_URL to enable.",
      );
    }
    const binding = this.config.roles[role];
    if (!binding) throw new Error(`No AI binding for role "${role}".`);
    const provider = this.config.providers[binding.provider];
    if (!provider) {
      throw new Error(
        `Provider "${binding.provider}" for role "${role}" is not configured.`,
      );
    }
    return provider.complete(req, binding.model);
  }
}

/**
 * Build a router from env, with optional overrides for swapping providers/config
 * (used in tests and when wiring an alternate backend).
 */
export function createAiRouter(
  overrides?: Partial<AiConfig>,
  env: NodeJS.ProcessEnv = process.env,
): AiRouter {
  const base = defaultAiConfig(env);
  return new AiRouter({
    enabled: overrides?.enabled ?? base.enabled,
    roles: { ...base.roles, ...overrides?.roles },
    providers: { ...base.providers, ...overrides?.providers },
  });
}
