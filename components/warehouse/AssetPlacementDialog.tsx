"use client";

import { ApprovedAssetSprite } from "@/components/warehouse/ElementsPanel";
import type { TruckType, UldType } from "@/types/database";
import type { PlacementTool } from "@/types/warehouse";

const ULD_TYPES: UldType[] = ["AAX", "LAY", "DQF", "AKE"];
const TRUCK_TYPES: TruckType[] = ["BOX_TRUCK", "TRACTOR_TRAILER"];

function placementLabel(tool: PlacementTool): { key: string; label: string } {
  if (tool.category === "ULD") return { key: tool.uldType, label: tool.uldType };
  if (tool.category === "TRUCK") return { key: tool.truckType, label: tool.truckType === "BOX_TRUCK" ? "Box Truck" : "Tractor Trailer" };
  if (tool.category === "AIRCRAFT") return { key: tool.aircraftType, label: `${tool.aircraftType.slice(1)} Aircraft` };
  return { key: "TUG", label: "Tug" };
}

export function AssetPlacementDialog({ kind, targetName, busy, onClose, onChoose }: {
  kind: "ULD" | "TRUCK";
  targetName: string;
  busy: boolean;
  onClose: () => void;
  onChoose: (tool: PlacementTool) => void;
}) {
  const tools: PlacementTool[] = kind === "ULD"
    ? ULD_TYPES.map((uldType) => ({ category: "ULD", uldType }))
    : TRUCK_TYPES.map((truckType) => ({ category: "TRUCK", truckType }));

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card placement-dialog" role="dialog" aria-modal="true" aria-labelledby="placement-title">
        <div className="modal-header">
          <div>
            <p>PLACE OPERATIONAL ASSET</p>
            <h2 id="placement-title">Choose {kind === "ULD" ? "a ULD" : "a truck"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="modal-intro">Place at <strong>{targetName}</strong>. The new asset will be saved to Supabase immediately.</p>
        <div className={`placement-options placement-options--${kind.toLowerCase()}`}>
          {tools.map((tool) => {
            const { key, label } = placementLabel(tool);
            return (
              <button key={key} type="button" disabled={busy} onClick={() => onChoose(tool)}>
                <ApprovedAssetSprite tool={tool} />
                <strong>{label}</strong>
              </button>
            );
          })}
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button></div>
      </section>
    </div>
  );
}
