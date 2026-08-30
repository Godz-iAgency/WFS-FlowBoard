# WFS FlowBoard

Production foundation for the WFS warehouse operations board. The application is a touch-first Next.js PWA backed by Supabase Auth, PostgreSQL, Realtime, and warehouse-scoped Row Level Security.

## Local setup

1. Install Node.js 20.9 or newer and the Supabase CLI prerequisites.
2. Copy `.env.example` to `.env.local` and provide the public Supabase project URL and publishable/anon key.
3. Install dependencies with `npm install`.
4. Start local Supabase with `npx supabase start`.
5. Apply migrations with `npx supabase db reset`.
6. Start the app with `npm run dev`.

See `docs/SETUP.md` for hosted Supabase and initial administrator setup.
