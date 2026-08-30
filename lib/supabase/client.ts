import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublicEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const environment = readPublicEnvironment();
  if (!environment.data) throw new Error(environment.error ?? "Supabase is not configured.");
  browserClient = createBrowserClient<Database>(environment.data.url, environment.data.publishableKey);
  return browserClient;
}
