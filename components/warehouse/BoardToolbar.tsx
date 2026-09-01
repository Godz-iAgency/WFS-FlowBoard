"use client";

import { useState } from "react";
import { getOperationalSummary } from "@/lib/warehouse/selectors";
import type { BoardSnapshot } from "@/types/warehouse";

export function BoardToolbar({
  snapshot,
  busy,
  canManageConfigurations,
  onUndo,
  onSearch,
  onAssistant,
  onSave,
  onLoad,
  onHistory,
}: {
  snapshot: BoardSnapshot;
  busy: boolean;
  canManageConfigurations: boolean;
  onUndo: () => void;
  onSearch: () => void;
  onAssistant: () => void;
  onSave: () => void;
  onLoad: () => void;
  onHistory: () => void;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summary = getOperationalSummary(snapshot);
  return (
    <section className="board-toolbar" aria-label="Board controls">
      <div className="toolbar-actions">
        <button className="toolbar-button toolbar-button--primary" type="button" onClick={onUndo} disabled={busy}>
          <span aria-hidden="true">↶</span> Undo
        </button>
        <button className="toolbar-button" type="button" onClick={onSearch}><span aria-hidden="true">⌕</span> Search</button>
        <button className="toolbar-button toolbar-button--assistant" type="button" onClick={onAssistant}><span aria-hidden="true">✦</span> Ask Agent</button>
        <button className="toolbar-button" type="button" onClick={onHistory}><span aria-hidden="true">≡</span> History</button>
        {canManageConfigurations ? <button className="toolbar-button" type="button" onClick={onSave}>Save Board</button> : null}
        {canManageConfigurations ? <button className="toolbar-button" type="button" onClick={onLoad}>Load Configuration</button> : null}
      </div>
      <button
        className={`operational-summary ${summaryOpen ? "operational-summary--open" : ""}`}
        type="button"
        onClick={() => setSummaryOpen((open) => !open)}
        aria-expanded={summaryOpen}
      >
        <span><strong>Warehouse</strong>{summary.uldOccupied} / {summary.uldCapacity} ULD positions</span>
        <span><strong>Docks</strong>{summary.docksOccupied} / {summary.docksCapacity} occupied</span>
        <span className="truck-summary"><strong>Trucks</strong>{summary.trucks.LOADING} loading · {summary.trucks.UNLOADING} unloading · {summary.trucks.COMPLETE} complete · {summary.trucks.DEPARTING} departing</span>
      </button>
    </section>
  );
}
