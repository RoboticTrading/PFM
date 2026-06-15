import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_COOKIE,
  authConfigured,
  isAuthed,
  sessionValue,
  verifyPin,
} from "./auth";

const prevPin = process.env.PFM_PIN;
const prevSecret = process.env.PFM_SESSION_SECRET;

describe("PIN gate", () => {
  beforeEach(() => {
    process.env.PFM_PIN = "1234";
    process.env.PFM_SESSION_SECRET = "test-secret";
  });
  afterEach(() => {
    process.env.PFM_PIN = prevPin;
    process.env.PFM_SESSION_SECRET = prevSecret;
  });

  it("verifies the configured PIN", () => {
    expect(verifyPin("1234")).toBe(true);
    expect(verifyPin("0000")).toBe(false);
    expect(verifyPin("")).toBe(false);
  });

  it("authorizes only a cookie holding the session secret", () => {
    expect(isAuthed(sessionValue())).toBe(true);
    expect(isAuthed("wrong")).toBe(false);
    expect(isAuthed(undefined)).toBe(false);
  });

  it("is configured when PIN + secret are present", () => {
    expect(authConfigured()).toBe(true);
    expect(AUTH_COOKIE).toBe("pfm_auth");
  });

  it("denies everything when no PIN is configured", () => {
    process.env.PFM_PIN = "";
    expect(verifyPin("")).toBe(false);
    expect(verifyPin("anything")).toBe(false);
    expect(authConfigured()).toBe(false);
  });

  it("denies when no session secret is configured", () => {
    process.env.PFM_SESSION_SECRET = "";
    expect(isAuthed("")).toBe(false);
    expect(authConfigured()).toBe(false);
  });
});
