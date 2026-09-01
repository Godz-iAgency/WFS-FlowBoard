import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";

export class BoardRepositoryError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "BoardRepositoryError";
  }
}

function throwQueryError(stage: string, message: string, error: { code?: string; message: string; details?: string; hint?: string }): never {
  console.error("Warehouse snapshot query failed", {
    stage,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  throw new BoardRepositoryError(message, `${stage}:${error.code ?? "UNKNOWN"}`);
}

export async function getBoardSnapshot(
  supabase: SupabaseClient<Database>,
  warehouseCode: string,
): Promise<BoardSnapshot> {
  const [warehouseResult, claimsResult] = await Promise.all([
    supabase.from("warehouses").select("*").eq("code", warehouseCode).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  if (warehouseResult.error) throwQueryError("WAREHOUSE", "The warehouse could not be loaded.", warehouseResult.error);
  if (!warehouseResult.data) throw new BoardRepositoryError("You do not have access to this warehouse.", "WAREHOUSE_UNAVAILABLE");
  const userId = claimsResult.data?.claims?.sub;
  if (claimsResult.error || typeof userId !== "string") throw new BoardRepositoryError("Your authenticated session could not be verified.", "SESSION_UNAVAILABLE");

  const warehouse = warehouseResult.data;
  const [zoneResult, assetResult, connectionResult, configurationResult, eventResult, membershipResult] = await Promise.all([
    supabase.from("zones").select("*").eq("warehouse_id", warehouse.id).eq("is_active", true).order("code"),
    supabase.from("live_assets").select("*").eq("warehouse_id", warehouse.id),
    supabase.from("asset_connections").select("*").eq("warehouse_id", warehouse.id).eq("is_active", true),
    supabase.from("configurations").select("*").eq("warehouse_id", warehouse.id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("asset_events").select("*").eq("warehouse_id", warehouse.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("warehouse_memberships").select("role").eq("warehouse_id", warehouse.id).eq("user_id", userId).maybeSingle(),
  ]);

  if (zoneResult.error) throwQueryError("ZONES", "Warehouse zones could not be loaded.", zoneResult.error);
  if (assetResult.error) throwQueryError("LIVE_ASSETS", "Live warehouse assets could not be loaded.", assetResult.error);
  if (connectionResult.error) throwQueryError("CONNECTIONS", "Asset connections could not be loaded.", connectionResult.error);
  if (configurationResult.error) throwQueryError("CONFIGURATIONS", "Saved configurations could not be loaded.", configurationResult.error);
  if (eventResult.error) throwQueryError("EVENTS", "Recent warehouse history could not be loaded.", eventResult.error);
  if (membershipResult.error) throwQueryError("MEMBERSHIP", "Warehouse membership could not be verified.", membershipResult.error);
  if (!membershipResult.data) throw new BoardRepositoryError("Warehouse membership could not be verified.", "MEMBERSHIP:NOT_FOUND");

  const zoneIds = zoneResult.data.map((zone) => zone.id);
  const slotResult = zoneIds.length
    ? await supabase.from("slots").select("*").in("zone_id", zoneIds).eq("is_active", true).order("slot_number")
    : { data: [], error: null };

  if (slotResult.error) throwQueryError("SLOTS", "Warehouse lane slots could not be loaded.", slotResult.error);

  const zones: ZoneWithSlots[] = zoneResult.data.map((zone) => ({
    ...zone,
    slots: slotResult.data.filter((slot) => slot.zone_id === zone.id),
  }));

  return {
    warehouse,
    zones,
    assets: assetResult.data,
    connections: connectionResult.data,
    configurations: configurationResult.data,
    recentEvents: eventResult.data,
    currentRole: membershipResult.data.role,
    fetchedAt: new Date().toISOString(),
  };
}
