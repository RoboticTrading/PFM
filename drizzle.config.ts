import { defineConfig } from "drizzle-kit";

import { loadLocalEnv } from "./src/lib/env";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. drizzle-kit needs the `pfm` MyDB role " +
      "(set it in .env.local). It builds + migrates `financialmanager` only.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  // Only ever manage the schema PFM owns. The source schemas are read-only and
  // must never appear in generated migrations or introspection diffs.
  schemaFilter: ["financialmanager"],
  // Keep the migration journal inside financialmanager (pfm cannot write public).
  migrations: { schema: "financialmanager", table: "__drizzle_migrations" },
  verbose: true,
  strict: true,
});
