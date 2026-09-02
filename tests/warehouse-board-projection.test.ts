import { describe, expect, it } from "vitest";
import {
  logicalToPresentationX,
  logicalWidthToPresentation,
  PRESENTATION_FLOOR_LEFT,
  PRESENTATION_FLOOR_RIGHT,
  presentationToLogicalX,
  projectZone,
} from "@/lib/warehouse/board-projection";
import type { ZoneWithSlots } from "@/types/warehouse";

const timestamp = "2026-09-01T12:00:00.000Z";

describe("wide landscape board projection", () => {
  it("expands the warehouse bounds and round-trips database coordinates", () => {
    expect(logicalToPresentationX(280)).toBe(PRESENTATION_FLOOR_LEFT);
    expect(logicalToPresentationX(1528)).toBe(PRESENTATION_FLOOR_RIGHT);
    expect(logicalWidthToPresentation(1248)).toBeCloseTo(PRESENTATION_FLOOR_RIGHT - PRESENTATION_FLOOR_LEFT, 8);
    expect(presentationToLogicalX(logicalToPresentationX(920))).toBeCloseTo(920, 8);
  });

  it("projects zone and slot geometry without changing their database identities", () => {
    const zone: ZoneWithSlots = {
      id: "lane-2", warehouse_id: "warehouse", code: "LANE_2", name: "Lane 2", zone_type: "LANE",
      capacity: 1, x: 520, y: 145, width: 100, height: 405, is_active: true, created_at: timestamp, updated_at: timestamp,
      slots: [{ id: "lane-2-slot-1", zone_id: "lane-2", slot_number: 1, x: 570, y: 185, default_orientation_degrees: 0, is_active: true, created_at: timestamp, updated_at: timestamp }],
    };
    const projected = projectZone(zone);
    expect(projected.id).toBe(zone.id);
    expect(projected.slots[0].id).toBe(zone.slots[0].id);
    expect(projected.x).toBeLessThan(logicalToPresentationX(zone.x + zone.width));
    expect(projected.slots[0].x).toBeCloseTo(logicalToPresentationX(570), 8);
    expect(projected.y).toBe(145);
  });
});
