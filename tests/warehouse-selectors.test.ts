import { describe, expect, it } from "vitest";
import { dockIndicatorColor, findNearestAvailableDock, findNearestAvailableSlot, getOperationalSummary, getZoneOccupancy, isPointInsideZone, searchBoard } from "@/lib/warehouse/selectors";
import type { AssetRow, SlotRow, ZoneRow } from "@/types/database";
import type { BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";

const timestamp = "2026-08-30T12:00:00.000Z";

function slot(id: string, zoneId: string, slotNumber: number, x: number, y: number): SlotRow {
  return { id, zone_id: zoneId, slot_number: slotNumber, x, y, default_orientation_degrees: 0, is_active: true, created_at: timestamp, updated_at: timestamp };
}

function zone(overrides: Partial<ZoneRow> & Pick<ZoneRow, "id" | "code" | "name" | "zone_type">, slots: SlotRow[] = []): ZoneWithSlots {
  return { warehouse_id: "warehouse", capacity: slots.length, x: 0, y: 0, width: 100, height: 100, is_active: true, created_at: timestamp, updated_at: timestamp, ...overrides, slots };
}

function asset(overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "asset", warehouse_id: "warehouse", asset_category: "ULD", uld_type: "AKE", external_identifier: "AKE12345", destination: "DHX4",
    truck_type: null, truck_status: "NONE", status_changed_at: null, departure_cleanup_at: null, zone_id: "lane", slot_id: "lane-1",
    x_position: null, y_position: null, orientation_degrees: 0, is_active: true, removed_at: null, version: 1, created_by: null, updated_by: null,
    created_at: timestamp, updated_at: timestamp, ...overrides,
  };
}

function snapshot(assets: AssetRow[]): BoardSnapshot {
  const laneSlots = [slot("lane-1", "lane", 1, 100, 100), slot("lane-2", "lane", 2, 100, 180)];
  return {
    warehouse: { id: "warehouse", code: "WFS_CARGO", name: "Warehouse", created_at: timestamp, updated_at: timestamp },
    zones: [
      zone({ id: "lane", code: "LANE_2", name: "Lane 2", zone_type: "LANE", capacity: 2 }, laneSlots),
      zone({ id: "mixed", code: "MIXED", name: "Mixed Area", zone_type: "MIXED", capacity: 1 }, [slot("mixed-1", "mixed", 1, 300, 300)]),
      zone({ id: "dock", code: "DD10", name: "DD 10", zone_type: "DOCK", capacity: 1 }),
    ],
    assets,
    uldLoadItems: [],
    connections: [], configurations: [], recentEvents: [], currentRole: "OPERATOR", fetchedAt: timestamp,
  };
}

describe("live board selectors", () => {
  it("derives occupancy and the operational summary from active assets", () => {
    const state = snapshot([
      asset(),
      asset({ id: "removed", slot_id: "lane-2", is_active: false, removed_at: timestamp }),
      asset({ id: "truck", asset_category: "TRUCK", uld_type: null, external_identifier: "TRK-10", destination: null, truck_type: "BOX_TRUCK", truck_status: "LOADING", zone_id: "dock", slot_id: null }),
    ]);
    expect(getZoneOccupancy(state.zones[0], state.assets)).toEqual({ occupied: 1, capacity: 2 });
    expect(getOperationalSummary(state)).toMatchObject({ uldOccupied: 1, uldCapacity: 3, docksOccupied: 1, docksCapacity: 1, trucks: { LOADING: 1 } });
  });

  it("offers only the nearest free slot and permits the dragged asset's current slot", () => {
    const state = snapshot([asset()]);
    expect(findNearestAvailableSlot({ x: 103, y: 102 }, state.zones, state.assets)?.slot.id).toBe("lane-2");
    expect(findNearestAvailableSlot({ x: 103, y: 102 }, state.zones, state.assets, "asset")?.slot.id).toBe("lane-1");
    expect(findNearestAvailableSlot({ x: 900, y: 900 }, state.zones, state.assets)).toBeNull();
  });

  it("offers only an available dock and constrains free movement points", () => {
    const state = snapshot([]);
    expect(findNearestAvailableDock({ x: 190, y: 50 }, state.zones, state.assets)?.id).toBe("dock");
    const occupied = asset({ id: "truck", asset_category: "TRUCK", uld_type: null, truck_type: "TRACTOR_TRAILER", zone_id: "dock", slot_id: null });
    expect(findNearestAvailableDock({ x: 190, y: 50 }, state.zones, [occupied])).toBeNull();
    expect(findNearestAvailableDock({ x: 190, y: 50 }, state.zones, [occupied], "truck")?.id).toBe("dock");
    expect(isPointInsideZone({ x: 50, y: 50 }, state.zones[0])).toBe(true);
    expect(isPointInsideZone({ x: 5, y: 5 }, state.zones[0], 10)).toBe(false);
  });

  it("searches live identifiers, destinations, ULD types, and dock codes", () => {
    const state = snapshot([asset()]);
    expect(searchBoard(state, "AKE12345")[0]).toMatchObject({ type: "asset", id: "asset" });
    expect(searchBoard(state, "dhx4")[0]).toMatchObject({ type: "asset", id: "asset" });
    expect(searchBoard(state, "DD10")[0]).toMatchObject({ type: "zone", id: "dock" });
  });

  it("maps dock status to the approved neutral and operational colors", () => {
    expect(dockIndicatorColor(undefined)).toBe("#8b98a5");
    expect(dockIndicatorColor(asset({ asset_category: "TRUCK", uld_type: null, truck_type: "BOX_TRUCK", truck_status: "LOADING" }))).toBe("#2fa765");
    expect(dockIndicatorColor(asset({ asset_category: "TRUCK", uld_type: null, truck_type: "BOX_TRUCK", truck_status: "UNLOADING" }))).toBe("#2fa765");
    expect(dockIndicatorColor(asset({ asset_category: "TRUCK", uld_type: null, truck_type: "BOX_TRUCK", truck_status: "COMPLETE" }))).toBe("#ef8d22");
    expect(dockIndicatorColor(asset({ asset_category: "TRUCK", uld_type: null, truck_type: "BOX_TRUCK", truck_status: "DEPARTING" }))).toBe("#2d78d5");
  });
});
