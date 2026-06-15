import { asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

import { publicProcedure, router } from "../trpc";

export const accountsRouter = router({
  /** All registered accounts with their institution, name-ordered. */
  list: publicProcedure.query(async () => {
    const db = getDb();
    return db
      .select({
        id: schema.account.id,
        name: schema.account.name,
        kind: schema.account.kind,
        active: schema.account.active,
        sourceSchema: schema.account.sourceSchema,
        sourceView: schema.account.sourceView,
        institutionName: schema.institution.name,
        institutionKind: schema.institution.kind,
      })
      .from(schema.account)
      .innerJoin(
        schema.institution,
        eq(schema.account.institutionId, schema.institution.id),
      )
      .orderBy(asc(schema.account.name));
  }),
});
