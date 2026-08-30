-- WFS FlowBoard production core schema.
create extension if not exists pgcrypto;

do $$ begin create type public.zone_type as enum ('LANE', 'MIXED', 'DOCK', 'FREE_MOVEMENT', 'STATIC'); exception when duplicate_object then null; end $$;
do $$ begin create type public.asset_category as enum ('ULD', 'TUG', 'TRUCK', 'AIRCRAFT', 'CART'); exception when duplicate_object then null; end $$;
do $$ begin create type public.uld_type as enum ('AAX', 'LAY', 'DQF', 'AKE'); exception when duplicate_object then null; end $$;
do $$ begin create type public.truck_type as enum ('BOX_TRUCK', 'TRACTOR_TRAILER'); exception when duplicate_object then null; end $$;
do $$ begin create type public.truck_status as enum ('NONE', 'LOADING', 'UNLOADING', 'COMPLETE', 'DEPARTING'); exception when duplicate_object then null; end $$;
do $$ begin create type public.connection_type as enum ('TOW'); exception when duplicate_object then null; end $$;
do $$ begin create type public.event_type as enum ('CREATED', 'MOVED', 'ROTATED', 'DESTINATION_CHANGED', 'CONNECTED', 'DISCONNECTED', 'TRUCK_STATUS_CHANGED', 'DEPARTED', 'REMOVED', 'CONFIGURATION_LOADED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.app_role as enum ('OPERATOR', 'MANAGER', 'ADMIN'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_memberships (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'OPERATOR',
  created_at timestamptz not null default now(),
  primary key (warehouse_id, user_id)
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code text not null,
  name text not null,
  zone_type public.zone_type not null,
  capacity integer check (capacity is null or capacity >= 0),
  x numeric not null,
  y numeric not null,
  width numeric not null check (width > 0),
  height numeric not null check (height > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, code)
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  x numeric not null,
  y numeric not null,
  default_orientation_degrees integer not null default 0 check (default_orientation_degrees in (0, 180)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, slot_number)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  asset_category public.asset_category not null,
  uld_type public.uld_type,
  external_identifier text,
  destination text,
  truck_type public.truck_type,
  truck_status public.truck_status not null default 'NONE',
  status_changed_at timestamptz,
  departure_cleanup_at timestamptz,
  zone_id uuid references public.zones(id) on delete restrict,
  slot_id uuid references public.slots(id) on delete restrict,
  x_position numeric,
  y_position numeric,
  orientation_degrees integer not null default 0 check (orientation_degrees >= 0 and orientation_degrees < 360),
  is_active boolean not null default true,
  removed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_uld_fields check (asset_category <> 'ULD' or uld_type is not null),
  constraint assets_truck_fields check (asset_category <> 'TRUCK' or truck_type is not null),
  constraint assets_uld_orientation check (asset_category <> 'ULD' or orientation_degrees in (0, 180)),
  constraint assets_removed_state check ((is_active and removed_at is null) or (not is_active and removed_at is not null)),
  constraint assets_free_position_pair check ((x_position is null) = (y_position is null))
);

create unique index if not exists one_active_asset_per_slot on public.assets(slot_id) where slot_id is not null and is_active;
create unique index if not exists one_active_truck_per_dock on public.assets(zone_id) where asset_category = 'TRUCK' and zone_id is not null and is_active;
create index if not exists assets_warehouse_active_idx on public.assets(warehouse_id, is_active);
create index if not exists assets_zone_idx on public.assets(zone_id);
create index if not exists assets_truck_status_idx on public.assets(truck_status) where asset_category = 'TRUCK' and is_active;

create table if not exists public.asset_connections (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  parent_asset_id uuid not null references public.assets(id) on delete restrict,
  child_asset_id uuid not null references public.assets(id) on delete restrict,
  connection_type public.connection_type not null default 'TOW',
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  constraint different_assets check (parent_asset_id <> child_asset_id),
  constraint connection_lifecycle check ((is_active and disconnected_at is null) or (not is_active and disconnected_at is not null))
);

create unique index if not exists one_active_connection_per_parent on public.asset_connections(parent_asset_id) where is_active;
create unique index if not exists one_active_connection_per_child on public.asset_connections(child_asset_id) where is_active;

create table if not exists public.uld_load_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  destination_code text,
  package_count integer check (package_count is null or package_count >= 0),
  description text,
  source_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uld_load_items_asset_idx on public.uld_load_items(asset_id);
