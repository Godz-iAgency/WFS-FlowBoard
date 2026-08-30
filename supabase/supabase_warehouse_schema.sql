-- Warehouse Operations Board
-- Supabase / PostgreSQL initial schema
-- Version 1

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$ begin
  create type public.zone_type as enum (
    'LANE',
    'MIXED',
    'DOCK',
    'FREE_MOVEMENT',
    'STATIC'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.asset_category as enum (
    'ULD',
    'TUG',
    'TRUCK',
    'AIRCRAFT',
    'CART'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.uld_type as enum (
    'AAX',
    'LAY',
    'DQF',
    'AKE'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.truck_type as enum (
    'BOX_TRUCK',
    'TRACTOR_TRAILER'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.truck_status as enum (
    'NONE',
    'LOADING',
    'UNLOADING',
    'COMPLETE',
    'DEPARTING'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.connection_type as enum (
    'TOW'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_type as enum (
    'CREATED',
    'MOVED',
    'ROTATED',
    'DESTINATION_CHANGED',
    'CONNECTED',
    'DISCONNECTED',
    'TRUCK_STATUS_CHANGED',
    'DEPARTED',
    'REMOVED',
    'CONFIGURATION_LOADED'
  );
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code text not null,
  name text not null,
  zone_type public.zone_type not null,
  capacity integer,
  x numeric,
  y numeric,
  width numeric,
  height numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (warehouse_id, code)
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  slot_number integer not null,
  x numeric not null,
  y numeric not null,
  default_orientation_degrees integer not null default 0,
  is_active boolean not null default true,
  unique(zone_id, slot_number)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,

  asset_category public.asset_category not null,

  -- ULD-specific
  uld_type public.uld_type,
  external_identifier text,
  destination text,

  -- Truck-specific
  truck_type public.truck_type,
  truck_status public.truck_status not null default 'NONE',
  status_changed_at timestamptz,
  departure_cleanup_at timestamptz,

  -- Location
  zone_id uuid references public.zones(id) on delete set null,
  slot_id uuid references public.slots(id) on delete set null,
  x_position numeric,
  y_position numeric,
  orientation_degrees integer not null default 0,

  -- Lifecycle
  is_active boolean not null default true,
  removed_at timestamptz,

  -- Auditing
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_orientation_valid
    check (orientation_degrees >= 0 and orientation_degrees < 360),

  constraint assets_uld_fields
    check (
      asset_category <> 'ULD'
      or uld_type is not null
    ),

  constraint assets_truck_fields
    check (
      asset_category <> 'TRUCK'
      or truck_type is not null
    )
);

-- One active asset per slot.
create unique index if not exists one_active_asset_per_slot
on public.assets(slot_id)
where slot_id is not null and is_active = true;

create index if not exists assets_warehouse_idx
on public.assets(warehouse_id);

create index if not exists assets_zone_idx
on public.assets(zone_id);

create index if not exists assets_active_idx
on public.assets(warehouse_id, is_active);

create index if not exists assets_truck_status_idx
on public.assets(truck_status)
where asset_category = 'TRUCK' and is_active = true;

-- ============================================================
-- CONNECTIONS
-- ============================================================

create table if not exists public.asset_connections (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  parent_asset_id uuid not null references public.assets(id) on delete cascade,
  child_asset_id uuid not null references public.assets(id) on delete cascade,
  connection_type public.connection_type not null default 'TOW',
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  is_active boolean not null default true,
  constraint different_assets check (parent_asset_id <> child_asset_id)
);

create index if not exists active_connections_parent_idx
on public.asset_connections(parent_asset_id)
where is_active = true;

create index if not exists active_connections_child_idx
on public.asset_connections(child_asset_id)
where is_active = true;

-- ============================================================
-- ULD CONTENT / MANIFEST DATA
-- ============================================================

create table if not exists public.uld_load_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  destination_code text,
  package_count integer,
  description text,
  source_reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint positive_package_count
    check (package_count is null or package_count >= 0)
);

create index if not exists uld_load_items_asset_idx
on public.uld_load_items(asset_id);

create index if not exists uld_load_items_destination_idx
on public.uld_load_items(destination_code);

-- ============================================================
-- EVENT HISTORY
-- ============================================================

create table if not exists public.asset_events (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  event_type public.event_type not null,
  old_state jsonb,
  new_state jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists asset_events_asset_idx
on public.asset_events(asset_id, created_at desc);

create index if not exists asset_events_warehouse_idx
on public.asset_events(warehouse_id, created_at desc);

-- ============================================================
-- SAVED CONFIGURATIONS
-- ============================================================

create table if not exists public.configurations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.configuration_assets (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete cascade,
  source_asset_id uuid references public.assets(id) on delete set null,
  asset_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists configuration_assets_config_idx
on public.configuration_assets(configuration_id);

-- ============================================================
-- APPLICATION SETTINGS
-- ============================================================

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique(warehouse_id, key)
);

-- Recommended setting:
-- key = 'departure_cleanup_seconds'
-- value = '120'::jsonb
--
-- The user mentioned both 100 seconds and 2 minutes.
-- Keep this configurable until the exact value is confirmed.

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assets_set_updated_at on public.assets;

create trigger assets_set_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

-- ============================================================
-- OPERATIONAL VALIDATION FUNCTIONS
-- ============================================================

create or replace function public.validate_asset_location()
returns trigger
language plpgsql
as $$
declare
  ztype public.zone_type;
begin
  if new.zone_id is null then
    return new;
  end if;

  select zone_type into ztype
  from public.zones
  where id = new.zone_id;

  if new.asset_category = 'ULD' and ztype not in ('LANE', 'MIXED') then
    raise exception 'ULD assets may only be placed in LANE or MIXED zones';
  end if;

  if new.asset_category = 'TRUCK' and ztype <> 'DOCK' then
    raise exception 'TRUCK assets may only be placed in DOCK zones';
  end if;

  return new;
end;
$$;

drop trigger if exists assets_validate_location on public.assets;

create trigger assets_validate_location
before insert or update of zone_id, asset_category
on public.assets
for each row
execute function public.validate_asset_location();

-- ============================================================
-- TUG -> ULD CONNECTION VALIDATION
-- ============================================================

create or replace function public.validate_asset_connection()
returns trigger
language plpgsql
as $$
declare
  parent_category public.asset_category;
  child_category public.asset_category;
begin
  select asset_category into parent_category
  from public.assets
  where id = new.parent_asset_id;

  select asset_category into child_category
  from public.assets
  where id = new.child_asset_id;

  if new.connection_type = 'TOW' then
    if parent_category <> 'TUG' or child_category <> 'ULD' then
      raise exception 'TOW connections must be TUG -> ULD';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists connections_validate on public.asset_connections;

create trigger connections_validate
before insert or update
on public.asset_connections
for each row
execute function public.validate_asset_connection();

-- ============================================================
-- TRUCK STATUS HELPERS
-- ============================================================

create or replace function public.set_truck_status(
  p_asset_id uuid,
  p_status public.truck_status,
  p_departure_cleanup_seconds integer default 120
)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.assets;
begin
  update public.assets
  set
    truck_status = p_status,
    status_changed_at = now(),
    departure_cleanup_at =
      case
        when p_status = 'DEPARTING'
          then now() + make_interval(secs => p_departure_cleanup_seconds)
        else null
      end,
    updated_by = auth.uid()
  where id = p_asset_id
    and asset_category = 'TRUCK'
    and is_active = true
  returning * into result;

  if result.id is null then
    raise exception 'Active truck not found';
  end if;

  insert into public.asset_events(
    warehouse_id,
    asset_id,
    event_type,
    new_state,
    user_id
  )
  values (
    result.warehouse_id,
    result.id,
    'TRUCK_STATUS_CHANGED',
    jsonb_build_object(
      'truck_status', result.truck_status,
      'departure_cleanup_at', result.departure_cleanup_at
    ),
    auth.uid()
  );

  return result;
end;
$$;

-- ============================================================
-- DEPARTURE CLEANUP
-- ============================================================

create or replace function public.cleanup_departed_trucks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.assets
  set
    is_active = false,
    removed_at = now(),
    updated_at = now()
  where
    asset_category = 'TRUCK'
    and is_active = true
    and truck_status = 'DEPARTING'
    and departure_cleanup_at is not null
    and departure_cleanup_at <= now();

  get diagnostics affected = row_count;

  return affected;
end;
$$;

-- The frontend can call cleanup_departed_trucks periodically,
-- for example every 30 seconds and on app startup.
-- Later this can be moved to a scheduled Supabase Edge Function.

-- ============================================================
-- LIVE BOARD VIEW
-- ============================================================

create or replace view public.live_assets as
select
  a.*,
  z.code as zone_code,
  z.name as zone_name,
  z.zone_type,
  s.slot_number
from public.assets a
left join public.zones z on z.id = a.zone_id
left join public.slots s on s.id = a.slot_id
where
  a.is_active = true
  and not (
    a.asset_category = 'TRUCK'
    and a.truck_status = 'DEPARTING'
    and a.departure_cleanup_at is not null
    and a.departure_cleanup_at <= now()
  );

-- ============================================================
-- RLS
-- ============================================================

alter table public.warehouses enable row level security;
alter table public.zones enable row level security;
alter table public.slots enable row level security;
alter table public.assets enable row level security;
alter table public.asset_connections enable row level security;
alter table public.uld_load_items enable row level security;
alter table public.asset_events enable row level security;
alter table public.configurations enable row level security;
alter table public.configuration_assets enable row level security;
alter table public.app_settings enable row level security;

-- Prototype policies:
-- Any authenticated internal user can read/write.
-- Tighten by role later.

do $$ begin
  create policy "authenticated read warehouses"
  on public.warehouses for select
  to authenticated
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated read zones"
  on public.zones for select
  to authenticated
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated read slots"
  on public.slots for select
  to authenticated
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage assets"
  on public.assets for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage connections"
  on public.asset_connections for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage uld load items"
  on public.uld_load_items for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage events"
  on public.asset_events for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage configurations"
  on public.configurations for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage configuration assets"
  on public.configuration_assets for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated manage settings"
  on public.app_settings for all
  to authenticated
  using (true)
  with check (true);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- INITIAL DATA TEMPLATE
-- ============================================================

-- After creating your warehouse, insert zones and slots.
-- Example sequence:
--
-- insert into public.warehouses(name, code)
-- values ('WFS Warehouse', 'WFS-01')
-- returning id;
--
-- Then use the returned warehouse id to create:
-- LANE_2, LANE_3, LANE_4, LANE_5, MIXED,
-- DD06 through DD15,
-- plus FREE_MOVEMENT/STATIC zones as needed.
--
-- Create 5 slots for each main lane and 2 for MIXED.
--
-- Coordinates should be based on the normalized React Konva
-- board coordinate system, not the physical monitor pixel size.
