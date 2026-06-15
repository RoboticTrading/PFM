import { describe } from "vitest";

import { hasDatabaseUrl } from "@/lib/db";

/**
 * Use for any test suite that touches MyDB. It runs locally (the loop's machine
 * reaches `data02`) and **skips cleanly in CI**, where no `DATABASE_URL` is set
 * — so the gate never blocks on DB availability (see specs/infrastructure.md).
 *
 *   describeDb("...", () => { it("hits MyDB", async () => { ... }); });
 */
export const describeDb = hasDatabaseUrl() ? describe : describe.skip;
