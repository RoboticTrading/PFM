import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { describeDb } from "@/test/db";

import { getDb, getSql, schema } from "./index";
import { seedCategories } from "./seed";

const EXPECTED_TABLES = [
  "audit_log",
  "institution",
  "account",
  "balance_forward",
  "category",
  "transaction_category",
  "payee",
  "budget",
  "position",
  "position_leg",
  "position_link",
  "import_batch",
];

describeDb("financialmanager schema (live MyDB)", () => {
  const createdInstitutions: string[] = [];

  afterAll(async () => {
    const db = getDb();
    if (createdInstitutions.length) {
      // account → institution (children first via cascade-free manual cleanup)
      await db
        .delete(schema.account)
        .where(inArray(schema.account.institutionId, createdInstitutions));
      await db
        .delete(schema.institution)
        .where(inArray(schema.institution.id, createdInstitutions));
    }
    await getSql().end({ timeout: 5 });
  });

  it("has every ontology table", async () => {
    const rows = await getDb().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'financialmanager' and table_type = 'BASE TABLE'
    `);
    const present = new Set(rows.map((r) => r.table_name));
    for (const table of EXPECTED_TABLES) {
      expect(present.has(table), `missing table: ${table}`).toBe(true);
    }
  });

  it("seeds the category hierarchy idempotently (>=12, all 3 kinds)", async () => {
    const first = await seedCategories(getDb());
    const second = await seedCategories(getDb());
    expect(second).toBe(first); // idempotent: no growth on re-run
    expect(second).toBeGreaterThanOrEqual(12);

    const kinds = await getDb()
      .selectDistinct({ kind: schema.category.kind })
      .from(schema.category);
    const kindSet = new Set(kinds.map((k) => k.kind));
    expect(kindSet).toEqual(new Set(["Income", "Expense", "Transfer"]));
  });

  it("round-trips an account with a jsonb column mapping over FKs", async () => {
    const db = getDb();
    const [inst] = await db
      .insert(schema.institution)
      .values({ name: "Schwab (test)", kind: "brokerage" })
      .returning();
    createdInstitutions.push(inst.id);

    const mapping = {
      transactionId: "transaction_id",
      transactionDate: "transaction_date",
      description: "description",
      amount: "amount",
    };
    const [acct] = await db
      .insert(schema.account)
      .values({
        institutionId: inst.id,
        name: "Brokerage (test)",
        kind: "brokerage",
        // Synthetic source key so it can't collide with the seeded registry's
        // account_source_unique (schema, view) natural key.
        sourceSchema: "schwab_brokerage",
        sourceView: "v_test_roundtrip_only",
        columnMapping: mapping,
      })
      .returning();

    const fetched = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.id, acct.id));
    expect(fetched[0].columnMapping).toEqual(mapping);
    expect(fetched[0].active).toBe(true);
  });
});
