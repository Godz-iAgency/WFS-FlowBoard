"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { dockIndicatorColor, findNearestAvailableSlot, getDockTruck, getZoneOccupancy } from "@/lib/warehouse/selectors";
import type { AssetRow, SlotRow } from "@/types/database";
import { LOGICAL_BOARD_HEIGHT, LOGICAL_BOARD_WIDTH, type BoardHighlight, type BoardSnapshot, type ZoneWithSlots } from "@/types/warehouse";

const NAVY = "#082e60";
const LIGHT_NAVY = "#365f93";
const GOLD = "#f3b51b";
const AVAILABLE = "#39a96b";
const OCCUPIED = "#a8b2bc";
const SEARCH = "#19a5ff";

type AssetPosition = { x: number; y: number };

function SlotMarker({ slot, state }: { slot: SlotRow; state: "empty" | "available" | "occupied" | "candidate" }) {
  const styles = {
    empty: { stroke: "#91a4b5", fill: "rgba(255,255,255,.12)", opacity: 0.42, width: 1, dash: [4, 5] },
    available: { stroke: AVAILABLE, fill: "rgba(57,169,107,.13)", opacity: 0.92, width: 2, dash: [6, 4] },
    occupied: { stroke: OCCUPIED, fill: "rgba(134,146,158,.12)", opacity: 0.68, width: 1, dash: [3, 5] },
    candidate: { stroke: AVAILABLE, fill: "rgba(57,169,107,.32)", opacity: 1, width: 4, dash: [] },
  }[state];
  return <Rect x={slot.x - 36} y={slot.y - 26} width={72} height={52} cornerRadius={6} stroke={styles.stroke} fill={styles.fill} opacity={styles.opacity} strokeWidth={styles.width} dash={styles.dash} shadowColor={state === "candidate" ? AVAILABLE : undefined} shadowBlur={state === "candidate" ? 12 : 0} />;
}

function zoneSlotState(slot: SlotRow, occupiedSlotIds: Set<string>, dragging: boolean, candidateSlotId: string | null) {
  if (candidateSlotId === slot.id) return "candidate" as const;
  if (occupiedSlotIds.has(slot.id)) return "occupied" as const;
  return dragging ? "available" as const : "empty" as const;
}

function LaneZone({ zone, assets, occupiedSlotIds, dragging, candidateSlotId, highlighted, pulse }: {
  zone: ZoneWithSlots; assets: AssetRow[]; occupiedSlotIds: Set<string>; dragging: boolean; candidateSlotId: string | null; highlighted: boolean; pulse: boolean;
}) {
  const occupancy = getZoneOccupancy(zone, assets);
  return (
    <Group listening={false}>
      <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="#dce9d8" opacity={0.68} stroke={highlighted ? SEARCH : "#cad8c8"} strokeWidth={highlighted ? 5 : 1} shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      <Line points={[zone.x + 5, zone.y, zone.x + 5, zone.y + zone.height]} stroke={GOLD} strokeWidth={5} />
      <Line points={[zone.x + zone.width - 5, zone.y, zone.x + zone.width - 5, zone.y + zone.height]} stroke={GOLD} strokeWidth={5} />
      {zone.slots.map((slot, index) => (
        <Group key={slot.id}>
          <SlotMarker slot={slot} state={zoneSlotState(slot, occupiedSlotIds, dragging, candidateSlotId)} />
          {index < zone.slots.length - 1 ? <Arrow points={[slot.x, slot.y + 31, slot.x, slot.y + 54]} stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerLength={7} pointerWidth={7} strokeWidth={2} /> : null}
        </Group>
      ))}
      <Rect x={zone.x + 18} y={zone.y + zone.height + 8} width={zone.width - 36} height={29} fill={NAVY} cornerRadius={5} shadowColor="#1e3550" shadowBlur={4} shadowOpacity={0.25} />
      <Text x={zone.x + 18} y={zone.y + zone.height + 13} width={zone.width - 36} text={zone.name.toUpperCase()} fill="white" fontSize={16} fontStyle="bold" align="center" />
      <Text x={zone.x} y={zone.y + zone.height + 41} width={zone.width} text={`(${occupancy.occupied} / ${occupancy.capacity} ULD)`} fill={NAVY} fontSize={12} fontStyle="bold" align="center" />
    </Group>
  );
}

