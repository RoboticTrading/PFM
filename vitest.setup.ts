import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { loadLocalEnv } from "@/lib/env";

// Make DATABASE_URL (etc.) available to DB-touching tests locally; absent in CI,
// where those tests skip cleanly.
loadLocalEnv();

afterEach(() => {
  cleanup();
});
