import { z } from "zod";

const publicEnvironmentSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(20),
  warehouseCode: z.string().min(1),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function readPublicEnvironment(): { data: PublicEnvironment | null; error: string | null } {
  const result = publicEnvironmentSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    warehouseCode: process.env.NEXT_PUBLIC_WAREHOUSE_CODE ?? "WFS-01",
  });

  if (!result.success) {
    return {
      data: null,
      error: "Supabase public environment variables are missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  return { data: result.data, error: null };
}
