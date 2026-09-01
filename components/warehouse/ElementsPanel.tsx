"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { getZoneOccupancy } from "@/lib/warehouse/selectors";
import type { AssetRow, UldType } from "@/types/database";
import type { AircraftType, ClientPoint, PlacementTool, ZoneWithSlots } from "@/types/warehouse";

const uldTypes: UldType[] = ["AAX", "LAY", "DQF", "AKE"];
const aircraftTypes: AircraftType[] = ["B767", "B737"];
type EquipmentTool = Exclude<PlacementTool, { category: "ULD" }>;

const equipmentTools: EquipmentTool[] = [
  { category: "TUG" },
  { category: "TRUCK", truckType: "TRACTOR_TRAILER" },
  { category: "TRUCK", truckType: "BOX_TRUCK" },
  ...aircraftTypes.map((aircraftType): EquipmentTool => ({ category: "AIRCRAFT", aircraftType })),
];

function toolKey(tool: PlacementTool): string {
  if (tool.category === "ULD") return `ULD:${tool.uldType}`;
  if (tool.category === "TRUCK") return `TRUCK:${tool.truckType}`;
  if (tool.category === "AIRCRAFT") return `AIRCRAFT:${tool.aircraftType}`;
  return "TUG";
}

export function ApprovedAssetSprite({ tool }: { tool: PlacementTool }) {
  const subtype = tool.category === "ULD" ? tool.uldType.toLowerCase()
    : tool.category === "TRUCK" ? tool.truckType.toLowerCase().replace("_", "-")
      : tool.category === "AIRCRAFT" ? tool.aircraftType.toLowerCase()
        : "tug";
  return <span className={`approved-asset-sprite approved-asset-sprite--${subtype}`} data-asset-image={subtype} aria-hidden="true" />;
}

function equipmentLabel(tool: EquipmentTool): string {
  if (tool.category === "TUG") return "TUG";
  if (tool.category === "TRUCK") return tool.truckType === "BOX_TRUCK" ? "BOX TRUCK" : "TRAILER";
  return `${tool.aircraftType.slice(1)} AIRCRAFT`;
}

function toolLabel(tool: PlacementTool): string {
  return tool.category === "ULD" ? tool.uldType : equipmentLabel(tool);
}

function PaletteButton({ tool, className, pressed, children, onSelect, onDragPreview, onDropTool }: {
  tool: PlacementTool;
  className: string;
  pressed: boolean;
  children: ReactNode;
  onSelect: (tool: PlacementTool) => void;
  onDragPreview: (tool: PlacementTool | null, point?: ClientPoint) => void;
  onDropTool: (tool: PlacementTool, point: ClientPoint) => void;
}) {
  const activePointer = useRef<{ pointerId: number; start: ClientPoint; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={pressed}
      onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        activePointer.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLButtonElement>) => {
        const active = activePointer.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const point = { x: event.clientX, y: event.clientY };
        if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) >= 8) active.moved = true;
        if (active.moved) onDragPreview(tool, point);
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLButtonElement>) => {
        const active = activePointer.current;
        if (!active || active.pointerId !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        activePointer.current = null;
        if (active.moved) {
          suppressClick.current = true;
          onDragPreview(null);
          onDropTool(tool, { x: event.clientX, y: event.clientY });
        }
      }}
      onPointerCancel={(event: ReactPointerEvent<HTMLButtonElement>) => {
        if (activePointer.current?.pointerId !== event.pointerId) return;
        activePointer.current = null;
        onDragPreview(null);
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onSelect(tool);
      }}
    >
      {children}
    </button>
  );
}

