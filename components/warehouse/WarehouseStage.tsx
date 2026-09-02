"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Arrow, Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import {
  dockIndicatorColor, findNearestAvailableDock, findNearestAvailableSlot, getDockTruck,
  getZoneOccupancy, isPointInsideZone,
} from "@/lib/warehouse/selectors";
import type { AssetRow, SlotRow, TruckType, UldType } from "@/types/database";
import {
  LOGICAL_BOARD_HEIGHT, LOGICAL_BOARD_WIDTH, type BoardHighlight, type BoardSnapshot,
  type PlacementTool, type ZoneWithSlots,
} from "@/types/warehouse";

const NAVY = "#082e60";
const LIGHT_NAVY = "#5675a0";
const GOLD = "#f4b719";
const AVAILABLE = "#2da568";
const OCCUPIED = "#8e9ba7";
const SEARCH = "#19a5ff";
const PLAN_IMAGE = "/reference/warehouse-floor-plan.png";
const TUG_IMAGE = "/assets/wfs-cargo-tug-v2.png";

type AssetPosition = { x: number; y: number };
type Crop = { x: number; y: number; width: number; height: number };

const ULD_CROPS: Record<UldType, Crop> = {
  AAX: { x: 49, y: 462, width: 76, height: 64 },
  LAY: { x: 139, y: 462, width: 76, height: 64 },
  DQF: { x: 49, y: 554, width: 76, height: 64 },
  AKE: { x: 139, y: 554, width: 76, height: 64 },
};

const REFERENCE_CROPS = {
  compass: { x: 1587, y: 0, width: 43, height: 58 },
  boxTruck: { x: 61, y: 286, width: 142, height: 62 },
  trailer: { x: 37, y: 214, width: 236, height: 70 },
  office: { x: 982, y: 847, width: 89, height: 49 },
} satisfies Record<string, Crop>;

function useImageAsset(source: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const loadedImage = new window.Image();
    loadedImage.decoding = "async";
    loadedImage.src = source;
    loadedImage.onload = () => setImage(loadedImage);
    return () => { loadedImage.onload = null; };
  }, [source]);
  return image;
}

