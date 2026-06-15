import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env.local` into `process.env` for non-Next contexts (drizzle-kit CLI,
 * vitest) — Next.js loads it automatically for the app, but these tools don't.
 * Never overrides an already-set variable, and silently no-ops if the file is
 * absent (e.g. CI), so DB-requiring code can detect "no DB" and skip cleanly.
 */
export function loadLocalEnv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}
