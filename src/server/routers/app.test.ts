import { describe, expect, it } from "vitest";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const createCaller = createCallerFactory(appRouter);

describe("appRouter.health (typed caller)", () => {
  it("reports liveness and DB reachability", async () => {
    const caller = createCaller(createContext());
    const res = await caller.health();

    expect(res.ok).toBe(true);
    expect(res.app).toBe("pfm");
    // db.configured mirrors whether a DATABASE_URL is present in this env.
    expect(res.db.configured).toBe(Boolean(process.env.DATABASE_URL));
    if (res.db.configured && res.db.reachable) {
      expect(res.db.role).toBe("pfm");
    }
  });
});
