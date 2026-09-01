"use client";

import dynamic from "next/dynamic";
import type { AssetRow, SlotRow, TruckType, UldType } from "@/types/database";
import type { BoardHighlight, BoardSnapshot, PlacementTool, ZoneWithSlots } from "@/types/warehouse";

const WarehouseStage = dynamic(
  () => import("@/components/warehouse/WarehouseStage").then((module) => module.WarehouseStage),
  { ssr: false, loading: () => <div className="canvas-loading" aria-busy="true">Preparing floor plan…</div> },
);

export function WarehouseBoard({ snapshot, selectedAssetId, highlight, canInteract, placementTool, onSelectAsset, onMoveUld, onMoveTruck, onMoveTug, onChooseUldSlot, onChooseDock, onPlaceUld, onPlaceTruck, onPlaceTug, onMessage }: {
  snapshot: BoardSnapshot;
  selectedAssetId: string | null;
  highlight: BoardHighlight;
  canInteract: boolean;
  placementTool: PlacementTool | null;
  onSelectAsset: (assetId: string | null) => void;
  onMoveUld: (asset: AssetRow, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>;
  onMoveTruck: (asset: AssetRow, zone: ZoneWithSlots) => Promise<boolean>;
  onMoveTug: (asset: AssetRow, zone: ZoneWithSlots, position: { x: number; y: number }) => Promise<boolean>;
  onChooseUldSlot: (zone: ZoneWithSlots, slot: SlotRow) => void;
  onChooseDock: (zone: ZoneWithSlots) => void;
  onPlaceUld: (uldType: UldType, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>;
  onPlaceTruck: (truckType: TruckType, zone: ZoneWithSlots) => Promise<boolean>;
  onPlaceTug: (zone: ZoneWithSlots, position: { x: number; y: number }) => Promise<boolean>;
  onMessage: (message: string) => void;
}) {
  return (
    <div className="board-frame">
      <WarehouseStage snapshot={snapshot} selectedAssetId={selectedAssetId} highlight={highlight} canInteract={canInteract} placementTool={placementTool} onSelectAsset={onSelectAsset} onMoveUld={onMoveUld} onMoveTruck={onMoveTruck} onMoveTug={onMoveTug} onChooseUldSlot={onChooseUldSlot} onChooseDock={onChooseDock} onPlaceUld={onPlaceUld} onPlaceTruck={onPlaceTruck} onPlaceTug={onPlaceTug} onMessage={onMessage} />
    </div>
  );
}
