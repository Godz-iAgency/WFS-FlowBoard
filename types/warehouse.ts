import type { AppRole, AssetEventRow, AssetRow, ConfigurationRow, ConnectionRow, SlotRow, WarehouseRow, ZoneRow } from "@/types/database";

export const LOGICAL_BOARD_WIDTH = 1600;
export const LOGICAL_BOARD_HEIGHT = 900;

export interface ZoneWithSlots extends ZoneRow {
  slots: SlotRow[];
}

export interface BoardSnapshot {
  warehouse: WarehouseRow;
  zones: ZoneWithSlots[];
  assets: AssetRow[];
  connections: ConnectionRow[];
  configurations: ConfigurationRow[];
  recentEvents: AssetEventRow[];
  currentRole: AppRole;
  fetchedAt: string;
}

export type RealtimeState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "OFFLINE" | "ERROR";

export type BoardHighlight = { type: "asset" | "zone"; id: string } | null;

export interface BoardLoadError {
  title: string;
  message: string;
  retryable: boolean;
}
