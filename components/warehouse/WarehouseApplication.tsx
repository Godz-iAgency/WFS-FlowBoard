"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { AssetActionSheet } from "@/components/warehouse/AssetActionSheet";
import { BoardToolbar } from "@/components/warehouse/BoardToolbar";
import { ConfirmationDialog } from "@/components/warehouse/ConfirmationDialog";
import { LoadConfigurationDialog, SaveBoardDialog } from "@/components/warehouse/ConfigurationDialog";
import { ElementsPanel } from "@/components/warehouse/ElementsPanel";
import { HistoryPanel } from "@/components/warehouse/HistoryPanel";
import { RealtimeStatus } from "@/components/warehouse/RealtimeStatus";
import { SearchPanel } from "@/components/warehouse/SearchPanel";
import { WarehouseBoard } from "@/components/warehouse/WarehouseBoard";
import { useWarehouseRealtime } from "@/hooks/useWarehouseRealtime";
import { createClient } from "@/lib/supabase/client";
import {
  disconnectTow, loadBoardConfiguration, moveAsset, saveBoardConfiguration, softRemoveAsset,
  undoLastAction, updateTruckStatus, updateUldDestination,
} from "@/lib/warehouse/mutations";
import type { SearchResult } from "@/lib/warehouse/selectors";
import type { AssetRow, ConfigurationRow, ConnectionRow, SlotRow, TruckStatus } from "@/types/database";
import type { BoardHighlight, BoardSnapshot, ZoneWithSlots } from "@/types/warehouse";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  action: () => Promise<void>;
}

export function WarehouseApplication({ initialSnapshot, userEmail }: { initialSnapshot: BoardSnapshot; userEmail: string }) {
  const { snapshot, state, error, refresh } = useWarehouseRealtime(initialSnapshot);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<BoardHighlight>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAsset = snapshot.assets.find((asset) => asset.id === selectedAssetId);
  const selectedZone = snapshot.zones.find((zone) => zone.id === selectedAsset?.zone_id);
  const selectedConnection = snapshot.connections.find((connection) => connection.parent_asset_id === selectedAssetId || connection.child_asset_id === selectedAssetId);
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

  function handleLocate(result: SearchResult) {
    setSearchOpen(false);
    setHighlight({ type: result.type, id: result.id });
    if (result.type === "asset") setSelectedAssetId(result.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 6500);
  }

  function handleRotate(asset: AssetRow) {
    if (!asset.zone_id) return;
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
          <div className="brand-symbol brand-symbol--small" aria-hidden="true"><span /><span /><span /></div>
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

      <BoardToolbar snapshot={snapshot} busy={busy} canManageConfigurations={canManageConfigurations} onUndo={handleUndo} onSearch={() => setSearchOpen(true)} onSave={() => setSaveOpen(true)} onLoad={() => setLoadOpen(true)} onHistory={() => setHistoryOpen(true)} />

      <div className="workspace">
        <ElementsPanel zones={snapshot.zones} assets={snapshot.assets} />
        <section className="board-region" aria-label="Warehouse floor plan">
          <WarehouseBoard snapshot={snapshot} selectedAssetId={selectedAssetId} highlight={highlight} canInteract={canInteract} onSelectAsset={setSelectedAssetId} onMoveUld={handleMove} onMessage={(message) => notify(message, true)} />
          <div className="board-footer"><span>{snapshot.warehouse.name}</span><span>Static layout locked • Logical plan 1600 × 900</span><span>Last sync {new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div>
        </section>
      </div>

      {selectedAsset ? <AssetActionSheet asset={selectedAsset} zone={selectedZone} connection={selectedConnection} busy={busy} onClose={() => setSelectedAssetId(null)} onRotate={handleRotate} onDestination={handleDestination} onTruckStatus={handleTruckStatus} onRequestDepart={requestDepart} onRequestRemove={requestRemove} onDisconnect={handleDisconnect} /> : null}
      {searchOpen ? <SearchPanel snapshot={snapshot} onClose={() => setSearchOpen(false)} onLocate={handleLocate} /> : null}
      {historyOpen ? <HistoryPanel snapshot={snapshot} onClose={() => setHistoryOpen(false)} /> : null}
      {saveOpen ? <SaveBoardDialog busy={busy} onClose={() => setSaveOpen(false)} onSave={(name, description) => void handleSave(name, description)} /> : null}
      {loadOpen ? <LoadConfigurationDialog configurations={snapshot.configurations} onClose={() => setLoadOpen(false)} onChoose={requestConfigurationLoad} /> : null}
      {confirm ? <ConfirmationDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} destructive={confirm.destructive} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void executeConfirmation()} /> : null}
      {toast ? <div className={`operation-toast ${toast.error ? "operation-toast--error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.message}</div> : null}
    </main>
  );
}
