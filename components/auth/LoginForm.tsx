"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { signIn, type SignInState } from "@/app/auth/actions";

const EMPTY_STATE: SignInState = { error: "" };

export function LoginForm() {
  const searchParams = useSearchParams();
  const initialState = searchParams.get("error")
    ? { error: "The sign-in link could not be completed. Please try again." }
    : EMPTY_STATE;
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <section className="login-card" aria-labelledby="login-heading">
      <p className="eyebrow">AUTHORIZED USERS</p>
      <h2 id="login-heading">Sign in to the live board</h2>
      <form action={formAction}>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9 5.5 9 5.5a16 16 0 01-2.2 2.7M6.2 6.2C4.2 7.6 3 9.5 3 9.5S6.5 15 12 15c1 0 2-.2 2.8-.5" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12z" /><circle cx="12" cy="12" r="2.5" /></svg>
            )}
          </button>
        </div>
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="login-note">Access is controlled by warehouse membership and role.</p>
    </section>
  );
}
