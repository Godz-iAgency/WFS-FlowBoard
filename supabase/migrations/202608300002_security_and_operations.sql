-- Warehouse-scoped authorization, audited mutations, and concurrency-safe RPCs.
create or replace function public.has_warehouse_role(p_warehouse_id uuid, p_minimum_role public.app_role default 'OPERATOR')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.warehouse_memberships membership
    where membership.warehouse_id = p_warehouse_id
      and membership.user_id = auth.uid()
      and membership.role >= p_minimum_role
  );
$$;

revoke all on function public.has_warehouse_role(uuid, public.app_role) from public;
grant execute on function public.has_warehouse_role(uuid, public.app_role) to authenticated;

alter table public.profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.warehouse_memberships enable row level security;
alter table public.zones enable row level security;
alter table public.slots enable row level security;
alter table public.assets enable row level security;
alter table public.asset_connections enable row level security;
alter table public.uld_load_items enable row level security;
alter table public.asset_events enable row level security;
alter table public.configurations enable row level security;
alter table public.configuration_assets enable row level security;
alter table public.configuration_connections enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles read self" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read warehouses" on public.warehouses for select to authenticated using (public.has_warehouse_role(id));
create policy "members read own membership" on public.warehouse_memberships for select to authenticated
  using (user_id = auth.uid() or public.has_warehouse_role(warehouse_id, 'ADMIN'));
create policy "admins manage membership" on public.warehouse_memberships for all to authenticated
  using (public.has_warehouse_role(warehouse_id, 'ADMIN'))
  with check (public.has_warehouse_role(warehouse_id, 'ADMIN'));

create policy "members read zones" on public.zones for select to authenticated using (public.has_warehouse_role(warehouse_id));
create policy "admins manage zones" on public.zones for all to authenticated
  using (public.has_warehouse_role(warehouse_id, 'ADMIN'))
  with check (public.has_warehouse_role(warehouse_id, 'ADMIN'));

create policy "members read slots" on public.slots for select to authenticated
  using (exists (select 1 from public.zones zone where zone.id = slots.zone_id and public.has_warehouse_role(zone.warehouse_id)));
create policy "admins manage slots" on public.slots for all to authenticated
  using (exists (select 1 from public.zones zone where zone.id = slots.zone_id and public.has_warehouse_role(zone.warehouse_id, 'ADMIN')))
  with check (exists (select 1 from public.zones zone where zone.id = slots.zone_id and public.has_warehouse_role(zone.warehouse_id, 'ADMIN')));

-- Assets and connections are read directly but changed only through audited RPCs below.
create policy "members read assets" on public.assets for select to authenticated using (public.has_warehouse_role(warehouse_id));
create policy "members read connections" on public.asset_connections for select to authenticated using (public.has_warehouse_role(warehouse_id));
create policy "members read load items" on public.uld_load_items for select to authenticated
  using (exists (select 1 from public.assets asset where asset.id = uld_load_items.asset_id and public.has_warehouse_role(asset.warehouse_id)));
create policy "members read events" on public.asset_events for select to authenticated using (public.has_warehouse_role(warehouse_id));

create policy "managers read configurations" on public.configurations for select to authenticated using (public.has_warehouse_role(warehouse_id, 'MANAGER'));
create policy "managers read configuration assets" on public.configuration_assets for select to authenticated
  using (exists (select 1 from public.configurations config where config.id = configuration_assets.configuration_id and public.has_warehouse_role(config.warehouse_id, 'MANAGER')));
create policy "managers read configuration connections" on public.configuration_connections for select to authenticated
  using (exists (select 1 from public.configurations config where config.id = configuration_connections.configuration_id and public.has_warehouse_role(config.warehouse_id, 'MANAGER')));

create policy "members read settings" on public.app_settings for select to authenticated using (public.has_warehouse_role(warehouse_id));
create policy "admins manage settings" on public.app_settings for all to authenticated
  using (public.has_warehouse_role(warehouse_id, 'ADMIN'))
  with check (public.has_warehouse_role(warehouse_id, 'ADMIN'));

