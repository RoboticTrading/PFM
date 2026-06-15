import type { AiProvider, AiRequest, AiResult } from "../types";

interface MoeOptions {
  /** OpenAI-compatible base URL, e.g. http://host:11434/v1 (the LAN MoE grid). */
  baseUrl: string;
  /** Optional API key (the LAN grid usually needs none). */
  apiKey?: string;
}

/**
 * The self-hosted MoE provider — talks to an OpenAI-compatible `/chat/completions`
 * endpoint (Ollama-style) on the LAN. $0, never phones home. Only invoked when
 * the AI layer is explicitly enabled.
 *
 * NOTE: this is a *server-side outbound* call to a third-party LLM endpoint, the
 * one legitimate use of `fetch` in the codebase (the no-raw-fetch rule governs
 * client↔PFM data flow — see the eslint override for `src/lib/ai`).
 */
export function createMoeProvider(opts: MoeOptions): AiProvider {
  return {
    id: "moe",
    async complete(req: AiRequest, model: string): Promise<AiResult> {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens,
          stream: false,
        }),
      });
      if (!res.ok) {
        throw new Error(`MoE request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: data.model ?? model,
      };
    },
  };
}
