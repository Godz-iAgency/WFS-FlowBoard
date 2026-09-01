-- Swap the lower-left areas, rename Inventory to Problem Solve, and keep every
-- lower warehouse section aligned beneath the DD15 approach.
update public.zones
set x = 300, y = 760, width = 250, height = 100
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'MIXED';

update public.slots
set x = case slot_number when 1 then 365 when 2 then 485 else x end,
    y = 795
where zone_id = '20000000-0000-0000-0000-000000000010';

update public.zones
set code = 'PROBLEM_SOLVE', name = 'Problem Solve', x = 570, y = 760, width = 250, height = 110
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and id = '20000000-0000-0000-0000-000000000202';

update public.zones
set x = 850, y = 760, width = 70, height = 58
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'MOD_TABLE';

-- Connecting is an explicit audited action. The transaction locks both assets,
-- validates their live versions, creates the tow, and snaps the tug hitch to the
-- ULD tow ring in the same commit.
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
declare
  tug public.assets;
  uld public.assets;
  uld_zone public.zones;
  uld_slot public.slots;
  movement_zone public.zones;
  result public.asset_connections;
  snapped_y numeric;
begin
  select * into tug from public.assets where id = p_tug_id and is_active for update;
  select * into uld from public.assets where id = p_uld_id and is_active for update;
  if tug.id is null or uld.id is null then raise exception 'Active tug and ULD are required'; end if;
  if tug.asset_category <> 'TUG' or uld.asset_category <> 'ULD' then raise exception 'TOW connections must be TUG -> ULD'; end if;
  if tug.warehouse_id <> uld.warehouse_id then raise exception 'Connected assets must share a warehouse'; end if;
  if not public.has_warehouse_role(tug.warehouse_id, 'OPERATOR') then raise exception 'Warehouse access denied' using errcode = '42501'; end if;
  if tug.version <> p_tug_expected_version or uld.version <> p_uld_expected_version then raise exception 'STALE_VERSION: a connected asset changed' using errcode = '40001'; end if;

  select * into uld_zone from public.zones where id = uld.zone_id;
  select * into uld_slot from public.slots where id = uld.slot_id;
  select * into movement_zone from public.zones where warehouse_id = tug.warehouse_id and code = 'WAREHOUSE_MOVEMENT' and is_active;
  if uld_zone.zone_type <> 'LANE' or uld_slot.id is null then
    raise exception 'Tug connection currently requires a ULD in a lane position';
  end if;
  if movement_zone.id is null then raise exception 'Warehouse movement area is not configured'; end if;

  snapped_y := uld_slot.y + case when uld.orientation_degrees = 180 then 70 else -70 end;
  if uld_slot.x < movement_zone.x or uld_slot.x > movement_zone.x + movement_zone.width
     or snapped_y < movement_zone.y or snapped_y > movement_zone.y + movement_zone.height then
    raise exception 'The ULD tow ring is outside the approved tug movement area';
  end if;

  update public.assets
  set zone_id = movement_zone.id,
      slot_id = null,
      x_position = uld_slot.x,
      y_position = snapped_y,
      orientation_degrees = uld.orientation_degrees,
      version = version + 1,
      updated_by = auth.uid()
  where id = tug.id
  returning * into tug;

  insert into public.asset_connections (warehouse_id, parent_asset_id, child_asset_id, connected_by)
  values (tug.warehouse_id, tug.id, uld.id, auth.uid()) returning * into result;
  perform public.record_asset_event(
    tug.warehouse_id, uld.id, 'CONNECTED', null,
    to_jsonb(result) || jsonb_build_object(
      'external_identifier', uld.external_identifier,
      'uld_type', uld.uld_type,
      'tug_x_position', tug.x_position,
      'tug_y_position', tug.y_position,
      'tug_orientation_degrees', tug.orientation_degrees
    )
  );
  return result;
end;
$$;