function MixedZone({ zone, assets, occupiedSlotIds, dragging, candidateSlotId, highlighted, pulse }: {
  zone: ZoneWithSlots; assets: AssetRow[]; occupiedSlotIds: Set<string>; dragging: boolean; candidateSlotId: string | null; highlighted: boolean; pulse: boolean;
}) {
  const occupancy = getZoneOccupancy(zone, assets);
  return (
    <Group listening={false}>
      <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} cornerRadius={8} stroke={highlighted ? SEARCH : NAVY} strokeWidth={highlighted ? 5 : 2} dash={[10, 8]} fill="rgba(255,255,255,.25)" shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      {zone.slots.map((slot) => <SlotMarker key={slot.id} slot={slot} state={zoneSlotState(slot, occupiedSlotIds, dragging, candidateSlotId)} />)}
      <Text x={zone.x} y={zone.y + zone.height - 34} width={zone.width} text="MIXED AREA" fill={NAVY} fontSize={18} fontStyle="bold" align="center" />
      <Text x={zone.x} y={zone.y + zone.height - 16} width={zone.width} text={`(${occupancy.occupied} / ${occupancy.capacity} ULD)`} fill={NAVY} fontSize={11} fontStyle="bold" align="center" />
    </Group>
  );
}

function DockZone({ zone, truck, highlighted, pulse }: { zone: ZoneWithSlots; truck?: AssetRow; highlighted: boolean; pulse: boolean }) {
  const indicator = dockIndicatorColor(truck);
  return (
    <Group listening={false}>
      <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} stroke={highlighted ? SEARCH : "#bcc9d7"} strokeWidth={highlighted ? 5 : 1} fill="rgba(255,255,255,.22)" shadowColor={highlighted ? SEARCH : undefined} shadowBlur={highlighted ? (pulse ? 20 : 9) : 0} />
      <Rect x={zone.x + zone.width - 11} y={zone.y + 10} width={11} height={zone.height - 20} fill={indicator} stroke="#4f5963" strokeWidth={1} cornerRadius={2} />
      <Rect x={zone.x + 15} y={zone.y + 14} width={56} height={29} fill={NAVY} cornerRadius={4} />
      <Text x={zone.x + 15} y={zone.y + 20} width={56} text={zone.code.replace("DD", "DD ")} fill="white" fontSize={15} fontStyle="bold" align="center" />
    </Group>
  );
}

