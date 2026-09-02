import { describe, expect, it } from "vitest";
import { answerWarehouseAssistantLocally, buildWarehouseAssistantContext, buildWarehouseAssistantInput, WAREHOUSE_ASSISTANT_INSTRUCTION } from "@/lib/warehouse/assistant-context";
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
      uldLoadItems: [{ id: "secret-load-id", asset_id: "secret-asset-id", destination_code: "DFW", package_count: 42, description: "Amazon mail", source_reference: "SCAN-17", notes: "Priority", created_at: timestamp, updated_at: timestamp }],
      connections: [],
      configurations: [{ id: "secret-configuration-id", warehouse_id: "secret-warehouse-id", name: "Night Sort", description: "Ready state", created_by: "secret-user-id", created_at: timestamp, archived_at: null }],
      recentEvents: [{ id: "secret-event-id", warehouse_id: "secret-warehouse-id", asset_id: "secret-asset-id", event_type: "MOVED", old_state: { zone_id: null }, new_state: { zone_id: "LANE_2-id", slot_id: "secret-slot-id", uld_type: "AKE" }, user_id: "secret-user-id", user_display_name: "Controller", is_undo: false, reverses_event_id: null, reversed_at: null, reversed_by: null, created_at: timestamp }],
      currentRole: "OPERATOR", fetchedAt: timestamp,
    };

    const context = buildWarehouseAssistantContext(snapshot);
    expect(context.liveAssets[0]).toMatchObject({ label: "AKE", destination: "DFW", location: { zoneCode: "LANE_2", slotNumber: 3 } });
    expect(context.liveAssets[0].loadSummary).toMatchObject({ recordedItems: 1, packageCount: 42, items: [{ destinationCode: "DFW", sourceReference: "SCAN-17" }] });
    expect(context.recentActivity[0]).toMatchObject({ performedBy: "Controller", description: "moved AKE: Unassigned to Lane 2 Slot 3" });
    expect(context.savedConfigurations[0]).toMatchObject({ name: "Night Sort" });
    expect(context.areaPurposes.MOD_DESK).toContain("Manager on Duty");
    expect(JSON.stringify(context)).not.toContain("secret-asset-id");
    expect(JSON.stringify(context)).not.toContain("secret-slot-id");
    expect(JSON.stringify(context)).not.toContain("secret-user-id");
    expect(buildWarehouseAssistantInput("Where is AKE?", [], context)).toContain("AUTHORIZED LIVE FLOWBOARD DATA");
    expect(WAREHOUSE_ASSISTANT_INSTRUCTION).toContain("third- to fifth-grade reading level");
    expect(WAREHOUSE_ASSISTANT_INSTRUCTION).toContain("plain text only");
    expect(answerWarehouseAssistantLocally("What exactly can youdo?", context)).toContain("I can tell you about ULD types");
    expect(answerWarehouseAssistantLocally("Which ULDs have DFW?", context)).toBeNull();
  });
});
