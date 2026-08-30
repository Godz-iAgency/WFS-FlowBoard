import type { RealtimeState } from "@/types/warehouse";

const labels: Record<RealtimeState, string> = {
  CONNECTING: "Connecting",
  CONNECTED: "Connected",
  RECONNECTING: "Reconnecting",
  OFFLINE: "Offline",
  ERROR: "Connection error",
};

export function RealtimeStatus({ state, lastSyncedAt }: { state: RealtimeState; lastSyncedAt: string }) {
  return (
    <div className={`realtime-status realtime-status--${state.toLowerCase()}`} role="status" aria-label={`Realtime status: ${labels[state]}`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{state === "CONNECTED" ? "LIVE • Connected" : labels[state]}</span>
      <time dateTime={lastSyncedAt}>{new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
    </div>
  );
}