function setPointerCursor(event: KonvaEventObject<MouseEvent | DragEvent>, cursor: "pointer" | "grab" | "grabbing" | "default") {
  const stage = event.target.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

function ReferenceSprite({ image, crop, x, y, width, height, opacity = 1 }: {
  image: HTMLImageElement | null;
  crop: Crop;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  if (!image) return <Rect x={x} y={y} width={width} height={height} fill="#e7ebee" stroke="#6d7982" cornerRadius={4} />;
  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      cropX={crop.x}
      cropY={crop.y}
      cropWidth={crop.width}
      cropHeight={crop.height}
      opacity={opacity}
    />
  );
}

function SlotMarker({ slot, state, onChoose }: {
  slot: SlotRow;
  state: "empty" | "available" | "occupied" | "candidate";
  onChoose: () => void;
}) {
  const styles = {
    empty: { stroke: "#9aabb9", fill: "rgba(255,255,255,.08)", opacity: 0.34, width: 1, dash: [5, 6] },
    available: { stroke: AVAILABLE, fill: "rgba(57,169,107,.16)", opacity: 0.96, width: 2, dash: [6, 4] },
    occupied: { stroke: OCCUPIED, fill: "rgba(134,146,158,.06)", opacity: 0.28, width: 1, dash: [3, 6] },
    candidate: { stroke: AVAILABLE, fill: "rgba(57,169,107,.34)", opacity: 1, width: 4, dash: [] },
  }[state];
  return (
    <Rect
      x={slot.x - 39}
      y={slot.y - 30}
      width={78}
      height={60}
      cornerRadius={6}
      stroke={styles.stroke}
      fill={styles.fill}
      opacity={styles.opacity}
      strokeWidth={styles.width}
      dash={styles.dash}
      shadowColor={state === "candidate" ? AVAILABLE : undefined}
      shadowBlur={state === "candidate" ? 12 : 0}
      onMouseEnter={(event) => setPointerCursor(event, "pointer")}
      onMouseLeave={(event) => setPointerCursor(event, "default")}
      onClick={(event) => { event.cancelBubble = true; onChoose(); }}
      onTap={(event) => { event.cancelBubble = true; onChoose(); }}
    />
  );
}

function zoneSlotState(slot: SlotRow, occupiedSlotIds: Set<string>, highlighting: boolean, candidateSlotId: string | null) {
  if (candidateSlotId === slot.id) return "candidate" as const;
  if (occupiedSlotIds.has(slot.id)) return "occupied" as const;
  return highlighting ? "available" as const : "empty" as const;
}

function LaneZone({ zone, assets, occupiedSlotIds, highlightingSlots, candidateSlotId, highlighted, pulse, onChooseSlot }: {
  zone: ZoneWithSlots;
  assets: AssetRow[];
  occupiedSlotIds: Set<string>;
  highlightingSlots: boolean;
  candidateSlotId: string | null;
  highlighted: boolean;
  pulse: boolean;
  onChooseSlot: (zone: ZoneWithSlots, slot: SlotRow) => void;
}) {
  const occupancy = getZoneOccupancy(zone, assets);
  return (
    <Group>
      <Rect listening={false} x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="#dfe9d8" opacity={0.84} stroke={highlighted ? SEARCH : "#c2d0bf"} strokeWidth={highlighted ? 5 : 1} shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      <Line listening={false} points={[zone.x + 5, zone.y, zone.x + 5, zone.y + zone.height]} stroke={GOLD} strokeWidth={5} shadowColor="#8b6a00" shadowBlur={2} />
      <Line listening={false} points={[zone.x + zone.width - 5, zone.y, zone.x + zone.width - 5, zone.y + zone.height]} stroke={GOLD} strokeWidth={5} shadowColor="#8b6a00" shadowBlur={2} />
      {zone.slots.map((slot, index) => (
        <Group key={slot.id}>
          <SlotMarker slot={slot} state={zoneSlotState(slot, occupiedSlotIds, highlightingSlots, candidateSlotId)} onChoose={() => onChooseSlot(zone, slot)} />
          {index < zone.slots.length - 1 ? <Arrow listening={false} points={[slot.x, slot.y + 35, slot.x, slot.y + 45]} stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerLength={4} pointerWidth={4} strokeWidth={1.5} /> : null}
        </Group>
      ))}
      <Rect listening={false} x={zone.x + 17} y={zone.y + zone.height + 8} width={zone.width - 34} height={29} fill={NAVY} cornerRadius={5} shadowColor="#1e3550" shadowBlur={4} shadowOpacity={0.25} />
      <Text listening={false} x={zone.x + 17} y={zone.y + zone.height + 13} width={zone.width - 34} text={zone.name.toUpperCase()} fill="white" fontSize={16} fontStyle="bold" align="center" />
      <Text listening={false} x={zone.x} y={zone.y + zone.height + 41} width={zone.width} text={`(${occupancy.occupied} / ${occupancy.capacity} ULD)`} fill={NAVY} fontSize={12} fontStyle="bold" align="center" />
    </Group>
  );
}

function MixedZone({ zone, assets, occupiedSlotIds, highlightingSlots, candidateSlotId, highlighted, pulse, onChooseSlot }: {
  zone: ZoneWithSlots;
  assets: AssetRow[];
  occupiedSlotIds: Set<string>;
  highlightingSlots: boolean;
  candidateSlotId: string | null;
  highlighted: boolean;
  pulse: boolean;
  onChooseSlot: (zone: ZoneWithSlots, slot: SlotRow) => void;
}) {
  const occupancy = getZoneOccupancy(zone, assets);
  return (
    <Group>
      <Rect listening={false} x={zone.x} y={zone.y} width={zone.width} height={zone.height} cornerRadius={8} stroke={highlighted ? SEARCH : NAVY} strokeWidth={highlighted ? 5 : 2} dash={[10, 8]} fill="rgba(255,255,255,.42)" shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      {zone.slots.map((slot) => <SlotMarker key={slot.id} slot={slot} state={zoneSlotState(slot, occupiedSlotIds, highlightingSlots, candidateSlotId)} onChoose={() => onChooseSlot(zone, slot)} />)}
      <Text listening={false} x={zone.x} y={zone.y + zone.height - 30} width={zone.width} text="MIXED AREA" fill={NAVY} fontSize={17} fontStyle="bold" align="center" />
      <Text listening={false} x={zone.x} y={zone.y + zone.height - 12} width={zone.width} text={`(${occupancy.occupied} / ${occupancy.capacity} ULD)`} fill={NAVY} fontSize={10} fontStyle="bold" align="center" />
    </Group>
  );
}

function DockZone({ zone, truck, candidate, highlighting, highlighted, pulse, onChoose }: {
  zone: ZoneWithSlots;
  truck?: AssetRow;
  candidate: boolean;
  highlighting: boolean;
  highlighted: boolean;
  pulse: boolean;
  onChoose: () => void;
}) {
  const indicator = dockIndicatorColor(truck);
  const targetStroke = candidate ? AVAILABLE : highlighting && !truck ? AVAILABLE : truck ? "#c0cad3" : "#9fadb9";
  return (
    <Group onMouseEnter={(event) => { if (!truck) setPointerCursor(event, "pointer"); }} onMouseLeave={(event) => setPointerCursor(event, "default")} onClick={(event) => { event.cancelBubble = true; if (!truck) onChoose(); }} onTap={(event) => { event.cancelBubble = true; if (!truck) onChoose(); }}>
      <Rect x={zone.x} y={zone.y} width={286} height={zone.height} stroke={highlighted ? SEARCH : "#c2ccd5"} strokeWidth={highlighted ? 5 : 1} fill="rgba(255,255,255,.30)" shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      <Rect x={zone.x + 12} y={zone.y + 14} width={58} height={30} fill={NAVY} cornerRadius={4} />
      <Text listening={false} x={zone.x + 12} y={zone.y + 20} width={58} text={zone.code.replace("DD", "DD ")} fill="white" fontSize={15} fontStyle="bold" align="center" />
      <Rect listening={false} x={zone.x + zone.width - 8} y={zone.y + 5} width={14} height={zone.height - 10} fill={GOLD} stroke="#8a6a00" strokeWidth={1} cornerRadius={2} shadowColor="#927000" shadowBlur={2} />
      <Rect listening={false} x={zone.x + zone.width + 7} y={zone.y + 10} width={6} height={zone.height - 20} fill={indicator} cornerRadius={2} />
      <Rect
        x={zone.x + zone.width + 16}
        y={zone.y + 5}
        width={162}
        height={zone.height - 10}
        stroke={targetStroke}
        strokeWidth={candidate ? 4 : highlighting && !truck ? 2 : 1}
        dash={truck ? [] : [7, 5]}
        fill={candidate ? "rgba(45,165,104,.22)" : truck ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.20)"}
        cornerRadius={5}
        shadowColor={candidate ? AVAILABLE : undefined}
        shadowBlur={candidate ? 13 : 0}
      />
    </Group>
  );
}

function CompassRose({ image }: { image: HTMLImageElement | null }) {
  if (image) {
    return (
      <Group x={12} y={8} listening={false}>
        <Rect x={0} y={0} width={48} height={62} fill={NAVY} cornerRadius={5} />
        <ReferenceSprite image={image} crop={REFERENCE_CROPS.compass} x={6} y={3} width={36} height={54} />
      </Group>
    );
  }
  return (
    <Group x={15} y={14} listening={false}>
      <Text x={0} y={0} width={34} text="N" fill={NAVY} fontSize={16} fontStyle="bold" align="center" />
      <Line points={[17, 20, 30, 53, 17, 45]} closed fill={NAVY} stroke={NAVY} strokeWidth={2} lineJoin="round" />
      <Line points={[17, 20, 4, 53, 17, 45]} closed fill="#ffffff" stroke={NAVY} strokeWidth={2} lineJoin="round" />
      <Line points={[17, 20, 17, 47]} stroke={NAVY} strokeWidth={1.5} />
    </Group>
  );
}

function StaticZone({ zone, image }: { zone: ZoneWithSlots; image: HTMLImageElement | null }) {
  const isExit = zone.code.startsWith("EXIT");
  if (isExit) {
    const wallY = zone.code === "EXIT_NORTH" ? 64 : 880;
    return (
      <Group listening={false}>
        <Line points={[zone.x + 7, wallY, zone.x + zone.width - 7, wallY]} stroke="#f8fafc" strokeWidth={9} />
        <Text x={zone.x} y={zone.y + 8} width={zone.width} text="EXIT »" fill="#d71920" fontSize={25} fontStyle="bold" align="center" />
      </Group>
    );
  }
  if (zone.code === "ALL_MAIL") {
    const sectionLeft = zone.x - 20;
    const sectionRight = zone.x + zone.width;
    const sectionTop = zone.y - 40;
    const sectionBottom = zone.y + zone.height + 60;
    const doorwayInset = 30;
    return (
      <Group listening={false}>
        <Rect x={sectionLeft + 3} y={sectionTop} width={sectionRight - sectionLeft - 5} height={sectionBottom - sectionTop} fillLinearGradientStartPoint={{ x: sectionLeft, y: sectionTop }} fillLinearGradientEndPoint={{ x: sectionRight, y: sectionBottom }} fillLinearGradientColorStops={[0, "#dceafb", 0.52, "#f8fafc", 1, "#dfe9f2"]} opacity={0.82} />
        <Line points={[sectionLeft, sectionTop, sectionRight - doorwayInset, sectionTop]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight - doorwayInset, sectionTop, sectionRight - doorwayInset, sectionTop + 42]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight - doorwayInset, sectionTop + 42, sectionRight, sectionTop + 42]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight, sectionTop + 42, sectionRight, sectionBottom - 42]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight, sectionBottom - 42, sectionRight - doorwayInset, sectionBottom - 42]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight - doorwayInset, sectionBottom - 42, sectionRight - doorwayInset, sectionBottom]} stroke="#203649" strokeWidth={4} />
        <Line points={[sectionRight - doorwayInset, sectionBottom, sectionLeft, sectionBottom]} stroke="#203649" strokeWidth={4} />
        <Group x={zone.x + zone.width / 2 - 25} y={zone.y + 132}>
          <Rect x={0} y={0} width={50} height={34} fill="rgba(255,255,255,.82)" stroke={NAVY} strokeWidth={2} cornerRadius={3} />
          <Line points={[1, 2, 25, 20, 49, 2]} stroke={NAVY} strokeWidth={2} lineJoin="round" />
          <Line points={[1, 32, 18, 17]} stroke={NAVY} strokeWidth={1.5} />
          <Line points={[49, 32, 32, 17]} stroke={NAVY} strokeWidth={1.5} />
        </Group>
        <Text x={sectionLeft + 8} y={zone.y + 178} width={sectionRight - sectionLeft - 16} text="ALL MAIL" fill="#151515" fontSize={18} fontStyle="bold" align="center" />
      </Group>
    );
  }
  if (zone.code === "PROBLEM_SOLVE" || zone.code === "INVENTORY") {
    return (
      <Group listening={false}>
        <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(222,232,241,.78)" stroke="#263c50" strokeWidth={3} />
        <Text x={zone.x + 4} y={zone.y + 17} width={zone.width - 8} text="PROBLEM SOLVE" fill={NAVY} fontSize={17} fontStyle="bold" align="center" />
        <Circle x={zone.x + zone.width / 2} y={zone.y + 67} radius={24} fill="#f8fbfe" stroke={LIGHT_NAVY} strokeWidth={3} />
        <Text x={zone.x + zone.width / 2 - 18} y={zone.y + 49} width={36} text="?" fill={NAVY} fontSize={31} fontStyle="bold" align="center" />
      </Group>
    );
  }
  if (zone.code === "CONTROL_OFFICE") {
    return (
      <Group listening={false}>
        <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(222,232,241,.78)" stroke="#263c50" strokeWidth={3} />
        <Text x={zone.x + 4} y={zone.y + 14} width={zone.width - 8} text={"CONTROL\nOFFICE"} fill={NAVY} fontSize={17} lineHeight={1.05} fontStyle="bold" align="center" />
        <ReferenceSprite image={image} crop={REFERENCE_CROPS.office} x={zone.x + 28} y={zone.y + 59} width={80} height={44} />
      </Group>
    );
  }
  if (zone.code === "MOD_DESK" || zone.code === "MOD_TABLE") {
    return (
      <Group listening={false}>
        <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(255,255,255,.46)" stroke={NAVY} strokeWidth={2} cornerRadius={3} />
        <Text
          x={zone.x + 2}
          y={zone.y + 5}
          width={zone.width - 4}
          height={14}
          text="MOD DESK"
          fill={NAVY}
          fontSize={10}
          fontStyle="bold"
          align="center"
          wrap="none"
        />
        <Rect x={zone.x + 13} y={zone.y + 25} width={zone.width - 26} height={16} fill="#d9b474" stroke={NAVY} strokeWidth={2} cornerRadius={2} />
        <Line points={[zone.x + 18, zone.y + 41, zone.x + 18, zone.y + 49]} stroke={NAVY} strokeWidth={2} />
        <Line points={[zone.x + zone.width - 18, zone.y + 41, zone.x + zone.width - 18, zone.y + 49]} stroke={NAVY} strokeWidth={2} />
        <Rect x={zone.x + zone.width / 2 - 8} y={zone.y + 43} width={16} height={9} fill="#eef4f8" stroke={NAVY} strokeWidth={1.5} cornerRadius={4} />
      </Group>
    );
  }
  if (zone.code === "RUNNERS_AREA") {
    return (
      <Group listening={false}>
        <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(218,228,237,.54)" stroke="#263c50" strokeWidth={3} />
        <Text x={zone.x + 4} y={zone.y + 17} width={zone.width - 8} text="RUNNERS AREA" fill={NAVY} fontSize={16} fontStyle="bold" align="center" />
        <Group x={zone.x + 26} y={zone.y + 43}>
          <Circle x={0} y={0} radius={6} fill={NAVY} />
          <Line points={[0, 7, 0, 25, -8, 38]} stroke={NAVY} strokeWidth={3} lineCap="round" lineJoin="round" />
          <Line points={[0, 25, 8, 38]} stroke={NAVY} strokeWidth={3} lineCap="round" />
          <Line points={[-10, 14, 0, 10, 10, 15]} stroke={NAVY} strokeWidth={3} lineCap="round" lineJoin="round" />
        </Group>
        <Arrow points={[zone.x + 56, zone.y + 64, zone.x + zone.width - 32, zone.y + 64]} pointerAtBeginning stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerWidth={9} pointerLength={9} strokeWidth={3} />
      </Group>
    );
  }
  return null;
}

