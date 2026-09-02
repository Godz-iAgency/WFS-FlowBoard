import type { SlotRow } from "@/types/database";
import type { ZoneWithSlots } from "@/types/warehouse";

export const PRESENTATION_BOARD_WIDTH = 2000;
export const PRESENTATION_BOARD_HEIGHT = 900;
export const PRESENTATION_FLOOR_LEFT = 16;
export const PRESENTATION_FLOOR_RIGHT = 1984;

const LOGICAL_FLOOR_LEFT = 280;
const LOGICAL_FLOOR_RIGHT = 1528;
const HORIZONTAL_PROJECTION = (PRESENTATION_FLOOR_RIGHT - PRESENTATION_FLOOR_LEFT) / (LOGICAL_FLOOR_RIGHT - LOGICAL_FLOOR_LEFT);

export function logicalToPresentationX(logicalX: number): number {
  return PRESENTATION_FLOOR_LEFT + (logicalX - LOGICAL_FLOOR_LEFT) * HORIZONTAL_PROJECTION;
}

export function presentationToLogicalX(presentationX: number): number {
  return LOGICAL_FLOOR_LEFT + (presentationX - PRESENTATION_FLOOR_LEFT) / HORIZONTAL_PROJECTION;
}

export function logicalWidthToPresentation(logicalWidth: number): number {
  return logicalWidth * HORIZONTAL_PROJECTION;
}

export function projectSlot(slot: SlotRow): SlotRow {
  return { ...slot, x: logicalToPresentationX(slot.x) };
}

export function projectZone(zone: ZoneWithSlots): ZoneWithSlots {
  const projectedLeft = logicalToPresentationX(zone.x);
  const projectedRight = logicalToPresentationX(zone.x + zone.width);
  return {
    ...zone,
    x: projectedLeft,
    width: projectedRight - projectedLeft,
    slots: zone.slots.map(projectSlot),
  };
}
