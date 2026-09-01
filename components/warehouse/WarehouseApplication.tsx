"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { AssetActionSheet } from "@/components/warehouse/AssetActionSheet";
import { AssetPlacementDialog } from "@/components/warehouse/AssetPlacementDialog";
import { BoardToolbar } from "@/components/warehouse/BoardToolbar";
import { ConnectTugDialog } from "@/components/warehouse/ConnectTugDialog";
import { ConfirmationDialog } from "@/components/warehouse/ConfirmationDialog";
import { LoadConfigurationDialog, SaveBoardDialog } from "@/components/warehouse/ConfigurationDialog";
import { ApprovedAssetSprite, ElementsPanel } from "@/components/warehouse/ElementsPanel";
import { HistoryPanel } from "@/components/warehouse/HistoryPanel";
import { RealtimeStatus } from "@/components/warehouse/RealtimeStatus";
import { SearchPanel } from "@/components/warehouse/SearchPanel";
import { WarehouseBoard } from "@/components/warehouse/WarehouseBoard";
import { WarehouseAssistant } from "@/components/warehouse/WarehouseAssistant";
import { useWarehouseRealtime } from "@/hooks/useWarehouseRealtime";
import { createClient } from "@/lib/supabase/client";
import {
  connectTow, createAsset, disconnectTow, loadBoardConfiguration, moveAsset, saveBoardConfiguration, softRemoveAsset,
  undoLastAction, updateTruckStatus, updateUldDestination,
} from "@/lib/warehouse/mutations";
import { findNearestAvailableDock, findNearestAvailableSlot, isPointInsideZone, type SearchResult } from "@/lib/warehouse/selectors";
import type { AssetRow, ConfigurationRow, ConnectionRow, SlotRow, TruckStatus, TruckType, UldType } from "@/types/database";
import { LOGICAL_BOARD_HEIGHT, LOGICAL_BOARD_WIDTH, type BoardHighlight, type BoardSnapshot, type ClientPoint, type PlacementTool, type ZoneWithSlots } from "@/types/warehouse";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  action: () => Promise<void>;
}

type PlacementTarget =
  | { kind: "ULD"; zone: ZoneWithSlots; slot: SlotRow }
  | { kind: "TRUCK"; zone: ZoneWithSlots };

