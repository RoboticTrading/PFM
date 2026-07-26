import { z } from "zod";

import {
  accountRegister,
  matchingRefs,
  registerPage,
} from "@/lib/accounts/register";
import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";

import { publicProcedure, router } from "../trpc";

export const transactionsRouter = router({
  /**
   * Register rows for an account: canonical ledger transactions (RO, from
   * `cube.v_ledger`) enriched with their categorization. `accountId` is the cube
   * `account_key`; the {@link ALL_ACCOUNTS} sentinel streams every account
   * unified. Read-only; lineage by (source_schema, source_txn_id).
   */
  forAccount: publicProcedure
    .input(
      z.object({
        accountId: z.string().min(1),
        limit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(({ input }) =>
      accountRegister(input.accountId, { limit: input.limit }),
    ),

  /**
   * A filtered, paginated page of the unified ledger, driven SERVER-side so the
   * workspace can burn down uncategorized transactions across the FULL history
   * (not just the newest window). Every facet — categorized-state, account,
   * description search, amount sign, date range — runs in SQL. Returns the page
   * plus `total` (all filters) and `uncategorized` (non-category filters) counts,
   * so the header reflects the real remaining work. Read-only; lineage by
   * (source_schema, source_txn_id). `accountId` is the cube `account_key`; the
   * {@link ALL_ACCOUNTS} sentinel spans every account unified.
   */
  page: publicProcedure
    .input(
      z.object({
        accountId: z.string().min(1),
        /** "all" | "categorized" | "uncategorized" | split sentinel | uuid. */
        category: z.string().default("all"),
        query: z.string().default(""),
        direction: z.enum(["all", "in", "out"]).default("all"),
        from: z.string().default(""),
        to: z.string().default(""),
        limit: z.number().int().min(1).max(500).default(200),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      registerPage({
        accountKey:
          input.accountId === ALL_ACCOUNTS ? undefined : input.accountId,
        category: input.category,
        query: input.query,
        direction: input.direction,
        from: input.from || undefined,
        to: input.to || undefined,
        limit: input.limit,
        offset: input.offset,
      }),
    ),

  /**
   * Every write-ref matching a filter (no pagination) — the "select all N
   * matching this filter" escape hatch from per-page selection. Same facets as
   * {@link page}, so the gathered set is exactly what the register shows. Returns
   * `{ refs, total, capped }`; the client hands the refs to `categorizeBulk`.
   */
  matchingRefs: publicProcedure
    .input(
      z.object({
        accountId: z.string().min(1),
        category: z.string().default("all"),
        query: z.string().default(""),
        direction: z.enum(["all", "in", "out"]).default("all"),
        from: z.string().default(""),
        to: z.string().default(""),
      }),
    )
    .query(({ input }) =>
      matchingRefs({
        accountKey:
          input.accountId === ALL_ACCOUNTS ? undefined : input.accountId,
        category: input.category,
        query: input.query,
        direction: input.direction,
        from: input.from || undefined,
        to: input.to || undefined,
      }),
    ),
});
