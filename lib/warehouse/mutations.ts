import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetRow, ConfigurationRow, ConnectionRow, Database, Json, TruckStatus } from "@/types/database";

export class WarehouseMutationError extends Error {
  constructor(message: string, readonly stale: boolean) {
    super(message);
    this.name = "WarehouseMutationError";
  }
}

function mutationFailure(message: string): WarehouseMutationError {
  const stale = message.includes("STALE_VERSION") || message.includes("40001");
  const undoUnavailable = message.includes("UNDO_UNAVAILABLE") || message.includes("NOTHING_TO_UNDO");
  return new WarehouseMutationError(
    stale
      ? "This asset was updated by another user. The latest state has been loaded."
      : undoUnavailable
        ? message.replace(/^(UNDO_UNAVAILABLE|NOTHING_TO_UNDO):\s*/, "")
        : message,
    stale,
  );
}

export async function moveAsset(
  supabase: SupabaseClient<Database>,
  input: {
    assetId: string;
    expectedVersion: number;
    zoneId: string;
    slotId?: string | null;
    x?: number | null;
    y?: number | null;
    orientationDegrees?: number | null;
  },
): Promise<AssetRow> {
  const { data, error } = await supabase.rpc("move_asset", {
    p_asset_id: input.assetId,
    p_expected_version: input.expectedVersion,
    p_zone_id: input.zoneId,
    p_slot_id: input.slotId ?? null,
    p_x_position: input.x ?? null,
    p_y_position: input.y ?? null,
    p_orientation_degrees: input.orientationDegrees ?? null,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function updateTruckStatus(
  supabase: SupabaseClient<Database>,
  asset: Pick<AssetRow, "id" | "version">,
  status: TruckStatus,
): Promise<AssetRow> {
  const { data, error } = await supabase.rpc("set_truck_status", {
    p_asset_id: asset.id,
    p_expected_version: asset.version,
    p_status: status,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function softRemoveAsset(
  supabase: SupabaseClient<Database>,
  asset: Pick<AssetRow, "id" | "version">,
): Promise<AssetRow> {
  const { data, error } = await supabase.rpc("soft_remove_asset", {
    p_asset_id: asset.id,
    p_expected_version: asset.version,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function updateUldDestination(
  supabase: SupabaseClient<Database>,
  asset: Pick<AssetRow, "id" | "version">,
  destination: string,
): Promise<AssetRow> {
  const { data, error } = await supabase.rpc("update_uld_destination", {
    p_asset_id: asset.id,
    p_expected_version: asset.version,
    p_destination: destination,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function disconnectTow(
  supabase: SupabaseClient<Database>,
  connection: Pick<ConnectionRow, "id" | "version">,
): Promise<ConnectionRow> {
  const { data, error } = await supabase.rpc("disconnect_tow", {
    p_connection_id: connection.id,
    p_expected_version: connection.version,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function undoLastAction(supabase: SupabaseClient<Database>, warehouseId: string): Promise<Json> {
  const { data, error } = await supabase.rpc("undo_last_action", { p_warehouse_id: warehouseId });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function saveBoardConfiguration(
  supabase: SupabaseClient<Database>,
  warehouseId: string,
  name: string,
  description?: string,
): Promise<ConfigurationRow> {
  const { data, error } = await supabase.rpc("save_board_configuration", {
    p_warehouse_id: warehouseId,
    p_name: name,
    p_description: description ?? null,
  });
  if (error) throw mutationFailure(error.message);
  return data;
}

export async function loadBoardConfiguration(supabase: SupabaseClient<Database>, configurationId: string): Promise<Json> {
  const { data, error } = await supabase.rpc("load_board_configuration", { p_configuration_id: configurationId });
  if (error) throw mutationFailure(error.message);
  return data;
}
