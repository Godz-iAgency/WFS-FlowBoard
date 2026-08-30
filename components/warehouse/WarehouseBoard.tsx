"use client";

import dynamic from "next/dynamic";
import type { AssetRow, SlotRow } from "@/types/database";
import type { BoardHighlight, BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";

const WarehouseStage = dynamic(
  () => import("@/components/warehouse/WarehouseStage").then((module) => module.WarehouseStage),
  { ssr: false, loading: () => <div className="canvas-loading" aria-busy="true">Preparing floor plan…</div> },
);

export function WarehouseBoard({ snapshot, selectedAssetId, highlight, canInteract, onSelectAsset, onMoveUld, onMessage }: {
  snapshot: BoardSnapshot;
  selectedAssetId: string | null;
  highlight: BoardHighlight;
  canInteract: boolean;
  onSelectAsset: (assetId: string | null) => void;
  onMoveUld: (asset: AssetRow, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>;
  onMessage: (message: string) => void;
}) {
  return (
    <div className="board-frame">
      <WarehouseStage snapshot={snapshot} selectedAssetId={selectedAssetId} highlight={highlight} canInteract={canInteract} onSelectAsset={onSelectAsset} onMoveUld={onMoveUld} onMessage={onMessage} />
    </div>
  );
}
