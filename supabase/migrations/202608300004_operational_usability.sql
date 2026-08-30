-- Production usability: detailed audit identity, authoritative Undo,
-- destination updates, connections, and transactional configurations.

-- Live means authoritatively active. Departure cleanup changes the row first;
-- the view must not visually free a dock before the database does.
create or replace view public.live_assets with (security_invoker = true) as
select a.*, z.code as zone_code, z.name as zone_name, z.zone_type, s.slot_number
from public.assets a
left join public.zones z on z.id = a.zone_id
left join public.slots s on s.id = a.slot_id
where a.is_active;

alter table public.asset_events
  add column if not exists user_display_name text,
  add column if not exists is_undo boolean not null default false,
  add column if not exists reverses_event_id uuid references public.asset_events(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null;

update public.asset_events event
set user_display_name = profile.display_name
from public.profiles profile
where event.user_id = profile.id and event.user_display_name is null;

create index if not exists asset_events_reversible_idx
on public.asset_events(warehouse_id, user_id, created_at desc)
where reversed_at is null and is_undo = false;

create or replace function public.set_asset_event_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_name text;
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  if new.user_display_name is null then
    select display_name into actor_name from public.profiles where id = new.user_id;
    new.user_display_name := actor_name;
  end if;
  new.user_display_name := coalesce(new.user_display_name, 'System');
  return new;
end;
$$;

drop trigger if exists asset_events_set_identity on public.asset_events;
create trigger asset_events_set_identity
before insert on public.asset_events
for each row execute function public.set_asset_event_identity();

create or replace function public.record_asset_event(
  p_warehouse_id uuid,
  p_asset_id uuid,
  p_event_type public.event_type,
  p_old_state jsonb,
  p_new_state jsonb,
  p_is_undo boolean default false,
  p_reverses_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare event_id uuid; actor_name text;
begin
  select coalesce(display_name, 'Unknown user') into actor_name
  from public.profiles where id = auth.uid();

  insert into public.asset_events (
    warehouse_id, asset_id, event_type, old_state, new_state, user_id,
    user_display_name, is_undo, reverses_event_id
  ) values (
    p_warehouse_id, p_asset_id, p_event_type, p_old_state, p_new_state, auth.uid(),
    coalesce(actor_name, 'System'), p_is_undo, p_reverses_event_id
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function public.record_asset_event(uuid, uuid, public.event_type, jsonb, jsonb, boolean, uuid) from public, anon, authenticated;

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
  if original.asset_category = 'ULD' and exists (
    select 1 from public.asset_connections where child_asset_id = original.id and is_active
  ) then
    raise exception 'Disconnect the tug before moving this ULD independently';
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

  perform public.record_asset_event(result.warehouse_id, result.id, recorded_event, to_jsonb(original), to_jsonb(result));
  return result;
end;
$$;

create or replace function public.update_uld_destination(
  p_asset_id uuid,
  p_expected_version integer,
  p_destination text
)
returns public.assets
language plpgsql
security definer
set search_path = public
as $$
declare original public.assets; result public.assets;
begin
  select * into original from public.assets where id = p_asset_id and is_active for update;
  if original.id is null or original.asset_category <> 'ULD' then raise exception 'Active ULD not found'; end if;
  if not public.has_warehouse_role(original.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if original.version <> p_expected_version then raise exception 'STALE_VERSION: expected %, current %', p_expected_version, original.version using errcode = '40001'; end if;

  update public.assets set
    destination = nullif(upper(trim(p_destination)), ''),
    version = version + 1,
    updated_by = auth.uid()
  where id = p_asset_id returning * into result;

  perform public.record_asset_event(result.warehouse_id, result.id, 'DESTINATION_CHANGED', to_jsonb(original), to_jsonb(result));
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
  where id = p_asset_id returning * into result;

  perform public.record_asset_event(result.warehouse_id, result.id, 'TRUCK_STATUS_CHANGED', to_jsonb(original), to_jsonb(result));
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
  if exists (
    select 1 from public.asset_connections
    where is_active and (parent_asset_id = original.id or child_asset_id = original.id)
  ) then
    raise exception 'Disconnect the active tow before removing this asset';
  end if;

  update public.assets set is_active = false, removed_at = now(), version = version + 1, updated_by = auth.uid()
  where id = p_asset_id returning * into result;

  perform public.record_asset_event(result.warehouse_id, result.id, 'REMOVED', to_jsonb(original), to_jsonb(result));
  return result;
end;
$$;

create or replace function public.connect_tug_to_uld(
  p_tug_id uuid,
  p_tug_expected_version integer,
  p_uld_id uuid,
  p_uld_expected_version integer
)
returns public.asset_connections
language plpgsql
security definer
set search_path = public
as $$
declare tug public.assets; uld public.assets; result public.asset_connections;
begin
  select * into tug from public.assets where id = p_tug_id and is_active for update;
  select * into uld from public.assets where id = p_uld_id and is_active for update;
  if tug.id is null or uld.id is null then raise exception 'Active tug and ULD are required'; end if;
  if tug.warehouse_id <> uld.warehouse_id then raise exception 'Connected assets must share a warehouse'; end if;
  if not public.has_warehouse_role(tug.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if tug.version <> p_tug_expected_version or uld.version <> p_uld_expected_version then raise exception 'STALE_VERSION: a connected asset changed' using errcode = '40001'; end if;

  insert into public.asset_connections (warehouse_id, parent_asset_id, child_asset_id, connected_by)
  values (tug.warehouse_id, tug.id, uld.id, auth.uid()) returning * into result;
  perform public.record_asset_event(
    tug.warehouse_id, uld.id, 'CONNECTED', null,
    to_jsonb(result) || jsonb_build_object('external_identifier', uld.external_identifier, 'uld_type', uld.uld_type)
  );
  return result;
end;
$$;

create or replace function public.disconnect_tow(p_connection_id uuid, p_expected_version integer)
returns public.asset_connections
language plpgsql
security definer
set search_path = public
as $$
declare original public.asset_connections; result public.asset_connections; uld public.assets;
begin
  select * into original from public.asset_connections where id = p_connection_id and is_active for update;
  if original.id is null then raise exception 'Active connection not found'; end if;
  if not public.has_warehouse_role(original.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if original.version <> p_expected_version then raise exception 'STALE_VERSION: expected %, current %', p_expected_version, original.version using errcode = '40001'; end if;

  update public.asset_connections set is_active = false, disconnected_at = now(), version = version + 1
  where id = original.id returning * into result;
  select * into uld from public.assets where id = result.child_asset_id;
  perform public.record_asset_event(
    result.warehouse_id, result.child_asset_id, 'DISCONNECTED',
    to_jsonb(original) || jsonb_build_object('external_identifier', uld.external_identifier, 'uld_type', uld.uld_type),
    to_jsonb(result) || jsonb_build_object('external_identifier', uld.external_identifier, 'uld_type', uld.uld_type)
  );
  return result;
end;
$$;

create or replace function public.undo_last_action(p_warehouse_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.asset_events;
  current_asset public.assets;
  restored_asset public.assets;
  current_connection public.asset_connections;
  restored_connection public.asset_connections;
  undo_event_id uuid;
begin
  if not public.has_warehouse_role(p_warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;

  select * into target
  from public.asset_events
  where warehouse_id = p_warehouse_id
    and user_id = auth.uid()
    and is_undo = false
    and reversed_at is null
    and event_type in ('MOVED', 'ROTATED', 'DESTINATION_CHANGED', 'CONNECTED', 'DISCONNECTED', 'TRUCK_STATUS_CHANGED', 'REMOVED')
  order by created_at desc, id desc
  limit 1
  for update;

  if target.id is null then raise exception 'NOTHING_TO_UNDO: no reversible action is available'; end if;

  if exists (
    select 1 from public.asset_events newer
    where newer.asset_id = target.asset_id
      and (newer.created_at, newer.id) > (target.created_at, target.id)
      and newer.is_undo = false
      and newer.reversed_at is null
  ) then
    raise exception 'STALE_VERSION: this asset has a newer operational change' using errcode = '40001';
  end if;

  if target.event_type in ('CONNECTED', 'DISCONNECTED') then
    select * into current_connection
    from public.asset_connections
    where id = coalesce((target.new_state ->> 'id')::uuid, (target.old_state ->> 'id')::uuid)
    for update;
    if current_connection.id is null then raise exception 'UNDO_UNAVAILABLE: connection no longer exists'; end if;
    if current_connection.is_active is distinct from (target.new_state ->> 'is_active')::boolean
      or current_connection.disconnected_at is distinct from nullif(target.new_state ->> 'disconnected_at', '')::timestamptz
    then
      raise exception 'STALE_VERSION: connection was updated by another user' using errcode = '40001';
    end if;

    if target.event_type = 'CONNECTED' then
      update public.asset_connections set is_active = false, disconnected_at = now(), version = version + 1
      where id = current_connection.id returning * into restored_connection;
    else
      update public.asset_connections set is_active = true, disconnected_at = null, version = version + 1
      where id = current_connection.id returning * into restored_connection;
    end if;

    undo_event_id := public.record_asset_event(
      target.warehouse_id, target.asset_id, target.event_type,
      to_jsonb(current_connection), to_jsonb(restored_connection), true, target.id
    );
  else
    select * into current_asset from public.assets where id = target.asset_id for update;
    if current_asset.id is null then raise exception 'UNDO_UNAVAILABLE: asset no longer exists'; end if;

    if target.event_type in ('MOVED', 'ROTATED') then
      if current_asset.zone_id is distinct from nullif(target.new_state ->> 'zone_id', '')::uuid
        or current_asset.slot_id is distinct from nullif(target.new_state ->> 'slot_id', '')::uuid
        or current_asset.x_position is distinct from nullif(target.new_state ->> 'x_position', '')::numeric
        or current_asset.y_position is distinct from nullif(target.new_state ->> 'y_position', '')::numeric
        or current_asset.orientation_degrees is distinct from (target.new_state ->> 'orientation_degrees')::integer
      then raise exception 'STALE_VERSION: asset was updated by another user' using errcode = '40001'; end if;
      update public.assets set
        zone_id = nullif(target.old_state ->> 'zone_id', '')::uuid,
        slot_id = nullif(target.old_state ->> 'slot_id', '')::uuid,
        x_position = nullif(target.old_state ->> 'x_position', '')::numeric,
        y_position = nullif(target.old_state ->> 'y_position', '')::numeric,
        orientation_degrees = (target.old_state ->> 'orientation_degrees')::integer,
        version = version + 1,
        updated_by = auth.uid()
      where id = current_asset.id returning * into restored_asset;
    elsif target.event_type = 'DESTINATION_CHANGED' then
      if current_asset.destination is distinct from (target.new_state ->> 'destination')
      then raise exception 'STALE_VERSION: asset was updated by another user' using errcode = '40001'; end if;
      update public.assets set
        destination = target.old_state ->> 'destination',
        version = version + 1,
        updated_by = auth.uid()
      where id = current_asset.id returning * into restored_asset;
    elsif target.event_type = 'TRUCK_STATUS_CHANGED' then
      if current_asset.truck_status is distinct from (target.new_state ->> 'truck_status')::public.truck_status
        or current_asset.status_changed_at is distinct from nullif(target.new_state ->> 'status_changed_at', '')::timestamptz
        or current_asset.departure_cleanup_at is distinct from nullif(target.new_state ->> 'departure_cleanup_at', '')::timestamptz
      then raise exception 'STALE_VERSION: asset was updated by another user' using errcode = '40001'; end if;
      update public.assets set
        truck_status = (target.old_state ->> 'truck_status')::public.truck_status,
        status_changed_at = nullif(target.old_state ->> 'status_changed_at', '')::timestamptz,
        departure_cleanup_at = nullif(target.old_state ->> 'departure_cleanup_at', '')::timestamptz,
        version = version + 1,
        updated_by = auth.uid()
      where id = current_asset.id returning * into restored_asset;
    elsif target.event_type = 'REMOVED' then
      if current_asset.is_active is distinct from (target.new_state ->> 'is_active')::boolean
        or current_asset.removed_at is distinct from nullif(target.new_state ->> 'removed_at', '')::timestamptz
      then raise exception 'STALE_VERSION: asset was updated by another user' using errcode = '40001'; end if;
      update public.assets set
        zone_id = nullif(target.old_state ->> 'zone_id', '')::uuid,
        slot_id = nullif(target.old_state ->> 'slot_id', '')::uuid,
        x_position = nullif(target.old_state ->> 'x_position', '')::numeric,
        y_position = nullif(target.old_state ->> 'y_position', '')::numeric,
        orientation_degrees = (target.old_state ->> 'orientation_degrees')::integer,
        destination = target.old_state ->> 'destination',
        truck_status = (target.old_state ->> 'truck_status')::public.truck_status,
        status_changed_at = nullif(target.old_state ->> 'status_changed_at', '')::timestamptz,
        departure_cleanup_at = nullif(target.old_state ->> 'departure_cleanup_at', '')::timestamptz,
        is_active = true,
        removed_at = null,
        version = version + 1,
        updated_by = auth.uid()
      where id = current_asset.id returning * into restored_asset;
    end if;

    undo_event_id := public.record_asset_event(
      target.warehouse_id, target.asset_id, target.event_type,
      to_jsonb(current_asset), to_jsonb(restored_asset), true, target.id
    );
  end if;

  update public.asset_events set reversed_at = now(), reversed_by = auth.uid() where id = target.id;
  return jsonb_build_object('undone_event_id', target.id, 'undo_event_id', undo_event_id, 'event_type', target.event_type);
exception
  when unique_violation then
    raise exception 'UNDO_UNAVAILABLE: the original slot or connection is now occupied';
end;
$$;

create or replace function public.save_board_configuration(
  p_warehouse_id uuid,
  p_name text,
  p_description text default null
)
returns public.configurations
language plpgsql
security definer
set search_path = public
as $$
declare result public.configurations;
begin
  if not public.has_warehouse_role(p_warehouse_id, 'MANAGER') then raise exception 'Manager access required' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Configuration name is required'; end if;

  insert into public.configurations (warehouse_id, name, description, created_by)
  values (p_warehouse_id, trim(p_name), nullif(trim(p_description), ''), auth.uid())
  returning * into result;

  insert into public.configuration_assets (configuration_id, source_asset_id, asset_snapshot)
  select result.id, asset.id, to_jsonb(asset)
  from public.assets asset
  where asset.warehouse_id = p_warehouse_id and asset.is_active;

  insert into public.configuration_connections (configuration_id, connection_snapshot)
  select result.id, to_jsonb(connection)
  from public.asset_connections connection
  where connection.warehouse_id = p_warehouse_id and connection.is_active;
  return result;
end;
$$;

create or replace function public.load_board_configuration(p_configuration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_config public.configurations;
  snapshot jsonb;
  previous_state jsonb;
  restored_state jsonb;
  restored_assets integer := 0;
  restored_connections integer := 0;
begin
  select * into selected_config from public.configurations
  where id = p_configuration_id and archived_at is null for update;
  if selected_config.id is null then raise exception 'Active configuration not found'; end if;
  if not public.has_warehouse_role(selected_config.warehouse_id, 'MANAGER') then raise exception 'Manager access required' using errcode = '42501'; end if;

  perform 1 from public.assets where warehouse_id = selected_config.warehouse_id for update;
  select jsonb_build_object(
    'assets', coalesce(jsonb_agg(to_jsonb(asset) order by asset.id), '[]'::jsonb),
    'connections', (
      select coalesce(jsonb_agg(to_jsonb(connection) order by connection.id), '[]'::jsonb)
      from public.asset_connections connection
      where connection.warehouse_id = selected_config.warehouse_id and connection.is_active
    ),
    'captured_at', now()
  ) into previous_state
  from public.assets asset
  where asset.warehouse_id = selected_config.warehouse_id and asset.is_active;

  update public.asset_connections set is_active = false, disconnected_at = now(), version = version + 1
  where warehouse_id = selected_config.warehouse_id and is_active;
  update public.assets set is_active = false, removed_at = now(), version = version + 1, updated_by = auth.uid()
  where warehouse_id = selected_config.warehouse_id and is_active;

  for snapshot in select asset_snapshot from public.configuration_assets where configuration_id = selected_config.id order by id
  loop
    insert into public.assets (
      id, warehouse_id, asset_category, uld_type, external_identifier, destination,
      truck_type, truck_status, status_changed_at, departure_cleanup_at,
      zone_id, slot_id, x_position, y_position, orientation_degrees,
      is_active, removed_at, version, created_by, updated_by
    ) values (
      (snapshot ->> 'id')::uuid,
      selected_config.warehouse_id,
      (snapshot ->> 'asset_category')::public.asset_category,
      nullif(snapshot ->> 'uld_type', '')::public.uld_type,
      snapshot ->> 'external_identifier', snapshot ->> 'destination',
      nullif(snapshot ->> 'truck_type', '')::public.truck_type,
      (snapshot ->> 'truck_status')::public.truck_status,
      nullif(snapshot ->> 'status_changed_at', '')::timestamptz,
      nullif(snapshot ->> 'departure_cleanup_at', '')::timestamptz,
      nullif(snapshot ->> 'zone_id', '')::uuid,
      nullif(snapshot ->> 'slot_id', '')::uuid,
      nullif(snapshot ->> 'x_position', '')::numeric,
      nullif(snapshot ->> 'y_position', '')::numeric,
      (snapshot ->> 'orientation_degrees')::integer,
      true, null, greatest((snapshot ->> 'version')::integer, 1),
      nullif(snapshot ->> 'created_by', '')::uuid, auth.uid()
    )
    on conflict (id) do update set
      warehouse_id = excluded.warehouse_id,
      asset_category = excluded.asset_category,
      uld_type = excluded.uld_type,
      external_identifier = excluded.external_identifier,
      destination = excluded.destination,
      truck_type = excluded.truck_type,
      truck_status = excluded.truck_status,
      status_changed_at = excluded.status_changed_at,
      departure_cleanup_at = excluded.departure_cleanup_at,
      zone_id = excluded.zone_id,
      slot_id = excluded.slot_id,
      x_position = excluded.x_position,
      y_position = excluded.y_position,
      orientation_degrees = excluded.orientation_degrees,
      is_active = true,
      removed_at = null,
      version = public.assets.version + 1,
      updated_by = auth.uid();
    restored_assets := restored_assets + 1;
  end loop;

  for snapshot in select connection_snapshot from public.configuration_connections where configuration_id = selected_config.id order by id
  loop
    insert into public.asset_connections (
      id, warehouse_id, parent_asset_id, child_asset_id, connection_type,
      connected_by, connected_at, disconnected_at, is_active, version
    ) values (
      (snapshot ->> 'id')::uuid, selected_config.warehouse_id,
      (snapshot ->> 'parent_asset_id')::uuid, (snapshot ->> 'child_asset_id')::uuid,
      (snapshot ->> 'connection_type')::public.connection_type,
      auth.uid(), now(), null, true, greatest((snapshot ->> 'version')::integer, 1)
    )
    on conflict (id) do update set
      warehouse_id = excluded.warehouse_id,
      parent_asset_id = excluded.parent_asset_id,
      child_asset_id = excluded.child_asset_id,
      connection_type = excluded.connection_type,
      connected_by = auth.uid(),
      connected_at = now(),
      disconnected_at = null,
      is_active = true,
      version = public.asset_connections.version + 1;
    restored_connections := restored_connections + 1;
  end loop;

  select jsonb_build_object(
    'configuration_id', selected_config.id,
    'configuration_name', selected_config.name,
    'assets', coalesce(jsonb_agg(to_jsonb(asset) order by asset.id), '[]'::jsonb),
    'connections', (
      select coalesce(jsonb_agg(to_jsonb(connection) order by connection.id), '[]'::jsonb)
      from public.asset_connections connection
      where connection.warehouse_id = selected_config.warehouse_id and connection.is_active
    ),
    'restored_assets', restored_assets,
    'restored_connections', restored_connections
  ) into restored_state
  from public.assets asset
  where asset.warehouse_id = selected_config.warehouse_id and asset.is_active;

  perform public.record_asset_event(
    selected_config.warehouse_id, null, 'CONFIGURATION_LOADED', previous_state, restored_state
  );

  return jsonb_build_object(
    'configuration_id', selected_config.id,
    'restored_assets', restored_assets,
    'restored_connections', restored_connections
  );
end;
$$;

revoke all on function public.update_uld_destination(uuid, integer, text) from public;
revoke all on function public.connect_tug_to_uld(uuid, integer, uuid, integer) from public;
revoke all on function public.disconnect_tow(uuid, integer) from public;
revoke all on function public.undo_last_action(uuid) from public;
revoke all on function public.save_board_configuration(uuid, text, text) from public;
revoke all on function public.load_board_configuration(uuid) from public;
grant execute on function public.update_uld_destination(uuid, integer, text) to authenticated;
grant execute on function public.connect_tug_to_uld(uuid, integer, uuid, integer) to authenticated;
grant execute on function public.disconnect_tow(uuid, integer) to authenticated;
grant execute on function public.undo_last_action(uuid) to authenticated;
grant execute on function public.save_board_configuration(uuid, text, text) to authenticated;
grant execute on function public.load_board_configuration(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['asset_events', 'configurations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
