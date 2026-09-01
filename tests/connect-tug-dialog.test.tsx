// @vitest-environment jsdom

import "./setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectTugDialog } from "@/components/warehouse/ConnectTugDialog";
import type { AssetRow, ZoneRow } from "@/types/database";
import type { ZoneWithSlots } from "@/types/warehouse";

function asset(overrides: Partial<AssetRow>): AssetRow {
  return {
    id: "asset-1", warehouse_id: "warehouse-1", asset_category: "ULD", uld_type: "AAX",
    external_identifier: null, destination: null, truck_type: null, truck_status: "NONE",
    status_changed_at: null, departure_cleanup_at: null, zone_id: "zone-1", slot_id: "slot-1",
    x_position: null, y_position: null, orientation_degrees: 0, is_active: true, removed_at: null,
    version: 1, created_by: null, updated_by: null, created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z", ...overrides,
  };
}

const lane: ZoneWithSlots = {
  id: "zone-1", warehouse_id: "warehouse-1", code: "LANE_2", name: "Lane 2", zone_type: "LANE",
  capacity: 5, x: 520, y: 145, width: 100, height: 405, is_active: true,
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", slots: [],
} satisfies ZoneRow & { slots: [] };

describe("ConnectTugDialog", () => {
  it("offers an available lane ULD and returns the explicit tug-to-ULD choice", () => {
    const tug = asset({ id: "tug-1", asset_category: "TUG", uld_type: null, zone_id: "move", slot_id: null, x_position: 700, y_position: 600 });
    const uld = asset({ id: "uld-1", uld_type: "LAY", destination: "DAL9" });
    const onConnect = vi.fn();
    render(<ConnectTugDialog tug={tug} ulds={[uld]} zones={[lane]} busy={false} onClose={vi.fn()} onConnect={onConnect} />);

    expect(screen.getByText("Lane 2 • DAL9")).toBeInTheDocument();
    expect(document.querySelector('[data-asset-image="lay"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LAY.*Lane 2.*DAL9.*Connect/i }));
    expect(onConnect).toHaveBeenCalledWith(tug, uld);
  });
});
