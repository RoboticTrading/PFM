import { TRPCError } from "@trpc/server";
import type { z } from "zod";

import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

import type { Context } from "../context";
import { publicProcedure } from "../trpc";

/** The Drizzle transaction handle handed to an Action's handler. */
export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export interface ActionHandlerArgs<TInput> {
  ctx: Context;
  input: TInput;
  /** Write within the SAME transaction as the audit row (atomic). */
  tx: DbTransaction;
}

export interface ActionConfig<TSchema extends z.ZodType, TOutput> {
  /** Stable Action name, recorded in AuditLog (e.g. "categorize"). */
  name: string;
  /** Zod schema — validates every call before authorize/handler run. */
  input: TSchema;
  /** Authorize the call. Defaults to allow (single-user PFM). */
  authorize?: (
    ctx: Context,
    input: z.infer<TSchema>,
  ) => boolean | Promise<boolean>;
  /** Perform the mutation. Runs inside the audit transaction. */
  handler: (args: ActionHandlerArgs<z.infer<TSchema>>) => Promise<TOutput>;
  /** Derive the audit `target` ref (e.g. a source_txn_id or account id). */
  target?: (input: z.infer<TSchema>, output: TOutput) => string | undefined;
  /** Redact the audited payload. Defaults to the raw (validated) input. */
  redact?: (input: z.infer<TSchema>) => Record<string, unknown>;
}

/**
 * The ONE way PFM state changes: a typed tRPC mutation that
 * **validates → authorizes → writes → records an AuditLog row**, atomically.
 *
 * Per `specs/ontology.md`, every mutation is an Action and every Action audits.
 * The handler's write and the audit row share one transaction, so a number can
 * never change without a matching, lineage-preserving audit entry.
 */
export function defineAction<TSchema extends z.ZodType, TOutput>(
  config: ActionConfig<TSchema, TOutput>,
) {
  return publicProcedure
    .input(config.input)
    .mutation(async ({ ctx, input: rawInput }): Promise<TOutput> => {
      // tRPC has already validated against `config.input`; narrow to the
      // schema's output type for the typed handler/target/redact callbacks.
      const input = rawInput as z.infer<TSchema>;

      const allowed = config.authorize
        ? await config.authorize(ctx, input)
        : true;
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Action "${config.name}" denied.`,
        });
      }

      return getDb().transaction(async (tx) => {
        const output = await config.handler({ ctx, input, tx });
        await tx.insert(auditLog).values({
          actor: ctx.actor,
          action: config.name,
          target: config.target?.(input, output),
          payload: config.redact
            ? config.redact(input)
            : (input as Record<string, unknown>),
        });
        return output;
      });
    });
}
