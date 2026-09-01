"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string;
}

function authenticationErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message === "Invalid login credentials") return "Email or password is incorrect.";
    if (message.toLowerCase().includes("fetch failed") || message.toLowerCase().includes("network")) {
      return "Cannot reach the secure sign-in service. Check the connection and try again.";
    }
  }
  return "Sign in failed. Please try again.";
}

export async function signIn(_previousState: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter both your email address and password." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: authenticationErrorMessage(error) };
  } catch (error) {
    return { error: authenticationErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