create or replace function public.create_asset(
  p_warehouse_id uuid,
  p_asset_category public.asset_category,
  p_uld_type public.uld_type default null,
  p_truck_type public.truck_type default null,
  p_external_identifier text default null,
  p_destination text default null,
  p_zone_id uuid default null,
  p_slot_id uuid default null,
  p_x_position numeric default null,
  p_y_position numeric default null,
  p_orientation_degrees integer default 0
)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare result public.assets;
begin
  if not public.has_warehouse_role(p_warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if p_asset_category not in ('ULD', 'TRUCK') then
    raise exception 'Asset creation for this category is not enabled until its operational placement rules are fully configured';
  end if;
  if p_zone_id is null then raise exception 'A new operational asset requires a valid zone'; end if;

  insert into public.assets (
    warehouse_id, asset_category, uld_type, truck_type, external_identifier, destination,
    zone_id, slot_id, x_position, y_position, orientation_degrees, created_by, updated_by
  ) values (
    p_warehouse_id, p_asset_category, p_uld_type, p_truck_type, nullif(trim(p_external_identifier), ''),
    nullif(trim(p_destination), ''), p_zone_id, p_slot_id, p_x_position, p_y_position,
    p_orientation_degrees, auth.uid(), auth.uid()
  ) returning * into result;

  insert into public.asset_events (warehouse_id, asset_id, event_type, new_state, user_id)
  values (result.warehouse_id, result.id, 'CREATED', to_jsonb(result), auth.uid());
  return result;
end;
$$;

create or replace function public.move_asset(
  p_asset_id uuid,
  p_expected_version integer,
  p_zone_id uuid,
  p_slot_id uuid default null,
  p_x_position numeric default null,
  p_y_position numeric default null,
  p_orientation_degrees integer default null
)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare original public.assets; result public.assets; recorded_event public.event_type;
begin
  select * into original from public.assets where id = p_asset_id and is_active for update;
  if original.id is null then raise exception 'Active asset not found'; end if;
  if not public.has_warehouse_role(original.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if original.version <> p_expected_version then raise exception 'STALE_VERSION: expected %, current %', p_expected_version, original.version using errcode = '40001'; end if;
  if original.asset_category not in ('ULD', 'TRUCK') then
    raise exception 'Movement for this asset category is not enabled until its operational placement rules are fully configured';
  end if;

  recorded_event := case
    when original.zone_id is not distinct from p_zone_id
      and original.slot_id is not distinct from p_slot_id
      and original.x_position is not distinct from p_x_position
      and original.y_position is not distinct from p_y_position
      and p_orientation_degrees is not null
      and original.orientation_degrees <> p_orientation_degrees
    then 'ROTATED'::public.event_type else 'MOVED'::public.event_type end;

  update public.assets set
    zone_id = p_zone_id,
    slot_id = p_slot_id,
    x_position = p_x_position,
    y_position = p_y_position,
    orientation_degrees = coalesce(p_orientation_degrees, orientation_degrees),
    version = version + 1,
    updated_by = auth.uid()
  where id = p_asset_id
  returning * into result;

  insert into public.asset_events (warehouse_id, asset_id, event_type, old_state, new_state, user_id)
  values (result.warehouse_id, result.id, recorded_event, to_jsonb(original), to_jsonb(result), auth.uid());
  return result;
end;
$$;

create or replace function public.set_truck_status(
  p_asset_id uuid,
  p_expected_version integer,
  p_status public.truck_status,
  p_departure_cleanup_seconds integer default null
)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare original public.assets; result public.assets; cleanup_seconds integer;
begin
  select * into original from public.assets where id = p_asset_id and is_active for update;
  if original.id is null or original.asset_category <> 'TRUCK' then raise exception 'Active truck not found'; end if;
  if not public.has_warehouse_role(original.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if original.version <> p_expected_version then raise exception 'STALE_VERSION: expected %, current %', p_expected_version, original.version using errcode = '40001'; end if;
  if p_status = 'NONE' then raise exception 'NONE is an initialization state, not an operational truck action'; end if;

  cleanup_seconds := coalesce(
    p_departure_cleanup_seconds,
    (select (value #>> '{}')::integer from public.app_settings where warehouse_id = original.warehouse_id and key = 'departure_cleanup_seconds'),
    120
  );
  if cleanup_seconds < 1 or cleanup_seconds > 86400 then raise exception 'Departure cleanup seconds must be between 1 and 86400'; end if;

  update public.assets set
    truck_status = p_status,
    status_changed_at = now(),
    departure_cleanup_at = case when p_status = 'DEPARTING' then now() + make_interval(secs => cleanup_seconds) else null end,
    version = version + 1,
    updated_by = auth.uid()
  where id = p_asset_id
  returning * into result;

  insert into public.asset_events (warehouse_id, asset_id, event_type, old_state, new_state, user_id)
  values (result.warehouse_id, result.id, 'TRUCK_STATUS_CHANGED', to_jsonb(original), to_jsonb(result), auth.uid());
  return result;
end;
$$;

create or replace function public.soft_remove_asset(p_asset_id uuid, p_expected_version integer)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare original public.assets; result public.assets;
begin
  select * into original from public.assets where id = p_asset_id and is_active for update;
  if original.id is null then raise exception 'Active asset not found'; end if;
  if not public.has_warehouse_role(original.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if original.version <> p_expected_version then raise exception 'STALE_VERSION: expected %, current %', p_expected_version, original.version using errcode = '40001'; end if;

  update public.asset_connections set is_active = false, disconnected_at = now(), version = version + 1
  where is_active and (parent_asset_id = p_asset_id or child_asset_id = p_asset_id);

  update public.assets set is_active = false, removed_at = now(), version = version + 1, updated_by = auth.uid()
  where id = p_asset_id returning * into result;

  insert into public.asset_events (warehouse_id, asset_id, event_type, old_state, new_state, user_id)
  values (result.warehouse_id, result.id, 'REMOVED', to_jsonb(original), to_jsonb(result), auth.uid());
  return result;
end;
$$;

create or replace function public.cleanup_departed_trucks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare result public.assets; affected integer := 0;
begin
  for result in
    update public.assets
      set is_active = false, removed_at = now(), version = version + 1, updated_by = auth.uid()
      where asset_category = 'TRUCK' and is_active and truck_status = 'DEPARTING'
        and departure_cleanup_at is not null and departure_cleanup_at <= now()
        and (current_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' or public.has_warehouse_role(warehouse_id, 'OPERATOR'))
      returning *
  loop
    insert into public.asset_events (warehouse_id, asset_id, event_type, new_state, user_id)
    values (result.warehouse_id, result.id, 'DEPARTED', to_jsonb(result), auth.uid());
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

revoke all on function public.create_asset(uuid, public.asset_category, public.uld_type, public.truck_type, text, text, uuid, uuid, numeric, numeric, integer) from public;
revoke all on function public.move_asset(uuid, integer, uuid, uuid, numeric, numeric, integer) from public;
revoke all on function public.set_truck_status(uuid, integer, public.truck_status, integer) from public;
revoke all on function public.soft_remove_asset(uuid, integer) from public;
revoke all on function public.cleanup_departed_trucks() from public;
grant execute on function public.create_asset(uuid, public.asset_category, public.uld_type, public.truck_type, text, text, uuid, uuid, numeric, numeric, integer) to authenticated;
grant execute on function public.move_asset(uuid, integer, uuid, uuid, numeric, numeric, integer) to authenticated;
grant execute on function public.set_truck_status(uuid, integer, public.truck_status, integer) to authenticated;
grant execute on function public.soft_remove_asset(uuid, integer) to authenticated;
grant execute on function public.cleanup_departed_trucks() to authenticated, service_role;

-- Realtime clients receive only rows allowed by RLS.
do $$
declare table_name text;
begin
  foreach table_name in array array['zones','slots','assets','asset_connections','app_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
