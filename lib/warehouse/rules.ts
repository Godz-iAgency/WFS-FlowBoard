import type { AssetCategory, AssetRow, ConnectionRow, ZoneType } from "@/types/database";

export function canPlaceInZone(category: AssetCategory, zoneType: ZoneType): boolean {
  if (category === "ULD") return zoneType === "LANE" || zoneType === "MIXED";
  if (category === "TRUCK") return zoneType === "DOCK";
  if (category === "TUG") return zoneType === "FREE_MOVEMENT";
  return false;
}

export function isValidUldOrientation(degrees: number): degrees is 0 | 180 {
  return degrees === 0 || degrees === 180;
}

export function canTow(parent: Pick<AssetRow, "asset_category" | "is_active">, child: Pick<AssetRow, "asset_category" | "is_active">): boolean {
  return parent.is_active && child.is_active && parent.asset_category === "TUG" && child.asset_category === "ULD";
}

export function isSlotAvailable(slotId: string, assets: Pick<AssetRow, "id" | "slot_id" | "is_active">[], ignoredAssetId?: string): boolean {
  return !assets.some((asset) => asset.is_active && asset.slot_id === slotId && asset.id !== ignoredAssetId);
}

export function departureSecondsRemaining(cleanupAt: string | null, nowMs = Date.now()): number | null {
  if (!cleanupAt) return null;
  return Math.max(0, Math.ceil((new Date(cleanupAt).getTime() - nowMs) / 1000));
}

export function isSoftRemoved(asset: Pick<AssetRow, "is_active" | "removed_at">): boolean {
  return !asset.is_active && asset.removed_at !== null;
}

export function isStaleVersion(currentVersion: number, expectedVersion: number): boolean {
  return currentVersion !== expectedVersion;
}

export function configurationReferencesAreValid(
  assets: Pick<AssetRow, "id" | "warehouse_id">[],
  connections: Pick<ConnectionRow, "parent_asset_id" | "child_asset_id" | "warehouse_id">[],
): boolean {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return connections.every((connection) => {
    const parent = byId.get(connection.parent_asset_id);
    const child = byId.get(connection.child_asset_id);
    return Boolean(parent && child && parent.warehouse_id === connection.warehouse_id && child.warehouse_id === connection.warehouse_id);
  });
}
