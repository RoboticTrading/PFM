"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "@/app/login/actions";

const initial: LoginState = {};

/** PIN entry form (server-action driven; no client fetch). */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="pin" className="text-sm text-fg-muted">
        Enter PIN
      </label>
      <Input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoFocus
        autoComplete="off"
        aria-invalid={state.error ? true : undefined}
      />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
