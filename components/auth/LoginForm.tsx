"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error") ? "The sign-in link could not be completed. Please try again." : "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "Email or password is incorrect." : "Sign in failed. Please try again.");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <section className="login-card" aria-labelledby="login-heading">
      <p className="eyebrow">AUTHORIZED USERS</p>
      <h2 id="login-heading">Sign in to the live board</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="login-note">Access is controlled by warehouse membership and role.</p>
    </section>
  );
}