export function ElementsPanel({ zones, assets, selectedTool, onSelectTool, onClearTool, onDragPreview, onDropTool }: {
  zones: ZoneWithSlots[];
  assets: AssetRow[];
  selectedTool: PlacementTool | null;
  onSelectTool: (tool: PlacementTool) => void;
  onClearTool: () => void;
  onDragPreview: (tool: PlacementTool | null, point?: ClientPoint) => void;
  onDropTool: (tool: PlacementTool, point: ClientPoint) => void;
}) {
  const capacities = zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED");
  const [activeUld, setActiveUld] = useState<UldType>("AAX");
  const [activeEquipment, setActiveEquipment] = useState<EquipmentTool>({ category: "TUG" });
  const displayedUld = selectedTool?.category === "ULD" ? selectedTool.uldType : activeUld;
  const displayedEquipment = selectedTool && selectedTool.category !== "ULD" ? selectedTool : activeEquipment;
  const activeUldTool: PlacementTool = { category: "ULD", uldType: displayedUld };

  return (
    <aside className="elements-panel" aria-label="Warehouse elements">
      <section className="panel-card elements-card">
        <div className="panel-heading">
          <p>ELEMENTS</p>
          <span>Tap to select or drag onto the floor plan</span>
        </div>
        {selectedTool ? (
          <div className="placement-mode" role="status">
            <span><small>PLACEMENT MODE</small><strong>{toolLabel(selectedTool)}</strong></span>
            <button type="button" onClick={onClearTool}>Done</button>
          </div>
        ) : null}
        <div className="asset-palette" aria-labelledby="uld-palette-heading">
          <span id="uld-palette-heading" className="asset-palette__label">ULD</span>
          <div className="asset-name-tabs" role="list" aria-label="ULD types">
            {uldTypes.map((type) => {
              const tool: PlacementTool = { category: "ULD", uldType: type };
              const selected = displayedUld === type;
              return (
                <button key={type} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => { setActiveUld(type); onSelectTool(tool); }}>
                  {type}
                </button>
              );
            })}
          </div>
          <PaletteButton tool={activeUldTool} className={`asset-preview ${selectedTool && toolKey(selectedTool) === toolKey(activeUldTool) ? "selected" : ""}`} pressed={selectedTool ? toolKey(selectedTool) === toolKey(activeUldTool) : false} onSelect={onSelectTool} onDragPreview={onDragPreview} onDropTool={onDropTool}>
            <ApprovedAssetSprite tool={activeUldTool} />
            <strong>{displayedUld}</strong>
          </PaletteButton>
          <span className="asset-preview-help">Drag this image to an empty ULD position</span>
        </div>

        <div className="asset-palette asset-palette--equipment" aria-labelledby="equipment-palette-heading">
          <span id="equipment-palette-heading" className="asset-palette__label">EQUIPMENT</span>
          <div className="asset-name-tabs asset-name-tabs--equipment" role="list" aria-label="Equipment">
            {equipmentTools.map((tool) => {
              const key = toolKey(tool);
              const selected = toolKey(displayedEquipment) === key;
              return (
                <button key={key} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => { setActiveEquipment(tool); onSelectTool(tool); }}>
                  {equipmentLabel(tool)}
                </button>
              );
            })}
          </div>
          <PaletteButton tool={displayedEquipment} className={`asset-preview asset-preview--equipment ${selectedTool && toolKey(selectedTool) === toolKey(displayedEquipment) ? "selected" : ""}`} pressed={selectedTool ? toolKey(selectedTool) === toolKey(displayedEquipment) : false} onSelect={onSelectTool} onDragPreview={onDragPreview} onDropTool={onDropTool}>
            <ApprovedAssetSprite tool={displayedEquipment} />
            <strong>{equipmentLabel(displayedEquipment)}</strong>
          </PaletteButton>
          <span className="asset-preview-help">Drag this image to its highlighted target</span>
        </div>

        <p className="foundation-note">Static layout locked • live state from Supabase</p>
      </section>

      <section className="panel-card capacity-card" aria-labelledby="capacity-heading">
        <div className="panel-heading panel-heading--compact"><p id="capacity-heading">LANE CAPACITY / CURRENT</p></div>
        <dl>
          {capacities.map((zone) => (
            <div key={zone.id}>
              <dt>{zone.code === "MIXED" ? "Mixed" : zone.name}</dt>
              <dd>{getZoneOccupancy(zone, assets).occupied} / {getZoneOccupancy(zone, assets).capacity}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
