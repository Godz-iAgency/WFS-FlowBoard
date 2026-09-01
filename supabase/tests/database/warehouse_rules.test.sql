begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select ok(
  has_table_privilege('authenticated', 'public.warehouses', 'SELECT'),
  'authenticated users can read warehouses through the Data API'
);

select ok(
  has_table_privilege('authenticated', 'public.live_assets', 'SELECT'),
  'authenticated users can read the live asset projection'
);

select ok(
  not has_table_privilege('authenticated', 'public.assets', 'INSERT'),
  'authenticated users cannot bypass audited asset mutation RPCs'
);

select ok(
  not has_table_privilege('anon', 'public.warehouses', 'SELECT'),
  'anonymous users cannot read warehouse data'
);

select is(
  (select count(*)::integer from public.slots slot join public.zones zone on zone.id = slot.zone_id where zone.code in ('LANE_2','LANE_3','LANE_4','LANE_5')),
  20,
  'four main lanes contain exactly five explicit slots each'
);
select is(
  (select count(*)::integer from public.slots slot join public.zones zone on zone.id = slot.zone_id where zone.code = 'MIXED'),
  2,
  'Mixed Area contains exactly two explicit slots'
);

select ok(
  (
    select lower_right.y - (dock_15.y + dock_15.height) >= 15
    from public.zones dock_15
    cross join lateral (
      select min(y) as y
      from public.zones
      where warehouse_id = dock_15.warehouse_id
        and code in ('CONTROL_OFFICE', 'RUNNERS_AREA')
    ) lower_right
    where dock_15.code = 'DD15'
  ),
  'Dock 15 retains a visible clearance gap above the lower-right structures'
);

select ok(
  (
    select mod_desk.x + mod_desk.width <= dock_15.x
    from public.zones mod_desk
    join public.zones dock_15 on dock_15.warehouse_id = mod_desk.warehouse_id
    where mod_desk.code = 'MOD_DESK' and dock_15.code = 'DD15'
  ),
  'MOD Desk remains left of the Dock 15 approach'
);

select ok(
  (
    select runners.x + runners.width < dock_15.x + dock_15.width + 16
    from public.zones runners
    join public.zones dock_15 on dock_15.warehouse_id = runners.warehouse_id
    where runners.code = 'RUNNERS_AREA' and dock_15.code = 'DD15'
  ),
  'Runners Area remains left of the Dock 15 truck target'
);

select is(
  (
    select count(distinct y)::integer
    from public.zones
    where warehouse_id = '10000000-0000-0000-0000-000000000001'
      and code in ('PROBLEM_SOLVE', 'MIXED', 'MOD_DESK', 'CONTROL_OFFICE', 'RUNNERS_AREA')
  ),
  1,
  'all lower warehouse sections share one aligned top edge'
);

select is(
  (select code from public.zones where id = '20000000-0000-0000-0000-000000000202'),
  'PROBLEM_SOLVE',
  'the former Inventory area is now the Problem Solve area'
);

select ok(
  (
    select bool_and(slot.x - 39 >= zone.x and slot.x + 39 <= zone.x + zone.width and slot.y - 30 >= zone.y and slot.y + 30 <= zone.y + zone.height)
    from public.slots slot
    join public.zones zone on zone.id = slot.zone_id
    where zone.code = 'MIXED'
  ),
  'both Mixed Area ULD images remain fully inside the dashed boundary'
);

select throws_like(
  $$insert into public.assets (warehouse_id, asset_category, uld_type, zone_id, slot_id) values (
    '10000000-0000-0000-0000-000000000001', 'ULD', 'AAX',
    '20000000-0000-0000-0000-000000000106', null
  )$$,
  '%ULD assets may only be placed in LANE or MIXED zones%',
  'database rejects a ULD in a dock'
);

select throws_like(
  $$insert into public.assets (warehouse_id, asset_category, truck_type, zone_id) values (
    '10000000-0000-0000-0000-000000000001', 'TRUCK', 'BOX_TRUCK',
    '20000000-0000-0000-0000-000000000002'
  )$$,
  '%TRUCK assets may only be placed in DOCK zones%',
  'database rejects a truck in a lane'
);

select throws_like(
  $$insert into public.assets (warehouse_id, asset_category, zone_id, x_position, y_position) values (
    '10000000-0000-0000-0000-000000000001', 'TUG',
    '20000000-0000-0000-0000-000000000002', 570, 349
  )$$,
  '%TUG assets may only be placed in the FREE_MOVEMENT zone%',
  'database rejects a tug in a ULD lane'
);

select lives_ok(
  $$insert into public.assets (warehouse_id, asset_category, zone_id, x_position, y_position) values (
    '10000000-0000-0000-0000-000000000001', 'TUG',
    '20000000-0000-0000-0000-000000000208', 700, 600
  )$$,
  'database accepts a free-positioned tug inside the movement zone'
);

select throws_like(
  $$insert into public.assets (warehouse_id, asset_category, uld_type, orientation_degrees) values (
    '10000000-0000-0000-0000-000000000001', 'ULD', 'LAY', 90
  )$$,
  '%assets_uld_orientation%',
  'database rejects east/west ULD orientation'
);

insert into public.assets (id, warehouse_id, asset_category, uld_type, zone_id, slot_id)
values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ULD', 'AAX',
  '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0002-000000000001');

select throws_like(
  $$insert into public.assets (warehouse_id, asset_category, uld_type, zone_id, slot_id) values (
    '10000000-0000-0000-0000-000000000001', 'ULD', 'DQF',
    '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0002-000000000001'
  )$$,
  '%duplicate key value violates unique constraint "one_active_asset_per_slot"%',
  'database permits only one active asset per slot'
);

insert into public.assets (id, warehouse_id, asset_category, zone_id, x_position, y_position)
values (
  '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TUG',
  '20000000-0000-0000-0000-000000000208', 700, 600
);
insert into public.assets (id, warehouse_id, asset_category, truck_type, zone_id)
values ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'TRUCK', 'TRACTOR_TRAILER', '20000000-0000-0000-0000-000000000106');

select lives_ok(
  $$insert into public.asset_connections (warehouse_id, parent_asset_id, child_asset_id) values (
    '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'
  )$$,
  'database accepts TUG to ULD TOW connections'
);

select throws_like(
  $$insert into public.asset_connections (warehouse_id, parent_asset_id, child_asset_id) values (
    '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001'
  )$$,
  '%TOW connections must be TUG -> ULD%',
  'database rejects non-TUG parents in TOW connections'
);

select is(
  (select (value #>> '{}')::integer from public.app_settings where warehouse_id = '10000000-0000-0000-0000-000000000001' and key = 'departure_cleanup_seconds'),
  120,
  'departure cleanup defaults to 120 seconds'
);

update public.assets
set truck_status = 'DEPARTING', status_changed_at = now() - interval '3 minutes', departure_cleanup_at = now() - interval '1 minute'
where id = '40000000-0000-0000-0000-000000000003';

select lives_ok(
  $$select public.cleanup_departed_trucks()$$,
  'departure cleanup runs successfully'
);

select is(
  (select is_active from public.assets where id = '40000000-0000-0000-0000-000000000003'),
  false,
  'departure cleanup soft-removes the expired truck'
);

select is(
  (select count(*)::integer from public.asset_events where asset_id = '40000000-0000-0000-0000-000000000003' and event_type = 'DEPARTED'),
  1,
  'departure cleanup records a DEPARTED audit event'
);

select * from finish();
rollback;
