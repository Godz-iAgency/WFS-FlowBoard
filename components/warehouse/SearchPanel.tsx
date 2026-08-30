"use client";

import { useMemo, useState } from "react";
import { searchBoard, type SearchResult } from "@/lib/warehouse/selectors";
import type { BoardSnapshot } from "@/types/warehouse";

export function SearchPanel({ snapshot, onClose, onLocate }: { snapshot: BoardSnapshot; onClose: () => void; onLocate: (result: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBoard(snapshot, query), [snapshot, query]);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title">
        <div className="modal-header"><div><p>LIVE BOARD</p><h2 id="search-title">Search</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close search">×</button></div>
        <label htmlFor="board-search">ULD, destination, dock, or truck</label>
        <input id="board-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AKE12345, DHX4, AAX, DD10…" />
        <div className="search-results" role="list">
          {!query ? <p className="empty-message">Enter an identifier, ULD type, destination, or dock number.</p> : null}
          {query && results.length === 0 ? <p className="empty-message">No live assets or zones match “{query}”.</p> : null}
          {results.map((result) => (
            <button key={`${result.type}-${result.id}`} type="button" onClick={() => onLocate(result)}>
              <span className={`result-kind result-kind--${result.type}`}>{result.type}</span>
              <span><strong>{result.title}</strong><small>{result.detail}</small></span>
              <span aria-hidden="true">Locate ›</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
