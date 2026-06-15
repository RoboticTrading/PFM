import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";

import { publicProcedure, router } from "../trpc";

const accountColumns = {
  id: schema.account.id,
  name: schema.account.name,
  kind: schema.account.kind,
  active: schema.account.active,
  sourceSchema: schema.account.sourceSchema,
  sourceView: schema.account.sourceView,
  institutionName: schema.institution.name,
  institutionKind: schema.institution.kind,
};

export const accountsRouter = router({
  /** All registered accounts with their institution, name-ordered. */
  list: publicProcedure.query(async () => {
    return getDb()
      .select(accountColumns)
      .from(schema.account)
      .innerJoin(
        schema.institution,
        eq(schema.account.institutionId, schema.institution.id),
      )
      .orderBy(asc(schema.account.name));
  }),

  /** A single account with its institution, or null. */
  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [row] = await getDb()
        .select(accountColumns)
        .from(schema.account)
        .innerJoin(
          schema.institution,
          eq(schema.account.institutionId, schema.institution.id),
        )
        .where(eq(schema.account.id, input.id))
        .limit(1);
      return row ?? null;
    }),
});
