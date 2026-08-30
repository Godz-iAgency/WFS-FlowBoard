import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readPublicEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  const environment = readPublicEnvironment();
  if (!environment.data) throw new Error(environment.error ?? "Supabase is not configured.");

  return createServerClient<Database>(environment.data.url, environment.data.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
