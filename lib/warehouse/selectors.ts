import type { AssetRow, SlotRow, TruckStatus } from "@/types/database";
import type { BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";
import { isSlotAvailable } from "@/lib/warehouse/rules";

export interface ZoneOccupancy {
  occupied: number;
  capacity: number;
}

export interface OperationalSummary {
  uldOccupied: number;
  uldCapacity: number;
  docksOccupied: number;
  docksCapacity: number;
  trucks: Record<Exclude<TruckStatus, "NONE">, number>;
}

export type SearchResult =
  | { type: "asset"; id: string; title: string; detail: string }
  | { type: "zone"; id: string; title: string; detail: string };

export function getZoneOccupancy(zone: ZoneWithSlots, assets: AssetRow[]): ZoneOccupancy {
  const slotIds = new Set(zone.slots.map((slot) => slot.id));
  return {
    occupied: assets.filter((asset) => asset.is_active && asset.asset_category === "ULD" && asset.slot_id !== null && slotIds.has(asset.slot_id)).length,
    capacity: zone.capacity ?? zone.slots.length,
  };
}

export function getOperationalSummary(snapshot: BoardSnapshot): OperationalSummary {
  const positionZones = snapshot.zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED");
  const dockZones = snapshot.zones.filter((zone) => zone.zone_type === "DOCK");
  const trucks = snapshot.assets.filter((asset) => asset.is_active && asset.asset_category === "TRUCK");
  return {
    uldOccupied: positionZones.reduce((total, zone) => total + getZoneOccupancy(zone, snapshot.assets).occupied, 0),
    uldCapacity: positionZones.reduce((total, zone) => total + (zone.capacity ?? zone.slots.length), 0),
    docksOccupied: new Set(trucks.map((truck) => truck.zone_id).filter(Boolean)).size,
    docksCapacity: dockZones.length,
    trucks: {
      LOADING: trucks.filter((truck) => truck.truck_status === "LOADING").length,
      UNLOADING: trucks.filter((truck) => truck.truck_status === "UNLOADING").length,
      COMPLETE: trucks.filter((truck) => truck.truck_status === "COMPLETE").length,
      DEPARTING: trucks.filter((truck) => truck.truck_status === "DEPARTING").length,
    },
  };
}

export function getDockTruck(zoneId: string, assets: AssetRow[]): AssetRow | undefined {
  return assets.find((asset) => asset.is_active && asset.asset_category === "TRUCK" && asset.zone_id === zoneId);
}

export function findNearestAvailableDock(
  position: { x: number; y: number },
  zones: ZoneWithSlots[],
  assets: AssetRow[],
  ignoredAssetId?: string,
  maximumDistance = 170,
): ZoneWithSlots | null {
  let nearest: { zone: ZoneWithSlots; distance: number } | null = null;
  for (const zone of zones) {
    if (zone.zone_type !== "DOCK") continue;
    const occupied = assets.some((asset) =>
      asset.is_active && asset.asset_category === "TRUCK" && asset.zone_id === zone.id && asset.id !== ignoredAssetId,
    );
    if (occupied) continue;
    const target = { x: zone.x + zone.width + 92, y: zone.y + zone.height / 2 };
    const distance = Math.hypot(target.x - position.x, target.y - position.y);
    if (distance <= maximumDistance && (!nearest || distance < nearest.distance)) nearest = { zone, distance };
  }
  return nearest?.zone ?? null;
}

export function isPointInsideZone(position: { x: number; y: number }, zone: ZoneWithSlots, margin = 0): boolean {
  return position.x >= zone.x + margin
    && position.x <= zone.x + zone.width - margin
    && position.y >= zone.y + margin
    && position.y <= zone.y + zone.height - margin;
}

export function dockIndicatorColor(truck: AssetRow | undefined): string {
  if (!truck) return "#8b98a5";
  if (truck.truck_status === "COMPLETE") return "#ef8d22";
  if (truck.truck_status === "DEPARTING") return "#2d78d5";
  if (truck.truck_status === "LOADING" || truck.truck_status === "UNLOADING") return "#2fa765";
  return "#8b98a5";
}

export function findNearestAvailableSlot(
  position: { x: number; y: number },
  zones: ZoneWithSlots[],
  assets: AssetRow[],
  ignoredAssetId?: string,
  maximumDistance = 82,
): { zone: ZoneWithSlots; slot: SlotRow; distance: number } | null {
  let nearest: { zone: ZoneWithSlots; slot: SlotRow; distance: number } | null = null;
  for (const zone of zones) {
    if (zone.zone_type !== "LANE" && zone.zone_type !== "MIXED") continue;
    for (const slot of zone.slots) {
      if (!isSlotAvailable(slot.id, assets, ignoredAssetId)) continue;
      const distance = Math.hypot(slot.x - position.x, slot.y - position.y);
      if (distance <= maximumDistance && (!nearest || distance < nearest.distance)) nearest = { zone, slot, distance };
    }
  }
  return nearest;
}

export function searchBoard(snapshot: BoardSnapshot, rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toUpperCase();
  if (!query) return [];
  const results: SearchResult[] = [];

  for (const asset of snapshot.assets) {
    const values = [asset.external_identifier, asset.uld_type, asset.destination, asset.truck_type, asset.asset_category]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toUpperCase());
    if (!values.some((value) => value.includes(query))) continue;
    const title = asset.external_identifier ?? asset.uld_type ?? asset.truck_type ?? asset.asset_category;
    const zone = snapshot.zones.find((candidate) => candidate.id === asset.zone_id);
    const detailParts = [asset.asset_category, asset.destination, zone?.code].filter(Boolean);
    results.push({ type: "asset", id: asset.id, title, detail: detailParts.join(" • ") });
  }

  for (const zone of snapshot.zones) {
    if (zone.code.toUpperCase().includes(query) || zone.name.toUpperCase().includes(query)) {
      results.push({ type: "zone", id: zone.id, title: zone.code, detail: zone.name });
    }
  }
  return results;
}
