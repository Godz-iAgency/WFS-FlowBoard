# WFS FlowBoard
# Production Product and Technical Specification

## 1. Product Definition

WFS FlowBoard is a production-grade touch-first warehouse operations Progressive Web App.

It digitizes the physical warehouse operations board while preserving the spatial mental model already used by controllers and management.

It is not a prototype.

It is designed for live operational use.

Primary devices:
- Large landscape touchscreen
- Samsung A10 tablet in landscape

Secondary devices:
- Other tablets
- Laptop
- Desktop

## 2. Three-Layer Architecture

### Layer 1: Static warehouse
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
- entrances
- exits
- travel paths
- warehouse boundaries

### Layer 2: Movable operational assets
- ULD AAX
- ULD LAY
- ULD DQF
- ULD AKE
- Tug
- Box Truck
- Tractor Trailer
- Aircraft later
- Carts later

### Layer 3: Operational logic
- valid drop rules
- invalid drop rules
- snap positions
- ULD direction
- tug-to-ULD connections
- destination
- truck dock status
- departure countdown
- soft removal
- saved configurations
- realtime synchronization
- event history
- future Gemini assistant

## 3. PWA and Device Requirements

The app must be installable as a PWA.

Required:
- manifest
- installable home-screen experience
- responsive landscape layout
- tablet-safe touch controls
- large touchscreen support
- mouse support
- reconnect handling
- graceful offline/error state messaging

Primary interaction:
- touch
- drag
- drop
- tap
- long press where useful

Do not depend on:
- hover
- right-click
- tiny controls
- precision cursor placement

Use Pointer Events.

Minimum touch target:
- 44x44 px

Preferred operational control:
- 56x56 px or larger

Recommended logical board:
- 1600 x 900

Scale the logical board to the device.

## 4. Static Warehouse Zones

### ULD lanes

Lane 2:
- 5 slots

Lane 3:
- 5 slots

Lane 4:
- 5 slots

Lane 5:
- 5 slots

Mixed Area:
- 2 slots

### Docks

- DD06
- DD07
- DD08
- DD09
- DD10
- DD11
- DD12
- DD13
- DD14
- DD15

### Other static areas

- All Mail
- Inventory
- MOD Table
- Control Office
- Runners Area
- entrances/exits
- travel corridors

## 5. ULD Rules

ULD types:
- AAX
- LAY
- DQF
- AKE

A ULD in this application always represents:
ULD + Dolly

There is no separate dolly asset in Version 1.

ULD attributes:
- id
- warehouse_id
- ULD type
- external identifier
- destination
- zone
- slot
- direction
- active status
- version
- created_at
- updated_at
- created_by
- updated_by

Valid ULD zones:
- Lane 2
- Lane 3
- Lane 4
- Lane 5
- Mixed Area

Invalid ULD zones:
- DD06-DD15
- Control Office
- Runners Area
- Inventory
- All Mail
- static walls

ULD direction:
- NORTH only
- SOUTH only

Mapping:
- 0 = NORTH
- 180 = SOUTH

East and West are invalid.

Connection pin:
- NORTH: pin at top/north end
- SOUTH: pin at bottom/south end

Each main lane has exactly five explicit slot records.
Mixed Area has exactly two explicit slot records.

When dragging a ULD:
1. calculate nearest valid available slot
2. highlight valid slot green before release
3. reject occupied/invalid slots
4. snap to valid slot on release
5. persist move to Supabase
6. record asset event
7. publish/reconcile realtime change

ULD tap actions:
- Details
- Destination
- Change Direction
- Remove
- Cancel

## 6. Tug Rules

Tug is free-positioned inside allowed movement space.

Tug is not slot-based.

Tug fields:
- id
- x/y logical coordinates
- orientation
- rear connection point
- version
- active state
- timestamps

Tug can connect to:
- ULD

Tug cannot connect to:
- Truck

Proximity behavior:
- use logical canvas units
- initial recommended radius: 40

When within valid connection radius:
- Tug highlight = green
- ULD highlight = green
- connection point highlight = green

On release:
- create active TOW connection

Connected Tug + ULD:
- move as a logical group
- persist group state consistently

Disconnect:
- explicit user action
- preserve both assets
- record event

## 7. Truck Rules

Truck types:
- BOX_TRUCK
- TRACTOR_TRAILER

Valid zones:
- DD06-DD15

Invalid zones:
- all ULD lanes
- Mixed Area
- Control Office
- Runners Area
- Inventory
- All Mail

Dock behavior:
- available dock highlights green
- occupied dock rejects another active truck
- truck snaps to dock position

## 8. Truck Operational Status

Dock indicator reflects current truck status.

LOADING:
- green
- truck remains docked

UNLOADING:
- green
- truck remains docked

