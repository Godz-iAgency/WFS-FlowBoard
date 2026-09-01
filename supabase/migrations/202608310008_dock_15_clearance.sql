-- Preserve the approved lower-right floor-plan geometry and the clear DD15 approach.
-- Existing projects receive these coordinates through this forward-only migration.
update public.zones
set x = 850, y = 700, width = 70, height = 58
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'MOD_TABLE';

update public.zones
set x = 920, y = 760, width = 135, height = 110
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'CONTROL_OFFICE';

update public.zones
set x = 1055, y = 760, width = 290, height = 95
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'RUNNERS_AREA';
