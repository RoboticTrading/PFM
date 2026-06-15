import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "@/server/routers/_app";

/** Typed tRPC React hooks — the ONLY way the client talks to the server. */
export const trpc = createTRPCReact<AppRouter>();