COMPLETE:
- orange
- work is finished
- truck remains docked

DEPARTING:
- blue
- countdown begins
- default 120 seconds
- value must be configurable
- truck remains visible during countdown
- when countdown expires, truck is soft-removed from live board

Truck menu:
- Loading
- Unloading
- Complete
- Depart
- Remove
- Cancel

Depart:
1. set status DEPARTING
2. set status_changed_at
3. set departure_cleanup_at
4. show countdown
5. indicator blue
6. after expiration, is_active=false
7. removed_at set
8. event recorded
9. dock becomes available

Manual Remove:
- available
- confirmation required
- soft delete only

## 9. Supabase From Day One

Supabase is part of the first production architecture.

Use:
- PostgreSQL
- Auth
- RLS
- Realtime
- migrations
- RPC/functions where multi-write consistency is needed

The database is authoritative.

Frontend should never be the sole enforcement layer.

Required database-enforced rules:
- ULD only in LANE/MIXED
- Truck only in DOCK
- one active asset per slot
- ULD direction only 0 or 180
- TOW connection only TUG -> ULD
- soft deletion
- truck departure timestamps
- audit/event storage

## 10. Concurrency and Multi-User Safety

Multiple controllers may interact with the live board.

Every asset requires:
- updated_at
- version integer

Update strategy:
- client sends current version
- database updates only if version still matches
- successful update increments version
- stale write is rejected
- client reloads authoritative asset

Do not silently overwrite newer state.

Realtime subscriptions:
- assets
- connections
- truck status changes
- relevant configuration updates

On reconnect:
- re-fetch complete current board state

## 11. Event History

Record:
- CREATED
- MOVED
- ROTATED
- DESTINATION_CHANGED
- CONNECTED
- DISCONNECTED
- TRUCK_STATUS_CHANGED
- DEPARTED
- REMOVED
- CONFIGURATION_LOADED

Store:
- warehouse
- asset
- event type
- old state JSON
- new state JSON
- user
- timestamp

Do not remove audit history when an asset leaves the live board.

## 12. Saved Configurations

Save complete warehouse board state.

Include:
- active assets
- asset types
- locations
- slots
- x/y for free assets
- destinations
- ULD direction
- active connections
- truck dock assignments
- truck statuses

Loading a configuration must be transactional or otherwise protected against partial restore.

Future:
- Template
- Snapshot

## 13. Authentication and Authorization

Production foundation should include Supabase Auth.

Initial role model:
- OPERATOR
- MANAGER
- ADMIN

Recommended access:
OPERATOR:
- view board
- move assets
- update destinations
- change truck status
- connect/disconnect tug
- save operational state as allowed

MANAGER:
- operator permissions
- configurations
- broader history

ADMIN:
- layout/configuration management
- user/role management

Implement RLS around warehouse membership/role rather than open authenticated access for production.

## 14. Gemini Assistant

Add only after live warehouse data is stable.

Purpose:
Allow controller or MOD to ask:
- What ULDs are in Lane 3?
- What is at DD10?
- Which trucks are loading?
- Which docks are complete?
- What destination is AKE-123?
- Which ULD contains packages for a destination?

Architecture:
1. user asks question
2. secure server route receives it
3. query Supabase
4. provide relevant structured results to Gemini
5. Gemini formats/explains response

Supabase is the source of truth.

Gemini must never invent warehouse data.

Never expose GEMINI_API_KEY to browser.

## 15. Production Quality

Required:
- TypeScript strict mode
- clean typed domain models
- reusable warehouse components
- error boundaries
- loading states
- realtime reconnect state
- clear failed-action messages
- database validation
- frontend validation
- tests for critical rules
- environment variable validation
- structured logging where useful
- no service-role key in client code
- no Gemini key in client code
- no production secrets committed

## 16. Tests

At minimum test:

1. ULD cannot be assigned to Dock.
2. Truck cannot be assigned to Lane/Mixed.
3. One active asset per slot.
4. ULD orientation only 0 or 180.
5. Tug TOW connection only to ULD.
6. Truck status transitions.
7. departure cleanup.
8. soft deletion.
9. stale version update rejection.
10. saved configuration restore consistency.

## 17. Build Order

Production foundation:
1. Next.js/TypeScript
2. PWA setup
3. Supabase project integration
4. Auth
5. migrations/schema
6. RLS
7. typed database access
8. responsive warehouse shell
9. real zone/slot records
10. static warehouse rendering

Then:
11. ULD drag/drop
12. truck drag/drop
13. tug movement
14. destination/direction actions
15. tug connection
16. truck statuses
17. save/load configurations
18. realtime hardening
19. audit/history UI
20. Gemini assistant

The app remains production-oriented at every step.
