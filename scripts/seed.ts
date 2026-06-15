/**
 * Seed reference data (the default Category hierarchy) into MyDB. Idempotent —
 * safe to run repeatedly. The seed logic lives in `src/lib/db/seed.ts` so the
 * schema test exercises the same path; this script just runs it as `pfm`.
 *
 * Run via `pnpm db:seed` (tsx loads the TypeScript + .env.local).
 */
import { loadLocalEnv } from "../src/lib/env";
import { getDb, getSql } from "../src/lib/db";
import { seedCategories } from "../src/lib/db/seed";

async function main(): Promise<void> {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — skipping seed (no MyDB).");
    return;
  }
  try {
    const count = await seedCategories(getDb());
    console.log(`categories present: ${count}`);
  } finally {
    await getSql().end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
