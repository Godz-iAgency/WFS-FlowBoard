begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_column('public', 'asset_events', 'user_display_name', 'audit events preserve the actor display name');
select has_column('public', 'asset_events', 'reverses_event_id', 'audit events link an undo to the original event');
select has_function('public', 'undo_last_action', array['uuid'], 'authoritative Undo RPC exists');
select has_function('public', 'save_board_configuration', array['uuid', 'text', 'text'], 'Save Board RPC exists');
select has_function('public', 'load_board_configuration', array['uuid'], 'transactional configuration load RPC exists');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'flowboard-manager@example.test', '', now(), '{}'::jsonb,
  '{"display_name":"Flowboard Manager"}'::jsonb, now(), now()
);

insert into public.warehouse_memberships (warehouse_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'MANAGER');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

insert into public.assets (id, warehouse_id, asset_category, uld_type, external_identifier, zone_id, slot_id)
values (
  '90000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000001',
  'ULD', 'AKE', 'UNDO-TEST',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0002-000000000001'
);

select lives_ok(
  $$select public.move_asset(
    '90000000-0000-0000-0000-000000000010', 1,
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0002-000000000002'
  )$$,
  'an operator move is recorded through authoritative logic'
);

select lives_ok(
  $$select public.undo_last_action('10000000-0000-0000-0000-000000000001')$$,
  'Undo safely restores the latest reversible action'
);

select is(
  (select slot_id from public.assets where id = '90000000-0000-0000-0000-000000000010'),
  '30000000-0000-0000-0002-000000000001'::uuid,
  'Undo restores the prior slot'
);

select is(
  (select count(*)::integer from public.asset_events where asset_id = '90000000-0000-0000-0000-000000000010' and reversed_at is not null),
  1,
  'the original audit event is marked as reversed'
);

select lives_ok(
  $$select public.save_board_configuration(
    '10000000-0000-0000-0000-000000000001',
    'pgTAP configuration',
    'transactional restore test'
  )$$,
  'a manager can save the current board state'
);

select lives_ok(
  $$select public.move_asset(
    '90000000-0000-0000-0000-000000000010', 3,
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0002-000000000002'
  )$$,
  'the board can change after a configuration is saved'
);

select lives_ok(
  $$select public.load_board_configuration(
    (select id from public.configurations where name = 'pgTAP configuration' order by created_at desc limit 1)
  )$$,
  'the saved configuration restores transactionally'
);

select is(
  (select slot_id from public.assets where id = '90000000-0000-0000-0000-000000000010'),
  '30000000-0000-0000-0002-000000000001'::uuid,
  'configuration load restores the saved slot'
);

select is(
  (select count(*)::integer from public.asset_events where event_type = 'CONFIGURATION_LOADED' and user_id = '90000000-0000-0000-0000-000000000001'),
  1,
  'configuration load records an attributed audit event'
);

select * from finish();
rollback;
