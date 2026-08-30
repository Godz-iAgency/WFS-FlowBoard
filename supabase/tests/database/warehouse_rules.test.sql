begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

insert into public.assets (id, warehouse_id, asset_category, x_position, y_position)
values ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TUG', 700, 600);
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