function UldAsset({ asset, image, x, y, selected, highlighted, pulse, draggable, onSelect, onDragStart, onDragMove, onDragEnd }: {
  asset: AssetRow;
  image: HTMLImageElement | null;
  x: number;
  y: number;
  selected: boolean;
  highlighted: boolean;
  pulse: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const emphasized = selected || highlighted;
  const crop = ULD_CROPS[asset.uld_type ?? "AAX"];
  return (
    <Group x={x} y={y} draggable={draggable} onMouseEnter={(event) => setPointerCursor(event, draggable ? "grab" : "pointer")} onMouseLeave={(event) => setPointerCursor(event, "default")} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }} onDragStart={(event) => { setPointerCursor(event, "grabbing"); onDragStart(event); }} onDragMove={onDragMove} onDragEnd={(event) => { setPointerCursor(event, "grab"); onDragEnd(event); }}>
      {emphasized ? <Rect x={-42} y={-35} width={84} height={73} cornerRadius={9} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={highlighted ? (pulse ? 18 : 9) : 10} /> : null}
      <Group rotation={asset.orientation_degrees === 180 ? 180 : 0}>
        <ReferenceSprite image={image} crop={crop} x={-38} y={-31} width={76} height={64} />
      </Group>
      <Rect listening={false} x={-21} y={-9} width={42} height={19} fill="rgba(248,250,252,.9)" stroke="#6a7782" strokeWidth={1} cornerRadius={2} />
      <Text listening={false} x={-21} y={-6} width={42} text={asset.uld_type ?? "ULD"} fill={NAVY} fontSize={13} fontStyle="bold" align="center" />
      {asset.destination ? <Text x={-42} y={35} width={84} text={asset.destination} fill={NAVY} fontSize={10} fontStyle="bold" align="center" ellipsis wrap="none" /> : null}
    </Group>
  );
}

