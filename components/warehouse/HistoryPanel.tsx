"use client";

import type { Json } from "@/types/database";
import type { BoardSnapshot } from "@/types/warehouse";

function record(value: Json | null): Record<string, Json | undefined> {
  return value && !Array.isArray(value) && typeof value === "object" ? value : {};
}

function assetName(oldState: Json | null, newState: Json | null): string {
  const current = record(newState); const prior = record(oldState);
  return String(current.external_identifier ?? prior.external_identifier ?? current.uld_type ?? prior.uld_type ?? current.truck_type ?? prior.truck_type ?? "asset");
}

function location(snapshot: BoardSnapshot, value: Json | null): string {
  const state = record(value);
  const zone = snapshot.zones.find((candidate) => candidate.id === state.zone_id);
  const slot = zone?.slots.find((candidate) => candidate.id === state.slot_id);
  return zone ? `${zone.name}${slot ? ` Slot ${slot.slot_number}` : ""}` : "Unassigned";
}

function eventDescription(snapshot: BoardSnapshot, event: BoardSnapshot["recentEvents"][number]): string {
  const name = assetName(event.old_state, event.new_state);
  const prefix = event.is_undo ? "undid" : event.event_type.toLowerCase().replaceAll("_", " ");
  if (event.event_type === "MOVED") return `${prefix} ${name}: ${location(snapshot, event.old_state)} → ${location(snapshot, event.new_state)}`;
  if (event.event_type === "ROTATED") return `${prefix} ${name}: ${String(record(event.old_state).orientation_degrees ?? 0)}° → ${String(record(event.new_state).orientation_degrees ?? 0)}°`;
  if (event.event_type === "CONFIGURATION_LOADED") return `loaded configuration ${String(record(event.new_state).configuration_name ?? "")}`.trim();
  if (event.event_type === "DESTINATION_CHANGED") return `${prefix} ${name}: ${String(record(event.old_state).destination ?? "None")} → ${String(record(event.new_state).destination ?? "None")}`;
  if (event.event_type === "TRUCK_STATUS_CHANGED") return `${prefix} ${name}: ${String(record(event.old_state).truck_status ?? "None")} → ${String(record(event.new_state).truck_status ?? "None")}`;
  if (event.event_type === "CONNECTED") return `${prefix} ${name} to tug`;
  if (event.event_type === "DISCONNECTED") return `${prefix} ${name} from tug`;
  if (event.event_type === "CREATED") return `${prefix} ${name} at ${location(snapshot, event.new_state)}`;
  if (event.event_type === "REMOVED") return `${prefix} ${name} from ${location(snapshot, event.old_state)}`;
  if (event.event_type === "DEPARTED") return `${prefix} ${name} from ${location(snapshot, event.new_state)}`;
  return `${prefix} ${name}`;
}

export function HistoryPanel({ snapshot, onClose }: { snapshot: BoardSnapshot; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-header"><div><p>AUDIT HISTORY</p><h2 id="history-title">Recent Changes</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close history">×</button></div>
        <div className="history-list">
          {snapshot.recentEvents.length === 0 ? <p className="empty-message">No operational events have been recorded.</p> : null}
          {snapshot.recentEvents.map((event) => (
            <article key={event.id}>
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              <div><strong>{event.user_display_name ?? "System"}</strong><p>{eventDescription(snapshot, event)}</p></div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
