"use client";

import { useState } from "react";
import { getOperationalSummary } from "@/lib/warehouse/selectors";
import type { BoardSnapshot } from "@/types/warehouse";

function NorthCompass() {
  return (
    <div className="toolbar-compass" role="img" aria-label="North compass">
      <span>N</span>
      <svg viewBox="0 0 28 34" aria-hidden="true">
        <path className="toolbar-compass__north" d="M14 1 25 31 14 24Z" />
        <path className="toolbar-compass__south" d="M14 1 3 31 14 24Z" />
        <path className="toolbar-compass__needle" d="M14 3v22" />
      </svg>
    </div>
  );
}

export function BoardToolbar({
  snapshot,
  busy,
  canManageConfigurations,
  elementsOpen,
  onUndo,
  onElements,
  onSearch,
  onAssistant,
  onSave,
  onLoad,
  onHistory,
}: {
  snapshot: BoardSnapshot;
  busy: boolean;
  canManageConfigurations: boolean;
  elementsOpen: boolean;
  onUndo: () => void;
  onElements: () => void;
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
        <button className="toolbar-button toolbar-button--elements" type="button" onClick={onElements} aria-expanded={elementsOpen}>
          <span aria-hidden="true">⊞</span> Elements
        </button>
        <button className="toolbar-button" type="button" onClick={onSearch}><span aria-hidden="true">⌕</span> Search</button>
        <button className="toolbar-button toolbar-button--assistant" type="button" onClick={onAssistant}><span aria-hidden="true">✦</span> Ask Agent</button>
        <button className="toolbar-button toolbar-button--wide-action" type="button" onClick={onHistory}><span aria-hidden="true">≡</span> History</button>
        {canManageConfigurations ? <button className="toolbar-button toolbar-button--wide-action" type="button" onClick={onSave}>Save Board</button> : null}
        {canManageConfigurations ? <button className="toolbar-button toolbar-button--wide-action" type="button" onClick={onLoad}>Load Configuration</button> : null}
        <details className="toolbar-more">
          <summary className="toolbar-button" aria-label="More board controls">More <span aria-hidden="true">⌄</span></summary>
          <div className="toolbar-more-menu">
            <button type="button" onClick={(event) => { onHistory(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>History</button>
            {canManageConfigurations ? <button type="button" onClick={(event) => { onSave(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Save Board</button> : null}
            {canManageConfigurations ? <button type="button" onClick={(event) => { onLoad(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Load Configuration</button> : null}
          </div>
        </details>
        <NorthCompass />
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
