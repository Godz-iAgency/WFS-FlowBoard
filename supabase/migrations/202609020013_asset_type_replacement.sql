-- Replace a ULD or truck type in place while keeping its location and operational details.
create or replace function public.replace_asset_type(
  p_asset_id uuid,
  p_expected_version integer,
  p_uld_type public.uld_type default null,
  p_truck_type public.truck_type default null
)
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

  if original.asset_category = 'ULD' then
    if p_uld_type is null or p_truck_type is not null then raise exception 'Choose one valid ULD replacement type'; end if;
    if original.uld_type = p_uld_type then raise exception '% is already the current ULD type', p_uld_type; end if;
    if exists (select 1 from public.asset_connections where child_asset_id = original.id and is_active) then
      raise exception 'Disconnect the tug before replacing this ULD';
    end if;
    update public.assets set
      uld_type = p_uld_type,
      truck_type = null,
      version = version + 1,
      updated_by = auth.uid()
    where id = original.id returning * into result;
  elsif original.asset_category = 'TRUCK' then
    if p_truck_type is null or p_uld_type is not null then raise exception 'Choose one valid truck replacement type'; end if;
    if original.truck_type = p_truck_type then raise exception '% is already the current truck type', replace(p_truck_type::text, '_', ' '); end if;
    update public.assets set
      truck_type = p_truck_type,
      uld_type = null,
      version = version + 1,
      updated_by = auth.uid()
    where id = original.id returning * into result;
  else
    raise exception 'Only ULDs and trucks can be replaced';
  end if;

  perform public.record_asset_event(result.warehouse_id, result.id, 'ASSET_TYPE_CHANGED', to_jsonb(original), to_jsonb(result));
  return result;
end;
$$;

revoke all on function public.replace_asset_type(uuid, integer, public.uld_type, public.truck_type) from public, anon;
grant execute on function public.replace_asset_type(uuid, integer, public.uld_type, public.truck_type) to authenticated;

comment on function public.replace_asset_type(uuid, integer, public.uld_type, public.truck_type) is
  'Updates a live ULD or truck type in place with authorization, optimistic concurrency, and audit history.';

-- Keep the existing Undo behavior and make type replacements reversible.
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
    and event_type in ('MOVED', 'ROTATED', 'ASSET_TYPE_CHANGED', 'DESTINATION_CHANGED', 'CONNECTED', 'DISCONNECTED', 'TRUCK_STATUS_CHANGED', 'REMOVED')
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
    elsif target.event_type = 'ASSET_TYPE_CHANGED' then
      if current_asset.uld_type is distinct from nullif(target.new_state ->> 'uld_type', '')::public.uld_type
        or current_asset.truck_type is distinct from nullif(target.new_state ->> 'truck_type', '')::public.truck_type
      then raise exception 'STALE_VERSION: asset was updated by another user' using errcode = '40001'; end if;
      update public.assets set
        uld_type = nullif(target.old_state ->> 'uld_type', '')::public.uld_type,
        truck_type = nullif(target.old_state ->> 'truck_type', '')::public.truck_type,
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
