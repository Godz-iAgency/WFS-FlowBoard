-- Active tugs must always have an authoritative free-movement location.
alter table public.assets
  drop constraint if exists assets_active_tug_location;

alter table public.assets
  add constraint assets_active_tug_location
  check (not (is_active and asset_category = 'TUG' and zone_id is null));

comment on constraint assets_active_tug_location on public.assets is
  'Prevents active tugs from existing outside the authoritative warehouse movement zone.';
