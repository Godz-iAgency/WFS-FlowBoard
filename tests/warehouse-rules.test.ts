import { describe, expect, it } from "vitest";
import {
  canPlaceInZone,
  canTow,
  configurationReferencesAreValid,
  departureSecondsRemaining,
  isSlotAvailable,
  isSoftRemoved,
  isStaleVersion,
  isValidUldOrientation,
} from "@/lib/warehouse/rules";
import type { AssetRow, ConnectionRow } from "@/types/database";

function asset(overrides: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "asset-1", warehouse_id: "warehouse-1", asset_category: "ULD", uld_type: "AAX",
    external_identifier: null, destination: null, truck_type: null, truck_status: "NONE",
    status_changed_at: null, departure_cleanup_at: null, zone_id: null, slot_id: null,
    x_position: null, y_position: null, orientation_degrees: 0, is_active: true,
    removed_at: null, version: 1, created_by: null, updated_by: null,
    created_at: "2026-08-30T00:00:00.000Z", updated_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("warehouse placement rules", () => {
  it("rejects a ULD in a dock", () => expect(canPlaceInZone("ULD", "DOCK")).toBe(false));
  it("rejects a truck in lanes and mixed", () => {
    expect(canPlaceInZone("TRUCK", "LANE")).toBe(false);
    expect(canPlaceInZone("TRUCK", "MIXED")).toBe(false);
  });
  it("accepts only north and south ULD orientations", () => {
    expect(isValidUldOrientation(0)).toBe(true);
    expect(isValidUldOrientation(180)).toBe(true);
    expect(isValidUldOrientation(90)).toBe(false);
    expect(isValidUldOrientation(270)).toBe(false);
  });
  it("treats an occupied active slot as unavailable", () => {
    expect(isSlotAvailable("slot-1", [asset({ slot_id: "slot-1" })])).toBe(false);
    expect(isSlotAvailable("slot-1", [asset({ slot_id: "slot-1", is_active: false })])).toBe(true);
  });
});

describe("connections and lifecycle", () => {
  it("allows TOW only from an active tug to an active ULD", () => {
    expect(canTow(asset({ asset_category: "TUG" }), asset())).toBe(true);
    expect(canTow(asset({ asset_category: "TRUCK" }), asset())).toBe(false);
    expect(canTow(asset({ asset_category: "TUG" }), asset({ asset_category: "TRUCK" }))).toBe(false);
  });
  it("calculates the departure countdown and clamps it at zero", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    expect(departureSecondsRemaining("2026-08-30T12:02:00.000Z", now)).toBe(120);
    expect(departureSecondsRemaining("2026-08-30T11:59:59.000Z", now)).toBe(0);
  });
  it("recognizes a complete soft removal", () => {
    expect(isSoftRemoved(asset({ is_active: false, removed_at: "2026-08-30T12:00:00.000Z" }))).toBe(true);
    expect(isSoftRemoved(asset())).toBe(false);
  });
  it("detects stale versions", () => {
    expect(isStaleVersion(3, 2)).toBe(true);
    expect(isStaleVersion(3, 3)).toBe(false);
  });
});

describe("configuration integrity", () => {
  it("requires every saved connection to reference assets in the same warehouse", () => {
    const assets = [asset({ id: "tug", asset_category: "TUG" }), asset({ id: "uld" })];
    const connection = {
      id: "connection", warehouse_id: "warehouse-1", parent_asset_id: "tug", child_asset_id: "uld",
      connection_type: "TOW", connected_by: null, connected_at: "2026-08-30T00:00:00.000Z",
      disconnected_at: null, is_active: true, version: 1,
    } satisfies ConnectionRow;
    expect(configurationReferencesAreValid(assets, [connection])).toBe(true);
    expect(configurationReferencesAreValid(assets, [{ ...connection, child_asset_id: "missing" }])).toBe(false);
  });
});
