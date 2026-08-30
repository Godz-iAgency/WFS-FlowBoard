# MASTER PROMPT FOR CODEX
# WFS FlowBoard - Production Build

You are building the production application, not a prototype, demo, sandbox, mockup, or proof of concept.

Read every file in `/docs` before writing code.

Required source files:
- `/docs/MASTER_PROMPT.md`
- `/docs/warehouse_operations_spec.md`
- `/supabase/supabase_warehouse_schema.sql`
- `/public/reference/warehouse-floor-plan.png`

The warehouse floor-plan image is the approved visual source of truth.
Do not redesign, rename, rearrange, remove, or invent warehouse areas unless explicitly instructed.

## Product

Build a production-ready touch-first Progressive Web App for live warehouse operations.

Primary devices:
- Large landscape touchscreen in the operations manager's office
- Samsung A10 tablet in landscape

Secondary devices:
- Other tablets
- Laptop
- Desktop

Primary input:
- Finger touch

Secondary input:
- Mouse

## Required stack

Frontend:
- Next.js
- React
- TypeScript
- React Konva for the interactive warehouse board

Backend:
- Supabase PostgreSQL
- Supabase Auth
- Supabase Realtime
- Supabase Row Level Security

Hosting:
- Vercel

AI later:
- Gemini API through secure server-side code only

## Production principles

1. Supabase is part of the architecture from the beginning.
2. Do not create temporary mock architecture that will later need to be replaced.
3. Use database migrations and typed database access.
4. Never expose Supabase service-role credentials in the browser.
5. Never expose Gemini credentials in the browser.
6. Enable and enforce Row Level Security.
7. Use soft deletion for operational assets.
8. Maintain audit/event history.
9. Design for multiple simultaneous users.
10. Handle stale updates and concurrent edits safely.
11. Use optimistic UI only when followed by authoritative server/database reconciliation.
12. Realtime updates must update connected clients.
13. Validate operational rules in both frontend and database.
14. Build responsive layouts for large touchscreen, Samsung A10 tablet, other tablets, laptops, and desktops.
15. Use touch-safe controls and Pointer Events.
16. No hover-only interaction.
17. No right-click dependency.
18. No hard-coded production secrets.
19. Add error handling, loading states, reconnect states, and user-readable failures.
20. Add test coverage for critical operational rules.
21. Keep code modular and maintainable.
22. Do not invent operational behavior.

## Project structure

Use a production-oriented structure such as:

- `/app`
- `/components`
- `/components/warehouse`
- `/lib`
- `/lib/supabase`
- `/lib/warehouse`
- `/types`
- `/docs`
- `/public/assets`
- `/public/reference`
- `/supabase`
- `/supabase/migrations`
- `/tests`

## First implementation goal

Build the real production foundation, not a disposable Phase 1.

Implement:

1. Next.js + TypeScript application.
2. PWA foundation and manifest.
3. Responsive shell for touchscreen/tablet/laptop/desktop.
4. Supabase client setup.
5. Supabase server client setup.
6. Authentication foundation.
7. Database schema/migrations from the supplied SQL.
8. Typed models for warehouse, zones, slots, assets, connections, truck status, configurations, and events.
9. Realtime subscription architecture.
10. Static warehouse layout matching the approved image.
11. Elements panel.
12. Real coded zones for:
   - Lane 2
   - Lane 3
   - Lane 4
   - Lane 5
   - Mixed Area
   - DD06-DD15
   - All Mail
   - Inventory
   - MOD Table
   - Control Office
   - Runners Area
   - entrances/exits
13. Create lane slot data in Supabase.
14. Create dock zones in Supabase.
15. Build the visual board from real zone/slot records.
16. Implement production-safe loading/error states.

Do not implement Gemini until the warehouse data model and live board are stable.

## Operational constraints

ULD:
- Types: AAX, LAY, DQF, AKE
- Represents ULD already on dolly
- Valid zones: Lane 2, Lane 3, Lane 4, Lane 5, Mixed Area
- Main lanes: exactly 5 ULD slots each
- Mixed Area: exactly 2 ULD slots
- Orientation: NORTH or SOUTH only
- 0 degrees = NORTH
- 180 degrees = SOUTH

Truck:
- Types: BOX_TRUCK, TRACTOR_TRAILER
- Valid zones: DD06-DD15 only
- Loading = green
- Unloading = green
- Complete = orange
- Departing = blue
- Departure countdown default = 120 seconds, configurable
- After countdown, truck becomes inactive/removed from live board

Tug:
- Free-positioned within allowed warehouse movement area
- May connect to ULD only
- Proximity connection shows green pre-connect state
- Tug and connected ULD move together

## Database requirements

The database is authoritative.

Frontend must not be the only place enforcing:
- ULD valid zones
- Truck valid zones
- slot occupancy
- ULD NORTH/SOUTH orientation
- Tug-to-ULD connection type
- truck status transitions
- soft deletion
- event/audit history

Use transactions or RPC/database functions when multiple writes must remain consistent.

## Concurrency

Design for more than one controller using the board.

Every mutable asset should carry an `updated_at` and version value.

When saving a move:
- detect stale version
- reject or reconcile conflicting updates
- refresh authoritative state

Do not silently overwrite a newer user's change.

## Realtime

Subscribe to production tables required by the live board.

Handle:
- insert
- update
- soft removal
- connection changes
- truck status changes

On reconnect:
- re-fetch current authoritative board state.

## Quality requirements

Add tests for:
- ULD cannot be placed in Dock
- Truck cannot be placed in Lane/Mixed
- Only one active asset per slot
- ULD direction only 0 or 180
- Tug can connect only to ULD
- Departure countdown state
- Soft removal
- configuration restore integrity

## Codex operating rule

Do not invent operational behavior.

If a rule is missing, unclear, or contradictory:
1. stop that implementation area
2. report the ambiguity
3. continue only with clearly defined work

At completion of each meaningful build increment, report:
- files created/changed
- database migrations added
- tests added
- assumptions
- unresolved issues
- exact run/setup commands
- any required Supabase configuration