export function WarehouseApplication({ initialSnapshot, userEmail }: { initialSnapshot: BoardSnapshot; userEmail: string }) {
  const { snapshot, state, error, refresh } = useWarehouseRealtime(initialSnapshot);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<BoardHighlight>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [placementTool, setPlacementTool] = useState<PlacementTool | null>(null);
  const [placementTarget, setPlacementTarget] = useState<PlacementTarget | null>(null);
  const [connectingTugId, setConnectingTugId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ tool: PlacementTool; point: ClientPoint } | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAsset = snapshot.assets.find((asset) => asset.id === selectedAssetId);
  const selectedZone = snapshot.zones.find((zone) => zone.id === selectedAsset?.zone_id);
  const selectedConnection = snapshot.connections.find((connection) => connection.parent_asset_id === selectedAssetId || connection.child_asset_id === selectedAssetId);
  const connectingTug = snapshot.assets.find((asset) => asset.id === connectingTugId && asset.is_active && asset.asset_category === "TUG");
  const activelyConnectedAssetIds = new Set(snapshot.connections.filter((connection) => connection.is_active).flatMap((connection) => [connection.parent_asset_id, connection.child_asset_id]));
  const connectableUlds = snapshot.assets.filter((asset) => {
    if (!asset.is_active || asset.asset_category !== "ULD" || !asset.zone_id || activelyConnectedAssetIds.has(asset.id)) return false;
    return snapshot.zones.find((zone) => zone.id === asset.zone_id)?.zone_type === "LANE";
  });
  const canManageConfigurations = snapshot.currentRole === "MANAGER" || snapshot.currentRole === "ADMIN";
  const canInteract = state === "CONNECTED" && !busy;

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function notify(message: string, isError = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }

  async function reconcileAfterFailure(failure: unknown) {
    await refresh();
    notify(failure instanceof Error ? failure.message : "The operation could not be completed.", true);
  }

  async function runMutation(operation: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    if (state !== "CONNECTED") {
      notify("Live connection is required before changing the warehouse board.", true);
      return false;
    }
    setBusy(true);
    try {
      await operation();
      await refresh();
      notify(successMessage);
      return true;
    } catch (failure) {
      await reconcileAfterFailure(failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(asset: AssetRow, zone: ZoneWithSlots, slot: SlotRow): Promise<boolean> {
    if (snapshot.connections.some((connection) => connection.child_asset_id === asset.id)) {
      notify("Disconnect the tug before moving this ULD independently.", true);
      return false;
    }
    return runMutation(
      () => moveAsset(createClient(), { assetId: asset.id, expectedVersion: asset.version, zoneId: zone.id, slotId: slot.id, orientationDegrees: asset.orientation_degrees }),
      `${asset.external_identifier ?? asset.uld_type ?? "ULD"} moved to ${zone.name} Slot ${slot.slot_number}.`,
    );
  }

  async function handleMoveTruck(asset: AssetRow, zone: ZoneWithSlots): Promise<boolean> {
    return runMutation(
      () => moveAsset(createClient(), {
        assetId: asset.id,
        expectedVersion: asset.version,
        zoneId: zone.id,
        slotId: null,
        orientationDegrees: asset.orientation_degrees,
      }),
      `${asset.external_identifier ?? asset.truck_type?.replace("_", " ") ?? "Truck"} moved to ${zone.name}.`,
    );
  }

  async function handleMoveTug(asset: AssetRow, zone: ZoneWithSlots, position: { x: number; y: number }): Promise<boolean> {
    if (snapshot.connections.some((connection) => connection.is_active && connection.parent_asset_id === asset.id)) {
      notify("Disconnect the ULD before moving this tug independently.", true);
      return false;
    }
    return runMutation(
      () => moveAsset(createClient(), {
        assetId: asset.id,
        expectedVersion: asset.version,
        zoneId: zone.id,
        slotId: null,
        x: Math.round(position.x),
        y: Math.round(position.y),
        orientationDegrees: asset.orientation_degrees,
      }),
      "Tug position updated.",
    );
  }

  async function placeUld(uldType: UldType, zone: ZoneWithSlots, slot: SlotRow): Promise<boolean> {
    const placed = await runMutation(
      () => createAsset(createClient(), {
        warehouseId: snapshot.warehouse.id,
        category: "ULD",
        uldType,
        zoneId: zone.id,
        slotId: slot.id,
        orientationDegrees: slot.default_orientation_degrees,
      }),
      `${uldType} placed in ${zone.name} Slot ${slot.slot_number}.`,
    );
    if (placed) {
      setPlacementTarget(null);
    }
    return placed;
  }

  async function placeTruck(truckType: TruckType, zone: ZoneWithSlots): Promise<boolean> {
    const placed = await runMutation(
      () => createAsset(createClient(), {
        warehouseId: snapshot.warehouse.id,
        category: "TRUCK",
        truckType,
        zoneId: zone.id,
      }),
      `${truckType === "BOX_TRUCK" ? "Box truck" : "Tractor trailer"} placed at ${zone.name}.`,
    );
    if (placed) {
      setPlacementTarget(null);
    }
    return placed;
  }

  async function placeTug(zone: ZoneWithSlots, position: { x: number; y: number }): Promise<boolean> {
    const placed = await runMutation(
      () => createAsset(createClient(), {
        warehouseId: snapshot.warehouse.id,
        category: "TUG",
        zoneId: zone.id,
        x: Math.round(position.x),
        y: Math.round(position.y),
      }),
      "Tug placed on the warehouse floor.",
    );
    return placed;
  }

  function choosePlacementTool(tool: PlacementTool) {
    setSelectedAssetId(null);
    setPlacementTarget(null);
    setPlacementTool(tool);
    const instruction = tool.category === "ULD"
      ? `Tap an empty lane position or drag ${tool.uldType} onto it.`
      : tool.category === "TRUCK"
        ? `Tap an empty DD06–DD15 truck target or drag the ${tool.truckType === "BOX_TRUCK" ? "box truck" : "trailer"} onto it.`
        : tool.category === "AIRCRAFT"
          ? `${tool.aircraftType.slice(1)} aircraft selected. Placement is disabled until its approved operating area is defined.`
          : "Tap or drag the tug into the highlighted warehouse movement area.";
    notify(instruction, tool.category === "AIRCRAFT");
  }

  function updateDragPreview(tool: PlacementTool | null, point?: ClientPoint) {
    setDragPreview(tool && point ? { tool, point } : null);
  }

  function handlePaletteDrop(tool: PlacementTool, point: ClientPoint) {
    const stage = document.querySelector<HTMLElement>("[data-warehouse-stage]");
    if (!stage) {
      notify("The warehouse floor plan is not ready yet.", true);
      return;
    }
    const bounds = stage.getBoundingClientRect();
    if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) {
      notify("Drop the asset onto a highlighted warehouse target.", true);
      return;
    }
    const logical = {
      x: (point.x - bounds.left) * (LOGICAL_BOARD_WIDTH / bounds.width),
      y: (point.y - bounds.top) * (LOGICAL_BOARD_HEIGHT / bounds.height),
    };
    const liveAssets = snapshot.assets.filter((asset) => asset.is_active);
    if (tool.category === "ULD") {
      const zones = snapshot.zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED");
      const target = findNearestAvailableSlot(logical, zones, liveAssets, undefined, 100);
      if (!target) {
        notify("Drop the ULD over an available lane or Mixed Area position.", true);
        return;
      }
      void placeUld(tool.uldType, target.zone, target.slot);
      return;
    }
    if (tool.category === "TRUCK") {
      const dock = findNearestAvailableDock(logical, snapshot.zones, liveAssets, undefined, 190);
      if (!dock) {
        notify("Drop the truck over an available DD06–DD15 truck target.", true);
        return;
      }
      void placeTruck(tool.truckType, dock);
      return;
    }
    if (tool.category === "AIRCRAFT") {
      notify(`${tool.aircraftType.slice(1)} aircraft placement requires an approved operating area.`, true);
      return;
    }
    const movementZone = snapshot.zones.find((zone) => zone.zone_type === "FREE_MOVEMENT");
    if (!movementZone || !isPointInsideZone(logical, movementZone, 36)) {
      notify("Drop the tug inside the warehouse movement area.", true);
      return;
    }
    void placeTug(movementZone, logical);
  }

  function choosePlacementAsset(tool: PlacementTool) {
    const target = placementTarget;
    if (!target) return;
    setPlacementTool(tool);
    if (target.kind === "ULD" && tool.category === "ULD") void placeUld(tool.uldType, target.zone, target.slot);
    if (target.kind === "TRUCK" && tool.category === "TRUCK") void placeTruck(tool.truckType, target.zone);
  }

  function clearPlacementTool() {
    setPlacementTool(null);
    setPlacementTarget(null);
    setDragPreview(null);
  }

  function selectAsset(assetId: string | null) {
    if (assetId) clearPlacementTool();
    setSelectedAssetId(assetId);
  }

  function handleLocate(result: SearchResult) {
    setSearchOpen(false);
    setHighlight({ type: result.type, id: result.id });
    if (result.type === "asset") setSelectedAssetId(result.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 6500);
  }

  function handleRotate(asset: AssetRow) {
    if (!asset.zone_id) return;
    if (snapshot.connections.some((connection) => connection.is_active && connection.child_asset_id === asset.id)) {
      notify("Disconnect the tug before changing this ULD's direction.", true);
      return;
    }
    void runMutation(
      () => moveAsset(createClient(), {
        assetId: asset.id, expectedVersion: asset.version, zoneId: asset.zone_id!, slotId: asset.slot_id,
        x: asset.x_position, y: asset.y_position, orientationDegrees: asset.orientation_degrees === 0 ? 180 : 0,
      }),
      "ULD direction updated.",
    );
  }

  function handleDestination(asset: AssetRow, destination: string) {
    void runMutation(() => updateUldDestination(createClient(), asset, destination), "Destination updated.");
  }

  function handleTruckStatus(asset: AssetRow, status: TruckStatus) {
    void runMutation(() => updateTruckStatus(createClient(), asset, status), `Truck status changed to ${status.toLowerCase()}.`);
  }

  function requestDepart(asset: AssetRow) {
    setConfirm({
      title: "Depart truck?",
      message: "The departure countdown will begin. When it expires, the truck will be soft-removed and the dock will return to available.",
      confirmLabel: "Start Departure",
      destructive: false,
      action: async () => { await runMutation(() => updateTruckStatus(createClient(), asset, "DEPARTING"), "Departure countdown started."); },
    });
  }

  function requestRemove(asset: AssetRow) {
    const name = asset.external_identifier ?? asset.uld_type ?? asset.truck_type?.replace("_", " ") ?? asset.asset_category;
    setConfirm({
      title: `Remove ${asset.asset_category}?`,
      message: `Remove ${name} from the live board? This is a soft removal and remains in audit history.`,
      confirmLabel: "Confirm Remove",
      destructive: true,
      action: async () => {
        const removed = await runMutation(() => softRemoveAsset(createClient(), asset), `${name} removed from the live board.`);
        if (removed) setSelectedAssetId(null);
      },
    });
  }

  function handleDisconnect(connection: ConnectionRow) {
    void runMutation(() => disconnectTow(createClient(), connection), "Tug disconnected from ULD.");
  }

  async function handleConnect(tug: AssetRow, uld: AssetRow) {
    const connected = await runMutation(() => connectTow(createClient(), tug, uld), `Tug connected to ${uld.uld_type ?? "ULD"}.`);
    if (connected) {
      setConnectingTugId(null);
      setSelectedAssetId(tug.id);
    }
  }

  function handleUndo() {
    void runMutation(() => undoLastAction(createClient(), snapshot.warehouse.id), "Most recent reversible action was undone.");
  }

  async function handleSave(name: string, description: string) {
    const saved = await runMutation(() => saveBoardConfiguration(createClient(), snapshot.warehouse.id, name, description), `Board saved as “${name.trim()}”.`);
    if (saved) setSaveOpen(false);
  }

  function requestConfigurationLoad(configuration: ConfigurationRow) {
    setLoadOpen(false);
    setConfirm({
      title: "Replace current board state?",
      message: `Load “${configuration.name}”? The saved arrangement will be validated and restored transactionally. Current live assets will be replaced.`,
      confirmLabel: "Load Configuration",
      destructive: true,
      action: async () => {
        const loaded = await runMutation(() => loadBoardConfiguration(createClient(), configuration.id), `Configuration “${configuration.name}” loaded.`);
        if (loaded) setSelectedAssetId(null);
      },
    });
  }

  async function executeConfirmation() {
    const current = confirm;
    if (!current) return;
    await current.action();
    setConfirm(null);
  }

  return (
    <main className="flowboard-app">
      <header className="app-header">
        <div className="app-brand">
          <Image className="wfs-logo wfs-logo--header" src="/brand/wfs-logo.png" alt="WFS" width={619} height={323} priority />
          <div><p>WFS FLOWBOARD</p><h1>Warehouse – Cargo Handling Floor Plan</h1></div>
        </div>
        <div className="header-actions">
          <RealtimeStatus state={state} lastSyncedAt={snapshot.fetchedAt} />
          <div className="user-menu"><span className="user-email" title={userEmail}>{userEmail}</span><form action={signOut}><button type="submit" className="text-button">Sign out</button></form></div>
        </div>
      </header>

      {state !== "CONNECTED" || error ? (
        <div className={`connection-banner connection-banner--${state.toLowerCase()}`} role="status">
          <span>{error ?? (state === "OFFLINE" ? "Offline: this board may not represent the current warehouse state. Operational changes are disabled." : "Realtime connection interrupted. Reconnecting and reloading authoritative state…")}</span>
          <button type="button" onClick={() => void refresh()}>Retry now</button>
        </div>
      ) : null}

      <BoardToolbar snapshot={snapshot} busy={busy} canManageConfigurations={canManageConfigurations} onUndo={handleUndo} onSearch={() => setSearchOpen(true)} onAssistant={() => setAssistantOpen(true)} onSave={() => setSaveOpen(true)} onLoad={() => setLoadOpen(true)} onHistory={() => setHistoryOpen(true)} />

      <div className="workspace">
        <ElementsPanel zones={snapshot.zones} assets={snapshot.assets} selectedTool={placementTool} onSelectTool={choosePlacementTool} onClearTool={clearPlacementTool} onDragPreview={updateDragPreview} onDropTool={handlePaletteDrop} />
        <section className="board-region" aria-label="Warehouse floor plan">
          <WarehouseBoard
            snapshot={snapshot}
            selectedAssetId={selectedAssetId}
            highlight={highlight}
            canInteract={canInteract}
            placementTool={placementTool}
            onSelectAsset={selectAsset}
            onMoveUld={handleMove}
            onMoveTruck={handleMoveTruck}
            onMoveTug={handleMoveTug}
            onChooseUldSlot={(zone, slot) => setPlacementTarget({ kind: "ULD", zone, slot })}
            onChooseDock={(zone) => setPlacementTarget({ kind: "TRUCK", zone })}
            onPlaceUld={placeUld}
            onPlaceTruck={placeTruck}
            onPlaceTug={placeTug}
            onMessage={(message) => notify(message, true)}
          />
          <div className="board-footer"><span>{snapshot.warehouse.name}</span><span>Static layout locked • Logical plan 1600 × 900</span><span>Last sync {new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div>
        </section>
      </div>

      {selectedAsset ? <AssetActionSheet asset={selectedAsset} zone={selectedZone} connection={selectedConnection} busy={busy} onClose={() => setSelectedAssetId(null)} onRotate={handleRotate} onDestination={handleDestination} onTruckStatus={handleTruckStatus} onRequestDepart={requestDepart} onRequestRemove={requestRemove} onRequestConnect={(asset) => setConnectingTugId(asset.id)} onDisconnect={handleDisconnect} /> : null}
      {connectingTug ? <ConnectTugDialog tug={connectingTug} ulds={connectableUlds} zones={snapshot.zones} busy={busy} onClose={() => setConnectingTugId(null)} onConnect={(tug, uld) => void handleConnect(tug, uld)} /> : null}
      {searchOpen ? <SearchPanel snapshot={snapshot} onClose={() => setSearchOpen(false)} onLocate={handleLocate} /> : null}
      {assistantOpen ? <WarehouseAssistant onClose={() => setAssistantOpen(false)} /> : null}
      {historyOpen ? <HistoryPanel snapshot={snapshot} onClose={() => setHistoryOpen(false)} /> : null}
      {saveOpen ? <SaveBoardDialog busy={busy} onClose={() => setSaveOpen(false)} onSave={(name, description) => void handleSave(name, description)} /> : null}
      {loadOpen ? <LoadConfigurationDialog configurations={snapshot.configurations} onClose={() => setLoadOpen(false)} onChoose={requestConfigurationLoad} /> : null}
      {placementTarget ? <AssetPlacementDialog kind={placementTarget.kind} targetName={placementTarget.kind === "ULD" ? `${placementTarget.zone.name} Slot ${placementTarget.slot.slot_number}` : placementTarget.zone.name} busy={busy} onClose={() => setPlacementTarget(null)} onChoose={choosePlacementAsset} /> : null}
      {confirm ? <ConfirmationDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} destructive={confirm.destructive} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void executeConfirmation()} /> : null}
      {dragPreview ? <div className="asset-drag-ghost" style={{ left: dragPreview.point.x, top: dragPreview.point.y }} aria-hidden="true"><ApprovedAssetSprite tool={dragPreview.tool} /></div> : null}
      {toast ? <div className={`operation-toast ${toast.error ? "operation-toast--error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.message}</div> : null}
    </main>
  );
}
