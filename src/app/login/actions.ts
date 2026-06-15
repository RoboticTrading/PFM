"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE, sessionValue, verifyPin } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Verify the PIN and, on success, set the session cookie and enter the app. */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const pin = String(formData.get("pin") ?? "");
  if (!verifyPin(pin)) {
    return { error: "Incorrect PIN." };
  }
  const store = await cookies();
  store.set(AUTH_COOKIE, sessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  redirect("/dashboard");
}

/** Clear the session and return to the login screen. */
export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
  redirect("/login");
}
