-- Production placement support for ULDs, trucks, and unconnected tugs.
-- The database remains authoritative for zone validity, occupancy, audit history, and stale writes.

create or replace function public.validate_asset_location()
returns trigger
language plpgsql
set search_path = public
as $$
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
  elsif new.asset_category = 'TUG' and selected_zone.zone_type <> 'FREE_MOVEMENT' then
    raise exception 'TUG assets may only be placed in the FREE_MOVEMENT zone';
  elsif new.asset_category = 'TUG' and new.slot_id is not null then
    raise exception 'TUG assets are free-positioned and cannot use slots';
  elsif new.asset_category = 'TUG' and (new.x_position is null or new.y_position is null) then
    raise exception 'A placed TUG requires x and y coordinates';
  elsif new.asset_category = 'TUG' and (
    new.x_position < selected_zone.x
    or new.x_position > selected_zone.x + selected_zone.width
    or new.y_position < selected_zone.y
    or new.y_position > selected_zone.y + selected_zone.height
  ) then
    raise exception 'TUG coordinates must remain inside the FREE_MOVEMENT zone';
  end if;

  if new.slot_id is not null then
    select * into selected_slot from public.slots where id = new.slot_id and is_active;
    if not found or selected_slot.zone_id <> new.zone_id then raise exception 'Slot does not belong to the selected active zone'; end if;
  end if;
  return new;
end;
$$;

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
  if p_asset_category not in ('ULD', 'TRUCK', 'TUG') then
    raise exception 'Asset creation for this category is not enabled';
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

  perform public.record_asset_event(result.warehouse_id, result.id, 'CREATED', null, to_jsonb(result));
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
  if original.asset_category not in ('ULD', 'TRUCK', 'TUG') then
    raise exception 'Movement for this asset category is not enabled';
  end if;
  if original.asset_category = 'ULD' and exists (
    select 1 from public.asset_connections where child_asset_id = original.id and is_active
  ) then
    raise exception 'Disconnect the tug before moving this ULD independently';
  end if;
  if original.asset_category = 'TUG' and exists (
    select 1 from public.asset_connections where parent_asset_id = original.id and is_active
  ) then
    raise exception 'Disconnect the ULD before moving this tug independently';
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

revoke all on function public.create_asset(uuid, public.asset_category, public.uld_type, public.truck_type, text, text, uuid, uuid, numeric, numeric, integer) from public;
revoke all on function public.move_asset(uuid, integer, uuid, uuid, numeric, numeric, integer) from public;
grant execute on function public.create_asset(uuid, public.asset_category, public.uld_type, public.truck_type, text, text, uuid, uuid, numeric, numeric, integer) to authenticated;
grant execute on function public.move_asset(uuid, integer, uuid, uuid, numeric, numeric, integer) to authenticated;

comment on function public.create_asset(uuid, public.asset_category, public.uld_type, public.truck_type, text, text, uuid, uuid, numeric, numeric, integer) is
  'Creates audited ULDs, trucks, and free-positioned tugs after membership and database placement validation.';