create index if not exists uld_load_items_destination_idx on public.uld_load_items(destination_code);

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

create index if not exists asset_events_asset_idx on public.asset_events(asset_id, created_at desc);
create index if not exists asset_events_warehouse_idx on public.asset_events(warehouse_id, created_at desc);

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

create table if not exists public.configuration_connections (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete cascade,
  connection_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, key)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','warehouses','zones','slots','assets','uld_load_items','app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function public.validate_asset_location()
returns trigger language plpgsql set search_path = public as $$
declare
  selected_zone public.zones;
  selected_slot public.slots;
begin
  if new.zone_id is null then
    if new.slot_id is not null then raise exception 'A slot requires a zone'; end if;
    return new;
  end if;

  select * into selected_zone from public.zones where id = new.zone_id and is_active;
  if not found then raise exception 'Active zone not found'; end if;
  if selected_zone.warehouse_id <> new.warehouse_id then raise exception 'Asset and zone must belong to the same warehouse'; end if;

  if new.asset_category = 'ULD' and selected_zone.zone_type not in ('LANE', 'MIXED') then
    raise exception 'ULD assets may only be placed in LANE or MIXED zones';
  elsif new.asset_category = 'ULD' and new.slot_id is null then
    raise exception 'A placed ULD requires an explicit slot';
  elsif new.asset_category = 'TRUCK' and selected_zone.zone_type <> 'DOCK' then
    raise exception 'TRUCK assets may only be placed in DOCK zones';
  elsif new.asset_category = 'TRUCK' and new.slot_id is not null then
    raise exception 'TRUCK assets use dock zones, not ULD slots';
  end if;

  if new.slot_id is not null then
    select * into selected_slot from public.slots where id = new.slot_id and is_active;
    if not found or selected_slot.zone_id <> new.zone_id then raise exception 'Slot does not belong to the selected active zone'; end if;
  end if;
  return new;
end;
$$;

create trigger assets_validate_location before insert or update of warehouse_id, zone_id, slot_id, asset_category on public.assets for each row execute function public.validate_asset_location();

create or replace function public.validate_asset_connection()
returns trigger language plpgsql set search_path = public as $$
declare parent_asset public.assets; child_asset public.assets;
begin
  select * into parent_asset from public.assets where id = new.parent_asset_id and is_active;
  select * into child_asset from public.assets where id = new.child_asset_id and is_active;
  if parent_asset.id is null or child_asset.id is null then raise exception 'Connections require active assets'; end if;
  if parent_asset.warehouse_id <> new.warehouse_id or child_asset.warehouse_id <> new.warehouse_id then raise exception 'Connected assets must belong to the connection warehouse'; end if;
  if new.connection_type = 'TOW' and (parent_asset.asset_category <> 'TUG' or child_asset.asset_category <> 'ULD') then
    raise exception 'TOW connections must be TUG -> ULD';
  end if;
  return new;
end;
$$;

create trigger connections_validate before insert or update on public.asset_connections for each row execute function public.validate_asset_connection();

create or replace function public.validate_slot_layout()
returns trigger language plpgsql set search_path = public as $$
declare parent_zone public.zones;
begin
  select * into parent_zone from public.zones where id = new.zone_id and is_active;
  if parent_zone.id is null then raise exception 'Slots require an active parent zone'; end if;
  if parent_zone.zone_type not in ('LANE', 'MIXED') then raise exception 'ULD slots may only belong to LANE or MIXED zones'; end if;
  if parent_zone.capacity is null or new.slot_number > parent_zone.capacity then raise exception 'Slot number exceeds zone capacity'; end if;
  return new;
end;
$$;

create trigger slots_validate_layout before insert or update of zone_id, slot_number on public.slots for each row execute function public.validate_slot_layout();

create or replace view public.live_assets with (security_invoker = true) as
select a.*, z.code as zone_code, z.name as zone_name, z.zone_type, s.slot_number
from public.assets a
left join public.zones z on z.id = a.zone_id
left join public.slots s on s.id = a.slot_id
where a.is_active
  and not (a.asset_category = 'TRUCK' and a.truck_status = 'DEPARTING' and a.departure_cleanup_at is not null and a.departure_cleanup_at <= now());

comment on table public.assets is 'Authoritative live and soft-removed operational assets. Direct hard deletion is denied by RLS.';
comment on column public.assets.version is 'Optimistic concurrency token; every authoritative mutation increments this value.';