function TruckAsset({ asset, image, zone, selected, highlighted, pulse, draggable, onSelect, onDragStart, onDragMove, onDragEnd }: {
  asset: AssetRow;
  image: HTMLImageElement | null;
  zone: ZoneWithSlots;
  selected: boolean;
  highlighted: boolean;
  pulse: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const isBox = asset.truck_type === "BOX_TRUCK";
  const width = isBox ? 116 : 158;
  const crop = isBox ? REFERENCE_CROPS.boxTruck : REFERENCE_CROPS.trailer;
  const emphasized = selected || highlighted;
  return (
    <Group x={zone.x + zone.width + 20} y={zone.y + 7} draggable={draggable} onMouseEnter={(event) => setPointerCursor(event, draggable ? "grab" : "pointer")} onMouseLeave={(event) => setPointerCursor(event, "default")} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }} onDragStart={(event) => { setPointerCursor(event, "grabbing"); onDragStart(event); }} onDragMove={onDragMove} onDragEnd={(event) => { setPointerCursor(event, "grab"); onDragEnd(event); }}>
      {emphasized ? <Rect x={-7} y={-4} width={width + 14} height={zone.height - 6} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} cornerRadius={8} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={12} /> : null}
      <ReferenceSprite image={image} crop={crop} x={0} y={0} width={width} height={zone.height - 14} />
      {asset.external_identifier ? <Text x={4} y={zone.height - 21} width={width - 8} text={asset.external_identifier} fill={NAVY} fontSize={8} fontStyle="bold" align="center" /> : null}
    </Group>
  );
}

