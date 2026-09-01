import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/AccessDenied";
import { BoardLoadFailure } from "@/components/BoardLoadFailure";
import { SetupRequired } from "@/components/SetupRequired";
import { WarehouseApplication } from "@/components/warehouse/WarehouseApplication";
import { readPublicEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { BoardRepositoryError, getBoardSnapshot } from "@/lib/warehouse/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const environment = readPublicEnvironment();
  if (!environment.data) return <SetupRequired message={environment.error ?? "Supabase is not configured."} />;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  let snapshot;
  try {
    snapshot = await getBoardSnapshot(supabase, environment.data.warehouseCode);
  } catch (error) {
    if (error instanceof BoardRepositoryError && error.code === "WAREHOUSE_UNAVAILABLE") {
      return <AccessDenied warehouseCode={environment.data.warehouseCode} />;
    }
    if (error instanceof BoardRepositoryError) {
      return <BoardLoadFailure message={error.message} code={error.code} />;
    }
    throw error;
  }

  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "Signed-in user";
  return <WarehouseApplication initialSnapshot={snapshot} userEmail={email} />;
}
