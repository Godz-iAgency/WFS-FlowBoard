# Production architecture

## Runtime boundaries

- Next.js Server Components validate the Supabase session and load the initial authoritative board.
- The browser uses only the public Supabase URL and publishable/anon key. No service-role credential exists in browser or application code.
- PostgreSQL owns placement validation, occupancy constraints, orientation validation, soft removal, optimistic version checks, authoritative Undo, configuration snapshots/restores, event creation, and departure cleanup.
- Realtime subscriptions notify the browser, which then re-fetches a complete authoritative snapshot. This avoids treating event payloads as the final state.
- Warehouse membership and `OPERATOR`, `MANAGER`, or `ADMIN` role checks are enforced by RLS and audited RPCs.

## Board coordinate system

The approved floor-plan image is preserved at `public/reference/warehouse-floor-plan.png`. The migration in `supabase/migrations/202608300003_wfs_layout.sql` traces it into a 1600 × 900 logical coordinate system. React Konva scales that coordinate system to the available landscape viewport.

## Mutation policy

Direct asset and connection writes are not exposed through RLS. Operational mutations use database functions so version checks, validation, state changes, and attributed audit events remain in a single transaction. A stale version raises a serialization-style error and the UI re-fetches before the operator retries.

Undo locks the actor's latest unreversed, reversible event and verifies the current row version before restoring its prior state. Configuration loading locks the warehouse state, validates snapshots through the same database constraints, replaces live assets and connections transactionally, and records the before/after arrangement in `asset_events`.

## Live board derivations

Lane occupancy, dock occupancy/colors, truck totals, search results, destinations, and connection lines are calculated from the latest authoritative snapshot. Realtime messages are invalidation signals—not a second source of truth—and trigger a complete refetch. The static warehouse geometry is non-interactive in the normal operational interface.

## Offline behavior

The service worker caches only the application shell and same-origin static resources. Live operational data is never treated as safely writable offline. If connectivity drops, the last synchronized board is shown with a visible offline state; writes should remain disabled until authoritative reconciliation succeeds.