function TugAsset({ asset, image, selected, highlighted, pulse, draggable, onSelect, onDragStart, onDragEnd }: {
  asset: AssetRow;
  image: HTMLImageElement | null;
  selected: boolean;
  highlighted: boolean;
  pulse: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  if (asset.x_position === null || asset.y_position === null) return null;
  const emphasized = selected || highlighted;
  return (
    <Group x={asset.x_position} y={asset.y_position} draggable={draggable} onMouseEnter={(event) => setPointerCursor(event, draggable ? "grab" : "pointer")} onMouseLeave={(event) => setPointerCursor(event, "default")} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }} onDragStart={(event) => { setPointerCursor(event, "grabbing"); onDragStart(event); }} onDragEnd={(event) => { setPointerCursor(event, "grab"); onDragEnd(event); }}>
      {emphasized ? <Rect x={-36} y={-45} width={72} height={90} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} cornerRadius={8} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={12} /> : null}
      <Group rotation={asset.orientation_degrees === 180 ? 180 : 0}>
        {image ? <KonvaImage image={image} x={-34} y={-43} width={68} height={86} /> : <Rect x={-30} y={-39} width={60} height={78} fill="#f7f7f1" stroke="#45535f" cornerRadius={5} />}
      </Group>
    </Group>
  );
}

