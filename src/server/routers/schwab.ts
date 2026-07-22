import { tokenStatus } from "@/lib/schwab/store";

import { publicProcedure, router } from "../trpc";

/**
 * Schwab token status for the System page. The token itself is managed by the
 * standalone callback + refresher services; this just exposes the freshness
 * readout that backs the "Refresh Token" card.
 */
export const schwabRouter = router({
  tokenStatus: publicProcedure.query(() => tokenStatus()),
});
