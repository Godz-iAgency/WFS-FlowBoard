"use client";

import { ApprovedAssetSprite } from "@/components/warehouse/ElementsPanel";
import type { AssetRow } from "@/types/database";
import type { ZoneWithSlots } from "@/types/warehouse";

export function ConnectTugDialog({ tug, ulds, zones, busy, onClose, onConnect }: {
  tug: AssetRow;
  ulds: AssetRow[];
  zones: ZoneWithSlots[];
  busy: boolean;
  onClose: () => void;
  onConnect: (tug: AssetRow, uld: AssetRow) => void;
}) {
  const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card connect-tug-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-tug-title">
        <div className="modal-header">
          <div>
            <p>TUG CONNECTION</p>
            <h2 id="connect-tug-title">Choose a ULD to connect</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close connection dialog">×</button>
        </div>
        <p className="modal-intro">The tug will snap to the ULD tow ring and move with it until you disconnect them.</p>
        {ulds.length ? (
          <div className="connect-tug-options">
            {ulds.map((uld) => (
              <button key={uld.id} type="button" disabled={busy} onClick={() => onConnect(tug, uld)}>
                <ApprovedAssetSprite tool={{ category: "ULD", uldType: uld.uld_type ?? "AAX" }} />
                <span><strong>{uld.uld_type ?? "ULD"}</strong><small>{zoneNames.get(uld.zone_id ?? "") ?? "Warehouse lane"}{uld.destination ? ` • ${uld.destination}` : ""}</small></span>
                <b>Connect</b>
              </button>
            ))}
          </div>
        ) : <p className="empty-message">No available lane ULD is ready to connect.</p>}
      </section>
    </div>
  );
}
