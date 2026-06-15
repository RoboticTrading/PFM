/**
 * AI layer types. PFM's AI is **manual-first**: it only ever *suggests* (e.g.
 * a category for a transaction) and a human confirms — Actions, not the model,
 * write state. The router is role-based and provider-swappable; the self-hosted
 * MoE grid is the default provider, but the whole layer is **off by default**.
 */

/** A model "role" — a use-case binding, not a model name. */
export type AiRole = "categorize" | "insights";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiRequest {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiResult {
  text: string;
  /** Model that produced the result (for provenance). */
  model: string;
}

/** A pluggable completion backend (MoE, a mock, a future hosted model, …). */
export interface AiProvider {
  id: string;
  complete(req: AiRequest, model: string): Promise<AiResult>;
}