export function WarehouseStage({ snapshot, selectedAssetId, highlight, canInteract, placementTool, onSelectAsset, onMoveUld, onMoveTruck, onMoveTug, onChooseUldSlot, onChooseDock, onPlaceUld, onPlaceTruck, onPlaceTug, onMessage }: {
  snapshot: BoardSnapshot;
  selectedAssetId: string | null;
  highlight: BoardHighlight;
  canInteract: boolean;
  placementTool: PlacementTool | null;
  onSelectAsset: (assetId: string | null) => void;
  onMoveUld: (asset: AssetRow, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>;
  onMoveTruck: (asset: AssetRow, zone: ZoneWithSlots) => Promise<boolean>;
  onMoveTug: (asset: AssetRow, zone: ZoneWithSlots, position: AssetPosition) => Promise<boolean>;
  onChooseUldSlot: (zone: ZoneWithSlots, slot: SlotRow) => void;
  onChooseDock: (zone: ZoneWithSlots) => void;
  onPlaceUld: (uldType: UldType, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>;
  onPlaceTruck: (truckType: TruckType, zone: ZoneWithSlots) => Promise<boolean>;
  onPlaceTug: (zone: ZoneWithSlots, position: AssetPosition) => Promise<boolean>;
  onMessage: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const image = useImageAsset(PLAN_IMAGE);
  const tugImage = useImageAsset(TUG_IMAGE);
  const [size, setSize] = useState({ width: 1200, height: 675 });
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [draggingCategory, setDraggingCategory] = useState<AssetRow["asset_category"] | null>(null);
  const [candidateSlotId, setCandidateSlotId] = useState<string | null>(null);
  const [candidateDockId, setCandidateDockId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const frame = containerRef.current?.parentElement;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = Math.max(1, entry.contentRect.width);
      const availableHeight = Math.max(1, entry.contentRect.height);
      const fittedScale = Math.min(availableWidth / LOGICAL_BOARD_WIDTH, availableHeight / LOGICAL_BOARD_HEIGHT);
      setSize({ width: LOGICAL_BOARD_WIDTH * fittedScale, height: LOGICAL_BOARD_HEIGHT * fittedScale });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setInterval(() => setPulse((value) => !value), 550);
    return () => window.clearInterval(timer);
  }, [highlight]);

  const activeAssets = useMemo(() => snapshot.assets.filter((asset) => asset.is_active), [snapshot.assets]);
  const positionZones = useMemo(() => snapshot.zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED"), [snapshot.zones]);
  const dockZones = useMemo(() => snapshot.zones.filter((zone) => zone.zone_type === "DOCK"), [snapshot.zones]);
  const movementZone = useMemo(() => snapshot.zones.find((zone) => zone.zone_type === "FREE_MOVEMENT"), [snapshot.zones]);
  const zoneById = useMemo(() => new Map(snapshot.zones.map((zone) => [zone.id, zone])), [snapshot.zones]);
  const slotById = useMemo(() => new Map(snapshot.zones.flatMap((zone) => zone.slots).map((slot) => [slot.id, slot])), [snapshot.zones]);
  const connectedAssetIds = useMemo(() => new Set(snapshot.connections.filter((connection) => connection.is_active).flatMap((connection) => [connection.parent_asset_id, connection.child_asset_id])), [snapshot.connections]);
  const occupiedSlotIds = useMemo(() => new Set(activeAssets.filter((asset) => asset.asset_category === "ULD" && asset.slot_id && asset.id !== draggingAssetId).map((asset) => asset.slot_id as string)), [activeAssets, draggingAssetId]);
  const assetPositions = useMemo(() => {
    const positions = new Map<string, AssetPosition>();
    for (const asset of activeAssets) {
      if (asset.slot_id) {
        const slot = slotById.get(asset.slot_id);
        if (slot) positions.set(asset.id, { x: slot.x, y: slot.y });
      } else if (asset.x_position !== null && asset.y_position !== null) positions.set(asset.id, { x: asset.x_position, y: asset.y_position });
    }
    return positions;
  }, [activeAssets, slotById]);
  const scale = size.width / LOGICAL_BOARD_WIDTH;
  const highlightingSlots = draggingCategory === "ULD" || placementTool?.category === "ULD";
  const highlightingDocks = draggingCategory === "TRUCK" || placementTool?.category === "TRUCK";

  function clearDragState() {
    setDraggingAssetId(null);
    setDraggingCategory(null);
    setCandidateSlotId(null);
    setCandidateDockId(null);
  }

  function updateSlotCandidate(asset: AssetRow, event: KonvaEventObject<DragEvent>) {
    const nearest = findNearestAvailableSlot({ x: event.target.x(), y: event.target.y() }, positionZones, activeAssets, asset.id);
    setCandidateSlotId(nearest?.slot.id ?? null);
    return nearest;
  }

  async function finishUldDrag(asset: AssetRow, origin: AssetPosition, event: KonvaEventObject<DragEvent>) {
    const nearest = updateSlotCandidate(asset, event);
    clearDragState();
    if (!nearest) {
      event.target.position(origin);
      onMessage("Move rejected: release the ULD over a highlighted available slot.");
      return;
    }
    event.target.position({ x: nearest.slot.x, y: nearest.slot.y });
    const saved = await onMoveUld(asset, nearest.zone, nearest.slot);
    if (!saved) event.target.position(origin);
  }

  function updateDockCandidate(asset: AssetRow, event: KonvaEventObject<DragEvent>) {
    const center = { x: event.target.x() + 82, y: event.target.y() + 24 };
    const dock = findNearestAvailableDock(center, dockZones, activeAssets, asset.id);
    setCandidateDockId(dock?.id ?? null);
    return dock;
  }

  async function finishTruckDrag(asset: AssetRow, origin: AssetPosition, event: KonvaEventObject<DragEvent>) {
    const dock = updateDockCandidate(asset, event);
    clearDragState();
    if (!dock) {
      event.target.position(origin);
      onMessage("Move rejected: release the truck over an available DD06–DD15 truck target.");
      return;
    }
    event.target.position({ x: dock.x + dock.width + 20, y: dock.y + 7 });
    const saved = await onMoveTruck(asset, dock);
    if (!saved) event.target.position(origin);
  }

  async function finishTugDrag(asset: AssetRow, origin: AssetPosition, event: KonvaEventObject<DragEvent>) {
    const position = { x: event.target.x(), y: event.target.y() };
    clearDragState();
    if (!movementZone || !isPointInsideZone(position, movementZone, 36)) {
      event.target.position(origin);
      onMessage("Move rejected: the tug must remain inside the warehouse movement area.");
      return;
    }
    const saved = await onMoveTug(asset, movementZone, position);
    if (!saved) event.target.position(origin);
  }

  function chooseSlot(zone: ZoneWithSlots, slot: SlotRow) {
    if (occupiedSlotIds.has(slot.id)) {
      onMessage("That ULD position is already occupied.");
      return;
    }
    if (placementTool?.category === "ULD") void onPlaceUld(placementTool.uldType, zone, slot);
    else onChooseUldSlot(zone, slot);
  }

  function chooseDock(zone: ZoneWithSlots) {
    if (getDockTruck(zone.id, activeAssets)) {
      onMessage(`${zone.code.replace("DD", "DD ")} is already occupied.`);
      return;
    }
    if (placementTool?.category === "TRUCK") void onPlaceTruck(placementTool.truckType, zone);
    else onChooseDock(zone);
  }

  function handleFloorPointer(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (placementTool?.category !== "TUG") {
      onSelectAsset(null);
      return;
    }
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer || !movementZone) return;
    const position = { x: pointer.x / scale, y: pointer.y / scale };
    if (!isPointInsideZone(position, movementZone, 36)) {
      onMessage("Tap or drop the tug inside the warehouse movement area.");
      return;
    }
    void onPlaceTug(movementZone, position);
  }

  return (
    <div ref={containerRef} className="stage-container" data-warehouse-stage style={{ width: size.width, height: size.height }}>
      <Stage width={size.width} height={size.height} aria-label="Interactive WFS warehouse floor plan" role="application">
        <Layer scaleX={scale} scaleY={scale}>
          <Rect width={LOGICAL_BOARD_WIDTH} height={LOGICAL_BOARD_HEIGHT} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: LOGICAL_BOARD_WIDTH, y: LOGICAL_BOARD_HEIGHT }} fillLinearGradientColorStops={[0, "#eef3f7", 0.48, "#f8fafc", 1, "#e1e8ef"]} onClick={handleFloorPointer} onTap={handleFloorPointer} />
          <Rect listening={false} x={280} y={64} width={1248} height={816} fill="rgba(248,250,252,.78)" stroke="#172d41" strokeWidth={5} shadowColor="#607386" shadowBlur={12} shadowOpacity={0.2} />
          <Line listening={false} points={[420, 110, 1210, 110]} stroke={NAVY} strokeWidth={2} dash={[14, 10]} opacity={0.78} />
          <Line listening={false} points={[450, 145, 450, 660]} stroke="#cfd8e1" strokeWidth={1} />
          {[650, 825, 1000, 1175].map((x) => <Line listening={false} key={x} points={[x, 145, x, 575]} stroke="#cfd8e1" strokeWidth={1} />)}
          {[475, 650, 825, 1000, 1175].map((x) => <Arrow listening={false} key={x} points={[x, 320, x, 340]} pointerAtBeginning stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerWidth={6} pointerLength={6} strokeWidth={1.7} opacity={0.85} />)}

          {movementZone && placementTool?.category === "TUG" ? <Rect listening={false} x={movementZone.x} y={movementZone.y} width={movementZone.width} height={movementZone.height} stroke={AVAILABLE} strokeWidth={3} dash={[12, 8]} fill="rgba(45,165,104,.05)" cornerRadius={8} /> : null}
          {snapshot.zones.filter((zone) => zone.zone_type === "STATIC").map((zone) => <StaticZone key={zone.id} zone={zone} image={image} />)}
          {snapshot.zones.filter((zone) => zone.zone_type === "LANE").map((zone) => <LaneZone key={zone.id} zone={zone} assets={activeAssets} occupiedSlotIds={occupiedSlotIds} highlightingSlots={highlightingSlots} candidateSlotId={candidateSlotId} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} onChooseSlot={chooseSlot} />)}
          {snapshot.zones.filter((zone) => zone.zone_type === "MIXED").map((zone) => <MixedZone key={zone.id} zone={zone} assets={activeAssets} occupiedSlotIds={occupiedSlotIds} highlightingSlots={highlightingSlots} candidateSlotId={candidateSlotId} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} onChooseSlot={chooseSlot} />)}
          {dockZones.map((zone) => <DockZone key={zone.id} zone={zone} truck={getDockTruck(zone.id, activeAssets)} candidate={candidateDockId === zone.id} highlighting={highlightingDocks} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} onChoose={() => chooseDock(zone)} />)}

          {snapshot.connections.filter((connection) => connection.is_active).map((connection) => {
            const parent = assetPositions.get(connection.parent_asset_id);
            const child = assetPositions.get(connection.child_asset_id);
            const childAsset = activeAssets.find((asset) => asset.id === connection.child_asset_id);
            if (!parent || !child || !childAsset) return null;
            const southFacing = childAsset.orientation_degrees === 180;
            return <Line key={connection.id} listening={false} points={[parent.x, parent.y + (southFacing ? -39 : 39), child.x, child.y + (southFacing ? 31 : -31)]} stroke={NAVY} strokeWidth={2} opacity={0.82} />;
          })}

          {activeAssets.map((asset) => {
            const highlighted = highlight?.type === "asset" && highlight.id === asset.id;
            if (asset.asset_category === "ULD" && asset.slot_id) {
              const slot = slotById.get(asset.slot_id);
              if (!slot) return null;
              const origin = { x: slot.x, y: slot.y };
              return <UldAsset key={asset.id} asset={asset} image={image} x={origin.x} y={origin.y} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} draggable={canInteract && !connectedAssetIds.has(asset.id)} onSelect={() => onSelectAsset(asset.id)} onDragStart={(event) => { event.cancelBubble = true; setDraggingAssetId(asset.id); setDraggingCategory("ULD"); updateSlotCandidate(asset, event); }} onDragMove={(event) => updateSlotCandidate(asset, event)} onDragEnd={(event) => { void finishUldDrag(asset, origin, event); }} />;
            }
            if (asset.asset_category === "TRUCK" && asset.zone_id) {
              const zone = zoneById.get(asset.zone_id);
              if (!zone) return null;
              const origin = { x: zone.x + zone.width + 20, y: zone.y + 7 };
              return <TruckAsset key={asset.id} asset={asset} image={image} zone={zone} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} draggable={canInteract} onSelect={() => onSelectAsset(asset.id)} onDragStart={(event) => { event.cancelBubble = true; setDraggingAssetId(asset.id); setDraggingCategory("TRUCK"); updateDockCandidate(asset, event); }} onDragMove={(event) => updateDockCandidate(asset, event)} onDragEnd={(event) => { void finishTruckDrag(asset, origin, event); }} />;
            }
            if (asset.asset_category === "TUG") {
              const origin = { x: asset.x_position ?? 0, y: asset.y_position ?? 0 };
              return <TugAsset key={asset.id} asset={asset} image={tugImage} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} draggable={canInteract && !connectedAssetIds.has(asset.id)} onSelect={() => onSelectAsset(asset.id)} onDragStart={(event) => { event.cancelBubble = true; setDraggingAssetId(asset.id); setDraggingCategory("TUG"); }} onDragEnd={(event) => { void finishTugDrag(asset, origin, event); }} />;
            }
            return null;
          })}

          <CompassRose image={image} />
        </Layer>
      </Stage>
    </div>
  );
}
