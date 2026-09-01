// @vitest-environment jsdom

import "./setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssetActionSheet } from "@/components/warehouse/AssetActionSheet";
import { AssetPlacementDialog } from "@/components/warehouse/AssetPlacementDialog";
import type { AssetRow } from "@/types/database";

const baseAsset: AssetRow = {
  id: "asset-1",
  warehouse_id: "warehouse-1",
  asset_category: "ULD",
  uld_type: "AAX",
  external_identifier: null,
  destination: null,
  truck_type: null,
  truck_status: "NONE",
  status_changed_at: null,
  departure_cleanup_at: null,
  zone_id: "zone-1",
  slot_id: "slot-1",
  x_position: null,
  y_position: null,
  orientation_degrees: 0,
  is_active: true,
  removed_at: null,
  version: 1,
  created_by: null,
  updated_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

describe("asset placement and manipulation controls", () => {
  it("offers every approved ULD image and returns the selected ULD", () => {
    const onChoose = vi.fn();
    render(<AssetPlacementDialog kind="ULD" targetName="Lane 2 Slot 1" busy={false} onClose={vi.fn()} onChoose={onChoose} />);

    for (const type of ["AAX", "LAY", "DQF", "AKE"]) {
      expect(screen.getByRole("button", { name: type })).toBeEnabled();
      expect(document.querySelector(`[data-asset-image="${type.toLowerCase()}"]`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "AKE" }));
    expect(onChoose).toHaveBeenCalledWith({ category: "ULD", uldType: "AKE" });
  });

  it("limits dock choices to the two approved truck types", () => {
    const onChoose = vi.fn();
    render(<AssetPlacementDialog kind="TRUCK" targetName="DD 06" busy={false} onClose={vi.fn()} onChoose={onChoose} />);

    expect(screen.getByRole("button", { name: "Box Truck" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tractor Trailer" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Tractor Trailer" }));
    expect(onChoose).toHaveBeenCalledWith({ category: "TRUCK", truckType: "TRACTOR_TRAILER" });
  });

  it("exposes ULD destination, rotation, and removal actions", () => {
    const onRotate = vi.fn();
    const onDestination = vi.fn();
    const onRequestRemove = vi.fn();
    render(
      <AssetActionSheet
        asset={baseAsset}
        busy={false}
        onClose={vi.fn()}
        onRotate={onRotate}
        onDestination={onDestination}
        onTruckStatus={vi.fn()}
        onRequestDepart={vi.fn()}
        onRequestRemove={onRequestRemove}
        onRequestConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change Direction" }));
    expect(onRotate).toHaveBeenCalledWith(baseAsset);

    fireEvent.click(screen.getByRole("button", { name: "Destination" }));
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "lay" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onDestination).toHaveBeenCalledWith(baseAsset, "LAY");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRequestRemove).toHaveBeenCalledWith(baseAsset);
  });
});
