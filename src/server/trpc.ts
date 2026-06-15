import { initTRPC } from "@trpc/server";
import superjson from "superjson";

import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

/** Build a tRPC router. */
export const router = t.router;
/** A procedure with no auth requirement (PFM is single-user; PIN gates at edge). */
export const publicProcedure = t.procedure;
/** Server-side caller factory (used in tests and RSC). */
export const createCallerFactory = t.createCallerFactory;
