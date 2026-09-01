import { describe, expect, it } from "vitest";
import { buildWarehouseAssistantContext, buildWarehouseAssistantInput } from "@/lib/warehouse/assistant-context";
import type { AssetRow, SlotRow } from "@/types/database";
import type { BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";

const timestamp = "2026-09-01T16:00:00.000Z";

function asset(overrides: Partial<AssetRow>): AssetRow {
  return {
    id: "asset-1", warehouse_id: "warehouse-1", asset_category: "ULD", uld_type: "AAX",
    external_identifier: null, destination: null, truck_type: null, truck_status: "NONE",
    status_changed_at: null, departure_cleanup_at: null, zone_id: null, slot_id: null,
    x_position: null, y_position: null, orientation_degrees: 0, is_active: true,
    removed_at: null, version: 1, created_by: null, updated_by: null,
    created_at: timestamp, updated_at: timestamp, ...overrides,
  };
}

function zone(code: string, name: string, zoneType: ZoneWithSlots["zone_type"], slots: SlotRow[] = []): ZoneWithSlots {
  return {
    id: `${code}-id`, warehouse_id: "warehouse-1", code, name, zone_type: zoneType,
    capacity: slots.length || 1, x: 10, y: 20, width: 100, height: 200, is_active: true,
    created_at: timestamp, updated_at: timestamp, slots,
  };
}

describe("warehouse assistant context", () => {
  it("provides current placement and destination facts without database identifiers", () => {
    const slot: SlotRow = { id: "secret-slot-id", zone_id: "LANE_2-id", slot_number: 3, x: 200, y: 300, default_orientation_degrees: 0, is_active: true, created_at: timestamp, updated_at: timestamp };
    const snapshot: BoardSnapshot = {
      warehouse: { id: "secret-warehouse-id", name: "WFS Warehouse", code: "WFS-01", created_at: timestamp, updated_at: timestamp },
      zones: [zone("LANE_2", "Lane 2", "LANE", [slot]), zone("MOD_DESK", "MOD Desk", "STATIC")],
      assets: [asset({ id: "secret-asset-id", uld_type: "AKE", destination: "DFW", zone_id: "LANE_2-id", slot_id: slot.id })],
      connections: [], configurations: [], recentEvents: [], currentRole: "OPERATOR", fetchedAt: timestamp,
    };

    const context = buildWarehouseAssistantContext(snapshot);
    expect(context.liveAssets[0]).toMatchObject({ label: "AKE", destination: "DFW", location: { zoneCode: "LANE_2", slotNumber: 3 } });
    expect(context.areaPurposes.MOD_DESK).toContain("Manager on Duty");
    expect(JSON.stringify(context)).not.toContain("secret-asset-id");
    expect(JSON.stringify(context)).not.toContain("secret-slot-id");
    expect(buildWarehouseAssistantInput("Where is AKE?", [], context)).toContain("CURRENT WAREHOUSE SNAPSHOT");
  });
});
