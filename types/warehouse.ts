import type { AppRole, AssetEventRow, AssetRow, ConfigurationRow, ConnectionRow, SlotRow, TruckType, UldType, WarehouseRow, ZoneRow } from "@/types/database";

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

export type AircraftType = "B767" | "B737";

export type PlacementTool =
  | { category: "ULD"; uldType: UldType }
  | { category: "TUG" }
  | { category: "TRUCK"; truckType: TruckType }
  | { category: "AIRCRAFT"; aircraftType: AircraftType };

export type ClientPoint = { x: number; y: number };

export interface BoardLoadError {
  title: string;
  message: string;
  retryable: boolean;
}
