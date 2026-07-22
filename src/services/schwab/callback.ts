/**
 * Schwab OAuth callback service (public, behind callback.bolivardrive.com).
 *
 * A deliberately tiny standalone HTTP service — NOT part of the PFM Next.js app —
 * so exposing it publicly can never expose financial data. It only:
 *   GET /         → redirect the browser to Schwab's authorize page
 *   GET /callback → exchange the returned code for tokens, persist them
 *   GET /health   → liveness
 *
 * Persisted tokens land in financialmanager.schwab_token (+ the transitional
 * tokens.json mirror). Run: `tsx src/services/schwab/callback.ts`.
 */
import { createServer } from "node:http";

import {
  authorizeUrl,
  callbackUrl,
  exchangeCode,
  normalizeCode,
} from "@/lib/schwab/oauth";
import { saveNewGrant } from "@/lib/schwab/store";

const PORT = Number(process.env.PORT ?? 8076);

function resultPage(title: string, message: string, ok: boolean): string {
  const color = ok ? "#22c55e" : "#ef4444";
  const icon = ok ? "&#10003;" : "&#10007;";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #1a120b; color: #e8ddca;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #241a10; border: 1px solid #4a3a24; border-radius: 16px; padding: 48px;
          text-align: center; max-width: 480px; }
  .icon { font-size: 48px; color: ${color}; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; color: #a8977a; line-height: 1.6; margin: 0; }
  .close { margin-top: 24px; display: inline-block; padding: 8px 24px; background: #4a3a24;
           border-radius: 8px; color: #e8ddca; text-decoration: none; font-size: 13px; }
</style></head>
<body><div class="card">
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <a class="close" href="javascript:window.close()">Close this tab</a>
</div></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        callback: callbackUrl(),
        app_key_set: Boolean(process.env.SCHWAB_APP_KEY),
      }),
    );
    return;
  }

  if (url.pathname === "/") {
    if (!process.env.SCHWAB_APP_KEY) {
      res.writeHead(500, { "content-type": "text/html" });
      res.end(resultPage("Configuration Error", "SCHWAB_APP_KEY not set.", false));
      return;
    }
    res.writeHead(302, { Location: authorizeUrl() });
    res.end();
    return;
  }

  if (url.pathname === "/callback") {
    const codeRaw = url.searchParams.get("code");
    if (!codeRaw) {
      res.writeHead(400, { "content-type": "text/html" });
      res.end(
        resultPage(
          "Authentication Failed",
          "No authorization code received from Schwab.",
          false,
        ),
      );
      return;
    }
    try {
      const dict = await exchangeCode(normalizeCode(codeRaw));
      await saveNewGrant(dict);
      console.log("[schwab-callback] tokens saved");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        resultPage(
          "Tokens Refreshed",
          "New Schwab tokens saved to PFM. The refresher will keep the access " +
            "token fresh automatically. You can close this tab.",
          true,
        ),
      );
    } catch (e) {
      console.error("[schwab-callback] token exchange failed:", e);
      res.writeHead(502, { "content-type": "text/html" });
      res.end(
        resultPage(
          "Token Exchange Failed",
          `Schwab rejected the exchange: ${String(e)}. Check the app credentials ` +
            "and that the callback URL is registered on the Schwab developer app.",
          false,
        ),
      );
    }
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[schwab-callback] listening on :${PORT} → ${callbackUrl()}`);
});
