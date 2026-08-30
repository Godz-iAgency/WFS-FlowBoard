# WFS FlowBoard setup

## Supabase project

1. Create a Supabase project and note its Project URL and publishable key (or legacy anon key).
2. In Authentication, configure the Site URL and allowed redirect URLs:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://YOUR_DOMAIN/auth/callback`
3. For production, disable open public sign-up unless WFS explicitly chooses self-registration. Create operational users through the approved administrative process.
4. Apply the migrations in `supabase/migrations` with the Supabase CLI.
5. The migrations add `zones`, `slots`, `assets`, `asset_connections`, `app_settings`, `asset_events`, and `configurations` to `supabase_realtime` and enable RLS on every application table.

## Initial administrator

Create the first user in Supabase Authentication. Then run this once in the SQL editor, replacing the user UUID:

```sql
insert into public.warehouse_memberships (warehouse_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000001',
  '<AUTH_USER_UUID>',
  'ADMIN'
);
```

An Admin can subsequently manage membership records. Users without a warehouse membership authenticate successfully but cannot read warehouse data. Operators can perform audited board actions; Managers and Admins can also save and load board configurations.

## Departure cleanup schedule

Enable Supabase Cron for the project and schedule this SQL every minute:

```sql
select public.cleanup_departed_trucks();
```

The function soft-removes expired departing trucks and stores a `DEPARTED` event. The live view also hides an expired truck before the next scheduled cleanup, but the schedule is required to release its dock authoritatively.

## Environment

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_WAREHOUSE_CODE=WFS-01
```

These are public browser credentials protected by RLS. Do not add a service-role key to any `NEXT_PUBLIC_*` variable.

Set the same variables in Vercel for Preview and Production. Use separate Supabase projects for local/development, staging, and production environments.

## Commands

```bash
npm install
npx supabase start
npx supabase db reset
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npx supabase test db
npm run build
```

Hosted migration workflow after `npx supabase login`:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```
