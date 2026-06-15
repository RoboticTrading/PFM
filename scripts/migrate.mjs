#!/usr/bin/env node
/**
 * PFM migrator — applies the Drizzle-generated SQL in `drizzle/` to MyDB as the
 * least-privilege `pfm` role.
 *
 * Why not `drizzle-kit migrate`? Its built-in migrator bootstraps its journal
 * with `CREATE SCHEMA IF NOT EXISTS`, which requires CREATE-on-database — a
 * privilege `pfm` deliberately lacks. The `financialmanager` schema is
 * pre-provisioned and owned by `pfm`, which CAN create objects *within* it. This
 * migrator does exactly that: it keeps the journal table inside
 * `financialmanager` and applies pending migrations transactionally. The journal
 * table matches drizzle's shape, so it stays interoperable.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

const ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(ROOT, "drizzle");
const MIGRATIONS_SCHEMA = "financialmanager";
const JOURNAL_TABLE = "__drizzle_migrations";

function loadLocalEnv() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set — skipping migrate (no MyDB).");
    process.exit(0);
  }

  const journalPath = resolve(MIGRATIONS_DIR, "meta/_journal.json");
  if (!existsSync(journalPath)) {
    console.error("No drizzle/meta/_journal.json — run `pnpm db:generate` first.");
    process.exit(1);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${JOURNAL_TABLE}" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`,
    );

    const applied = await sql.unsafe(
      `SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${JOURNAL_TABLE}"`,
    );
    const appliedHashes = new Set(applied.map((r) => r.hash));

    let count = 0;
    for (const entry of entries) {
      const file = resolve(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const body = readFileSync(file, "utf8");
      const hash = createHash("sha256").update(body).digest("hex");
      if (appliedHashes.has(hash)) continue;

      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx.unsafe(
          `INSERT INTO "${MIGRATIONS_SCHEMA}"."${JOURNAL_TABLE}" (hash, created_at) VALUES ($1, $2)`,
          [hash, entry.when],
        );
      });
      console.log(`applied ${entry.tag}`);
      count += 1;
    }

    console.log(count === 0 ? "migrations up to date" : `applied ${count} migration(s)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
