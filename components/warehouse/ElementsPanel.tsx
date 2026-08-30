"use client";

import { useState } from "react";
import { getZoneOccupancy } from "@/lib/warehouse/selectors";
import type { AssetRow, UldType } from "@/types/database";
import type { ZoneWithSlots } from "@/types/warehouse";

const uldTypes: UldType[] = ["AAX", "LAY", "DQF", "AKE"];

function UldGlyph({ label }: { label: UldType }) {
  return (
    <span className="uld-glyph" aria-hidden="true">
      <span className="uld-pin" />
      <span className="uld-cage"><span>{label}</span></span>
      <span className="uld-wheels"><i /><i /></span>
    </span>
  );
}

export function ElementsPanel({ zones, assets }: { zones: ZoneWithSlots[]; assets: AssetRow[] }) {
  const [selected, setSelected] = useState<UldType>("AAX");
  const capacities = zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED");

  return (
    <aside className="elements-panel" aria-label="Warehouse elements">
      <section className="panel-card elements-card">
        <div className="panel-heading">
          <p>ELEMENTS</p>
          <span>Operational assets</span>
        </div>
        <label htmlFor="uld-type">ULD</label>
        <select id="uld-type" value={selected} onChange={(event) => setSelected(event.target.value as UldType)}>
          {uldTypes.map((type) => <option key={type} value={type}>{type} ULD + Dolly</option>)}
        </select>
        <div className="element-grid" role="list" aria-label="ULD types">
          {uldTypes.map((type) => (
            <button key={type} type="button" className={selected === type ? "selected" : ""} onClick={() => setSelected(type)} aria-pressed={selected === type}>
              <UldGlyph label={type} />
              <strong>{type}</strong>
            </button>
          ))}
        </div>
        <div className="tug-element">
          <div><span className="tug-icon" aria-hidden="true">▰</span><span className="tug-wheel left" /><span className="tug-wheel right" /></div>
          <span>TUG</span>
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
