-- Align the lower warehouse sections on one clear edge below DD15.
-- Slot coordinates remain unchanged; only the Mixed Area boundary is realigned.
update public.zones
set y = 760, height = 110
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'INVENTORY';

update public.zones
set y = 760, height = 100
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'MIXED';

update public.zones
set y = 760, height = 58
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and code = 'MOD_TABLE';
