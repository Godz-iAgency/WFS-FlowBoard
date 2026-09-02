export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ZoneType = "LANE" | "MIXED" | "DOCK" | "FREE_MOVEMENT" | "STATIC";
export type AssetCategory = "ULD" | "TUG" | "TRUCK" | "AIRCRAFT" | "CART";
export type UldType = "AAX" | "LAY" | "DQF" | "AKE";
export type TruckType = "BOX_TRUCK" | "TRACTOR_TRAILER";
export type TruckStatus = "NONE" | "LOADING" | "UNLOADING" | "COMPLETE" | "DEPARTING";
export type ConnectionType = "TOW";
export type AppRole = "OPERATOR" | "MANAGER" | "ADMIN";
export type EventType =
  | "CREATED"
  | "MOVED"
  | "ROTATED"
  | "ASSET_TYPE_CHANGED"
  | "DESTINATION_CHANGED"
  | "CONNECTED"
  | "DISCONNECTED"
  | "TRUCK_STATUS_CHANGED"
  | "DEPARTED"
  | "REMOVED"
  | "CONFIGURATION_LOADED";

export type WarehouseRow = { id: string; name: string; code: string; created_at: string; updated_at: string };
export type ZoneRow = { id: string; warehouse_id: string; code: string; name: string; zone_type: ZoneType; capacity: number | null; x: number; y: number; width: number; height: number; is_active: boolean; created_at: string; updated_at: string };
export type SlotRow = { id: string; zone_id: string; slot_number: number; x: number; y: number; default_orientation_degrees: number; is_active: boolean; created_at: string; updated_at: string };
export type AssetRow = {
  id: string; warehouse_id: string; asset_category: AssetCategory; uld_type: UldType | null;
  external_identifier: string | null; destination: string | null; truck_type: TruckType | null;
  truck_status: TruckStatus; status_changed_at: string | null; departure_cleanup_at: string | null;
  zone_id: string | null; slot_id: string | null; x_position: number | null; y_position: number | null;
  orientation_degrees: number; is_active: boolean; removed_at: string | null; version: number;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
};
export type ConnectionRow = { id: string; warehouse_id: string; parent_asset_id: string; child_asset_id: string; connection_type: ConnectionType; connected_by: string | null; connected_at: string; disconnected_at: string | null; is_active: boolean; version: number };
export type MembershipRow = { warehouse_id: string; user_id: string; role: AppRole; created_at: string };
export type ProfileRow = { id: string; display_name: string | null; created_at: string; updated_at: string };
export type AssetEventRow = {
  id: string; warehouse_id: string; asset_id: string | null; event_type: EventType;
  old_state: Json | null; new_state: Json | null; user_id: string | null; user_display_name: string | null;
  is_undo: boolean; reverses_event_id: string | null; reversed_at: string | null; reversed_by: string | null;
  created_at: string;
};
export type AppSettingRow = { id: string; warehouse_id: string; key: string; value: Json; updated_at: string };
export type ConfigurationRow = { id: string; warehouse_id: string; name: string; description: string | null; created_by: string | null; created_at: string; archived_at: string | null };
export type ConfigurationAssetRow = { id: string; configuration_id: string; source_asset_id: string | null; asset_snapshot: Json; created_at: string };
export type ConfigurationConnectionRow = { id: string; configuration_id: string; connection_snapshot: Json; created_at: string };
export type UldLoadItemRow = {
  id: string; asset_id: string; destination_code: string | null; package_count: number | null;
  description: string | null; source_reference: string | null; notes: string | null;
  created_at: string; updated_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      warehouses: Table<WarehouseRow>;
      warehouse_memberships: Table<MembershipRow>;
      zones: Table<ZoneRow>;
      slots: Table<SlotRow>;
      assets: Table<AssetRow>;
      asset_connections: Table<ConnectionRow>;
      uld_load_items: Table<UldLoadItemRow>;
      asset_events: Table<AssetEventRow>;
      configurations: Table<ConfigurationRow>;
      configuration_assets: Table<ConfigurationAssetRow>;
      configuration_connections: Table<ConfigurationConnectionRow>;
      app_settings: Table<AppSettingRow>;
    };
    Views: {
      live_assets: { Row: AssetRow & { zone_code: string | null; zone_name: string | null; zone_type: ZoneType | null; slot_number: number | null }; Relationships: [] };
    };
    Functions: {
      has_warehouse_role: { Args: { p_warehouse_id: string; p_minimum_role?: AppRole }; Returns: boolean };
      cleanup_departed_trucks: { Args: Record<PropertyKey, never>; Returns: number };
      create_asset: { Args: { p_warehouse_id: string; p_asset_category: AssetCategory; p_uld_type?: UldType | null; p_truck_type?: TruckType | null; p_external_identifier?: string | null; p_destination?: string | null; p_zone_id?: string | null; p_slot_id?: string | null; p_x_position?: number | null; p_y_position?: number | null; p_orientation_degrees?: number }; Returns: AssetRow };
      move_asset: { Args: { p_asset_id: string; p_expected_version: number; p_zone_id: string; p_slot_id?: string | null; p_x_position?: number | null; p_y_position?: number | null; p_orientation_degrees?: number | null }; Returns: AssetRow };
      replace_asset_type: { Args: { p_asset_id: string; p_expected_version: number; p_uld_type?: UldType | null; p_truck_type?: TruckType | null }; Returns: AssetRow };
      set_truck_status: { Args: { p_asset_id: string; p_expected_version: number; p_status: TruckStatus; p_departure_cleanup_seconds?: number | null }; Returns: AssetRow };
      soft_remove_asset: { Args: { p_asset_id: string; p_expected_version: number }; Returns: AssetRow };
      update_uld_destination: { Args: { p_asset_id: string; p_expected_version: number; p_destination: string }; Returns: AssetRow };
      connect_tug_to_uld: { Args: { p_tug_id: string; p_tug_expected_version: number; p_uld_id: string; p_uld_expected_version: number }; Returns: ConnectionRow };
      disconnect_tow: { Args: { p_connection_id: string; p_expected_version: number }; Returns: ConnectionRow };
      undo_last_action: { Args: { p_warehouse_id: string }; Returns: Json };
      save_board_configuration: { Args: { p_warehouse_id: string; p_name: string; p_description?: string | null }; Returns: ConfigurationRow };
      load_board_configuration: { Args: { p_configuration_id: string }; Returns: Json };
    };
    Enums: {
      zone_type: ZoneType; asset_category: AssetCategory; uld_type: UldType; truck_type: TruckType;
      truck_status: TruckStatus; connection_type: ConnectionType; event_type: EventType; app_role: AppRole;
    };
    CompositeTypes: Record<never, never>;
  };
}
