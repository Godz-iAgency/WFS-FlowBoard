-- Explicit Data API privileges for authenticated FlowBoard users.
-- RLS remains the authorization boundary; direct asset mutations continue to use audited RPCs.

grant usage on schema public to authenticated;

revoke all privileges on table
  public.profiles,
  public.warehouses,
  public.warehouse_memberships,
  public.zones,
  public.slots,
  public.assets,
  public.asset_connections,
  public.uld_load_items,
  public.asset_events,
  public.configurations,
  public.configuration_assets,
  public.configuration_connections,
  public.app_settings,
  public.live_assets
from anon;

grant select on table
  public.profiles,
  public.warehouses,
  public.warehouse_memberships,
  public.zones,
  public.slots,
  public.assets,
  public.asset_connections,
  public.uld_load_items,
  public.asset_events,
  public.configurations,
  public.configuration_assets,
  public.configuration_connections,
  public.app_settings,
  public.live_assets
to authenticated;

-- These direct changes are still constrained by their ADMIN/self-only RLS policies.
grant update on table public.profiles to authenticated;
grant insert, update, delete on table
  public.warehouse_memberships,
  public.zones,
  public.slots,
  public.app_settings
to authenticated;

comment on view public.live_assets is
  'Authenticated, RLS-filtered live asset projection. Mutation is restricted to audited RPCs.';
