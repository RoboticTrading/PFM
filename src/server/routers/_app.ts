import { dbHealth, hasDatabaseUrl } from "@/lib/db";

import { publicProcedure, router } from "../trpc";

export const appRouter = router({
  /**
   * Liveness + MyDB reachability. Never throws — DB problems surface as
   * `db.reachable: false` so the cockpit can show a degraded state rather than
   * erroring. (In CI / no-DB, `db.configured` is false.)
   */
  health: publicProcedure.query(async () => {
    const configured = hasDatabaseUrl();
    let db: { configured: boolean; reachable: boolean; role?: string } = {
      configured,
      reachable: false,
    };
    if (configured) {
      try {
        const h = await dbHealth();
        db = { configured, reachable: true, role: h.user };
      } catch {
        db = { configured, reachable: false };
      }
    }
    return { ok: true as const, app: "pfm" as const, db };
  }),
});

export type AppRouter = typeof appRouter;