function StaticZone({ zone }: { zone: ZoneWithSlots }) {
  const isExit = zone.code.startsWith("EXIT");
  const isOffice = zone.code === "CONTROL_OFFICE";
  const isInventory = zone.code === "INVENTORY";
  const isRunners = zone.code === "RUNNERS_AREA";
  if (isExit) return <Text listening={false} x={zone.x} y={zone.y + 8} width={zone.width} text="EXIT »" fill="#d71920" fontSize={25} fontStyle="bold" align="center" />;
  return (
    <Group listening={false}>
      {(isOffice || isInventory) ? <Rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(220,231,241,.75)" stroke="#263c50" strokeWidth={3} /> : null}
      {zone.code === "MOD_TABLE" ? <Rect x={zone.x + 24} y={zone.y + 31} width={40} height={22} fill="#ddc07a" stroke="#685a39" /> : null}
      <Text x={zone.x + 4} y={isRunners ? zone.y + 25 : isInventory ? zone.y + 42 : zone.y + 18} width={zone.width - 8} text={zone.name.toUpperCase()} fill={zone.code === "ALL_MAIL" ? "#151515" : NAVY} fontSize={zone.code === "ALL_MAIL" ? 18 : 16} fontStyle="bold" align="center" />
      {isRunners ? <Arrow points={[zone.x + 40, zone.y + 61, zone.x + zone.width - 40, zone.y + 61]} pointerAtBeginning stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerWidth={10} pointerLength={10} strokeWidth={3} /> : null}
    </Group>
  );
}

function UldAsset({ asset, x, y, selected, highlighted, pulse, draggable, onSelect, onDragStart, onDragMove, onDragEnd }: {
  asset: AssetRow; x: number; y: number; selected: boolean; highlighted: boolean; pulse: boolean; draggable: boolean; onSelect: () => void;
  onDragStart: (event: KonvaEventObject<DragEvent>) => void; onDragMove: (event: KonvaEventObject<DragEvent>) => void; onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const pinY = asset.orientation_degrees === 180 ? 27 : -27;
  const emphasized = selected || highlighted;
  return (
    <Group x={x} y={y} draggable={draggable} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
      {emphasized ? <Rect x={-38} y={-31} width={76} height={67} cornerRadius={9} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={highlighted ? (pulse ? 18 : 9) : 10} /> : null}
      <Rect x={-31} y={-21} width={62} height={42} fill="#cbd1d6" stroke="#4c5965" strokeWidth={2} cornerRadius={4} shadowColor="#1b2e41" shadowBlur={5} shadowOpacity={0.3} />
      <Line points={[-25, -14, -25, 14, 25, 14, 25, -14]} stroke="#87939c" strokeWidth={1} />
      <Rect x={-23} y={-11} width={46} height={22} fill="#edf1f4" stroke="#8a949d" />
      <Text x={-22} y={-5} width={44} text={asset.uld_type ?? "ULD"} fill="#111b49" fontSize={14} fontStyle="bold" align="center" />
      <Line points={[-19, 21, -14, 26, 14, 26, 19, 21]} stroke="#49535c" strokeWidth={2} />
      <Circle x={0} y={pinY} radius={4} fill="white" stroke="#27333d" strokeWidth={2} />
      {asset.destination ? <Text x={-39} y={30} width={78} text={asset.destination} fill={NAVY} fontSize={9} fontStyle="bold" align="center" ellipsis wrap="none" /> : null}
    </Group>
  );
}

function TruckAsset({ asset, zone, selected, highlighted, pulse, onSelect }: { asset: AssetRow; zone: ZoneWithSlots; selected: boolean; highlighted: boolean; pulse: boolean; onSelect: () => void }) {
  const color = dockIndicatorColor(asset);
  const emphasized = selected || highlighted;
  return (
    <Group x={zone.x + zone.width + 13} y={zone.y + 12} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }}>
      {emphasized ? <Rect x={-12} y={-7} width={190} height={52} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} cornerRadius={8} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={12} /> : null}
      <Rect width={158} height={34} fill="#e9edf0" stroke="#485865" cornerRadius={4} shadowColor="#253746" shadowBlur={4} shadowOpacity={0.25} />
      <Rect x={136} y={5} width={34} height={28} fill="#f3f5f6" stroke="#485865" cornerRadius={5} />
      <Circle x={22} y={36} radius={5} fill="#26323b" /><Circle x={128} y={36} radius={5} fill="#26323b" /><Circle x={158} y={36} radius={5} fill="#26323b" />
      <Rect x={-8} y={5} width={6} height={24} fill={color} cornerRadius={2} />
      <Text x={12} y={6} width={118} text={asset.external_identifier ?? asset.truck_type ?? "TRUCK"} fill="#27384a" fontSize={9} fontStyle="bold" align="center" />
      <Text x={12} y={19} width={118} text={asset.truck_status === "NONE" ? "AT DOCK" : asset.truck_status} fill="#27384a" fontSize={8} align="center" />
    </Group>
  );
}

