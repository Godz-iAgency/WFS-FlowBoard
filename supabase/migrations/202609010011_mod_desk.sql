-- The Manager on Duty sits at a desk, so use the operationally correct label.
update public.zones
set code = 'MOD_DESK', name = 'MOD Desk'
where warehouse_id = '10000000-0000-0000-0000-000000000001'
  and id = '20000000-0000-0000-0000-000000000203';
