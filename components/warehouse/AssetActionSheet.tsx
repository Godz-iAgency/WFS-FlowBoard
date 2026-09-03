"use client";

import { FormEvent, useEffect, useState } from "react";
import { departureSecondsRemaining } from "@/lib/warehouse/rules";
import type { AssetRow, ConnectionRow, TruckStatus } from "@/types/database";
import type { ZoneWithSlots } from "@/types/warehouse";

function assetTitle(asset: AssetRow): string {
  return asset.external_identifier ?? asset.uld_type ?? asset.truck_type?.replace("_", " ") ?? asset.asset_category;
}

export function AssetActionSheet({
  asset,
  zone,
  connection,
  busy,
  onClose,
  onRotate,
  onDestination,
  onTruckStatus,
  onRequestDepart,
  onRequestReplace,
  onRequestRemove,
  onRequestConnect,
  onDisconnect,
}: {
  asset: AssetRow;
  zone?: ZoneWithSlots;
  connection?: ConnectionRow;
  busy: boolean;
  onClose: () => void;
  onRotate: (asset: AssetRow) => void;
  onDestination: (asset: AssetRow, destination: string) => void;
  onTruckStatus: (asset: AssetRow, status: TruckStatus) => void;
  onRequestDepart: (asset: AssetRow) => void;
  onRequestReplace: (asset: AssetRow) => void;
  onRequestRemove: (asset: AssetRow) => void;
  onRequestConnect: (asset: AssetRow) => void;
  onDisconnect: (connection: ConnectionRow) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [editingDestination, setEditingDestination] = useState(false);
  const [destination, setDestination] = useState(asset.destination ?? "");
  const [now, setNow] = useState(() => Date.now());
  const departureRemaining = asset.truck_status === "DEPARTING" ? departureSecondsRemaining(asset.departure_cleanup_at, now) : null;
  useEffect(() => {
    if (asset.truck_status !== "DEPARTING") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [asset.truck_status]);
  function submitDestination(event: FormEvent) { event.preventDefault(); onDestination(asset, destination); setEditingDestination(false); }

  return (
    <aside className="asset-action-sheet" role="dialog" aria-label={`Actions for ${assetTitle(asset)}`}>
      <div className="asset-sheet-heading">
        <div><span>{asset.asset_category}</span><h2>{assetTitle(asset)}</h2><p>{zone?.name ?? "Free movement area"}{asset.destination ? ` • ${asset.destination}` : ""}</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cancel selection">×</button>
      </div>

      {departureRemaining !== null ? <p className="departure-countdown" role="timer">Departing in {Math.floor(departureRemaining / 60)}:{String(departureRemaining % 60).padStart(2, "0")}</p> : null}

      {showDetails ? (
        <dl className="asset-details">
          <div><dt>Identifier</dt><dd>{asset.external_identifier ?? "Not assigned"}</dd></div>
          <div><dt>Version</dt><dd>{asset.version}</dd></div>
          <div><dt>Updated</dt><dd>{new Date(asset.updated_at).toLocaleTimeString()}</dd></div>
          {asset.asset_category === "ULD" ? <div><dt>Direction</dt><dd>{asset.orientation_degrees === 0 ? "North" : "South"}</dd></div> : null}
          {asset.asset_category === "TRUCK" ? <div><dt>Status</dt><dd>{asset.truck_status}</dd></div> : null}
          {connection ? <div><dt>Connection</dt><dd>Active TOW</dd></div> : null}
        </dl>
      ) : null}

      {editingDestination ? (
        <form className="destination-form" onSubmit={submitDestination}>
          <label htmlFor="destination-value">Destination</label>
          <input id="destination-value" autoFocus maxLength={24} value={destination} onChange={(event) => setDestination(event.target.value.toUpperCase())} placeholder="Destination code" />
          <div><button className="secondary-button" type="button" onClick={() => setEditingDestination(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>Save</button></div>
        </form>
      ) : (
        <div className="asset-actions">
          <button type="button" onClick={() => setShowDetails((shown) => !shown)}>{showDetails ? "Hide Details" : "Details"}</button>
          {asset.asset_category === "ULD" ? <button type="button" onClick={() => setEditingDestination(true)}>Destination</button> : null}
          {asset.asset_category === "ULD" ? <button type="button" onClick={() => onRotate(asset)} disabled={busy}>Change Direction</button> : null}
          {asset.asset_category === "TRUCK" ? <button type="button" className="action-loading" onClick={() => onTruckStatus(asset, "LOADING")} disabled={busy}>Loading</button> : null}
          {asset.asset_category === "TRUCK" ? <button type="button" className="action-loading" onClick={() => onTruckStatus(asset, "UNLOADING")} disabled={busy}>Unloading</button> : null}
          {asset.asset_category === "TRUCK" ? <button type="button" className="action-complete" onClick={() => onTruckStatus(asset, "COMPLETE")} disabled={busy}>Complete</button> : null}
          {asset.asset_category === "TRUCK" ? <button type="button" className="action-depart" onClick={() => onRequestDepart(asset)} disabled={busy}>Depart</button> : null}
          {asset.asset_category === "TUG" && !connection ? <button type="button" onClick={() => onRequestConnect(asset)} disabled={busy}>Connect ULD</button> : null}
          {asset.asset_category === "TUG" && connection ? <button type="button" onClick={() => onDisconnect(connection)} disabled={busy}>Disconnect</button> : null}
          {(asset.asset_category === "ULD" || asset.asset_category === "TRUCK") && !connection ? <button type="button" className="action-replace" onClick={() => onRequestReplace(asset)} disabled={busy}>Replace</button> : null}
          {!connection ? <button type="button" className="action-remove" onClick={() => onRequestRemove(asset)} disabled={busy}>Remove</button> : null}
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      )}
    </aside>
  );
}