function TugAsset({ asset, selected, highlighted, pulse, onSelect }: { asset: AssetRow; selected: boolean; highlighted: boolean; pulse: boolean; onSelect: () => void }) {
  if (asset.x_position === null || asset.y_position === null) return null;
  const emphasized = selected || highlighted;
  return (
    <Group x={asset.x_position} y={asset.y_position} onClick={(event) => { event.cancelBubble = true; onSelect(); }} onTap={(event) => { event.cancelBubble = true; onSelect(); }}>
      {emphasized ? <Rect x={-35} y={-24} width={70} height={52} stroke={highlighted ? SEARCH : GOLD} strokeWidth={highlighted ? (pulse ? 5 : 3) : 4} cornerRadius={8} shadowColor={highlighted ? SEARCH : GOLD} shadowBlur={12} /> : null}
      <Rect x={-28} y={-16} width={56} height={32} fill="#f0eee7" stroke="#37414a" cornerRadius={5} />
      <Circle x={-18} y={18} radius={5} fill="#222" /><Circle x={18} y={18} radius={5} fill="#222" />
      <Text x={-22} y={-5} width={44} text="TUG" fontSize={12} fontStyle="bold" align="center" />
    </Group>
  );
}

export function WarehouseStage({ snapshot, selectedAssetId, highlight, canInteract, onSelectAsset, onMoveUld, onMessage }: {
  snapshot: BoardSnapshot; selectedAssetId: string | null; highlight: BoardHighlight; canInteract: boolean;
  onSelectAsset: (assetId: string | null) => void; onMoveUld: (asset: AssetRow, zone: ZoneWithSlots, slot: SlotRow) => Promise<boolean>; onMessage: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 675 });
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [candidateSlotId, setCandidateSlotId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setSize({ width, height: width * (LOGICAL_BOARD_HEIGHT / LOGICAL_BOARD_WIDTH) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setInterval(() => setPulse((value) => !value), 550);
    return () => window.clearInterval(timer);
  }, [highlight]);

  const activeAssets = useMemo(() => snapshot.assets.filter((asset) => asset.is_active), [snapshot.assets]);
  const positionZones = useMemo(() => snapshot.zones.filter((zone) => zone.zone_type === "LANE" || zone.zone_type === "MIXED"), [snapshot.zones]);
  const zoneById = useMemo(() => new Map(snapshot.zones.map((zone) => [zone.id, zone])), [snapshot.zones]);
  const slotById = useMemo(() => new Map(snapshot.zones.flatMap((zone) => zone.slots).map((slot) => [slot.id, slot])), [snapshot.zones]);
  const connectedUldIds = useMemo(() => new Set(snapshot.connections.filter((connection) => connection.is_active).map((connection) => connection.child_asset_id)), [snapshot.connections]);
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

  function updateCandidate(asset: AssetRow, event: KonvaEventObject<DragEvent>) {
    const nearest = findNearestAvailableSlot({ x: event.target.x(), y: event.target.y() }, positionZones, activeAssets, asset.id);
    setCandidateSlotId(nearest?.slot.id ?? null);
    return nearest;
  }

  async function finishDrag(asset: AssetRow, origin: AssetPosition, event: KonvaEventObject<DragEvent>) {
    const nearest = updateCandidate(asset, event);
    setDraggingAssetId(null);
    setCandidateSlotId(null);
    if (!nearest) {
      event.target.position(origin);
      onMessage("Move rejected: release the ULD over a highlighted available slot.");
      return;
    }
    event.target.position({ x: nearest.slot.x, y: nearest.slot.y });
    const saved = await onMoveUld(asset, nearest.zone, nearest.slot);
    if (!saved) event.target.position(origin);
  }

  return (
    <div ref={containerRef} className="stage-container" style={{ height: size.height }}>
      <Stage width={size.width} height={size.height} aria-label="Interactive WFS warehouse floor plan" role="application">
        <Layer scaleX={scale} scaleY={scale}>
          <Rect width={LOGICAL_BOARD_WIDTH} height={LOGICAL_BOARD_HEIGHT} fill="#edf2f7" onClick={() => onSelectAsset(null)} onTap={() => onSelectAsset(null)} />
          <Rect listening={false} x={280} y={64} width={1200} height={816} fill="#f7f9fb" stroke="#172d41" strokeWidth={5} shadowColor="#607386" shadowBlur={12} shadowOpacity={0.2} />
          <Line listening={false} points={[420, 110, 1210, 110]} stroke={NAVY} strokeWidth={2} dash={[14, 10]} opacity={0.75} />
          <Line listening={false} points={[450, 145, 450, 660]} stroke="#d3dce5" strokeWidth={1} />
          {[650, 825, 1000, 1175].map((x) => <Line listening={false} key={x} points={[x, 145, x, 575]} stroke="#d3dce5" strokeWidth={1} />)}
          {[475, 650, 825, 1000, 1175].map((x) => <Arrow listening={false} key={x} points={[x, 305, x, 355]} pointerAtBeginning stroke={LIGHT_NAVY} fill={LIGHT_NAVY} pointerWidth={9} pointerLength={9} strokeWidth={2} opacity={0.75} />)}

          {snapshot.zones.filter((zone) => zone.zone_type === "STATIC").map((zone) => <StaticZone key={zone.id} zone={zone} />)}
          {snapshot.zones.filter((zone) => zone.zone_type === "LANE").map((zone) => <LaneZone key={zone.id} zone={zone} assets={activeAssets} occupiedSlotIds={occupiedSlotIds} dragging={draggingAssetId !== null} candidateSlotId={candidateSlotId} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} />)}
          {snapshot.zones.filter((zone) => zone.zone_type === "MIXED").map((zone) => <MixedZone key={zone.id} zone={zone} assets={activeAssets} occupiedSlotIds={occupiedSlotIds} dragging={draggingAssetId !== null} candidateSlotId={candidateSlotId} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} />)}
          {snapshot.zones.filter((zone) => zone.zone_type === "DOCK").map((zone) => <DockZone key={zone.id} zone={zone} truck={getDockTruck(zone.id, activeAssets)} highlighted={highlight?.type === "zone" && highlight.id === zone.id} pulse={pulse} />)}

          {snapshot.connections.filter((connection) => connection.is_active).map((connection) => {
            const parent = assetPositions.get(connection.parent_asset_id);
            const child = assetPositions.get(connection.child_asset_id);
            return parent && child ? <Line key={connection.id} listening={false} points={[parent.x, parent.y, child.x, child.y]} stroke={NAVY} strokeWidth={3} dash={[8, 5]} opacity={0.7} /> : null;
          })}

          {activeAssets.map((asset) => {
            const highlighted = highlight?.type === "asset" && highlight.id === asset.id;
            if (asset.asset_category === "ULD" && asset.slot_id) {
              const slot = slotById.get(asset.slot_id);
              if (!slot) return null;
              const origin = { x: slot.x, y: slot.y };
              return <UldAsset key={asset.id} asset={asset} x={origin.x} y={origin.y} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} draggable={canInteract && !connectedUldIds.has(asset.id)} onSelect={() => onSelectAsset(asset.id)} onDragStart={(event) => { event.cancelBubble = true; setDraggingAssetId(asset.id); updateCandidate(asset, event); }} onDragMove={(event) => updateCandidate(asset, event)} onDragEnd={(event) => { void finishDrag(asset, origin, event); }} />;
            }
            if (asset.asset_category === "TRUCK" && asset.zone_id) {
              const zone = zoneById.get(asset.zone_id);
              return zone ? <TruckAsset key={asset.id} asset={asset} zone={zone} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} onSelect={() => onSelectAsset(asset.id)} /> : null;
            }
            if (asset.asset_category === "TUG") return <TugAsset key={asset.id} asset={asset} selected={selectedAssetId === asset.id} highlighted={highlighted} pulse={pulse} onSelect={() => onSelectAsset(asset.id)} />;
            return null;
          })}

          <Text listening={false} x={20} y={18} text="N" fill={NAVY} fontSize={17} fontStyle="bold" align="center" />
          <Arrow listening={false} points={[28, 58, 28, 32]} stroke={NAVY} fill={NAVY} pointerLength={13} pointerWidth={12} strokeWidth={2} />
        </Layer>
      </Stage>
    </div>
  );
}
