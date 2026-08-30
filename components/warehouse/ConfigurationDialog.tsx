"use client";

import { FormEvent, useState } from "react";
import type { ConfigurationRow } from "@/types/database";

export function SaveBoardDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); onSave(name, description); }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card configuration-dialog" role="dialog" aria-modal="true" aria-labelledby="save-title">
        <div className="modal-header"><div><p>SNAPSHOT</p><h2 id="save-title">Save Board</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button></div>
        <form onSubmit={submit}>
          <label htmlFor="configuration-name">Configuration name</label>
          <input id="configuration-name" autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          <label htmlFor="configuration-description">Description <span>optional</span></label>
          <textarea id="configuration-description" maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save Board"}</button></div>
        </form>
      </section>
    </div>
  );
}

export function LoadConfigurationDialog({ configurations, onClose, onChoose }: { configurations: ConfigurationRow[]; onClose: () => void; onChoose: (configuration: ConfigurationRow) => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card configuration-dialog" role="dialog" aria-modal="true" aria-labelledby="load-title">
        <div className="modal-header"><div><p>TRANSACTIONAL RESTORE</p><h2 id="load-title">Load Configuration</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button></div>
        <p className="modal-intro">Choose a saved arrangement. You will confirm before the live board is replaced.</p>
        <div className="configuration-list">
          {configurations.length === 0 ? <p className="empty-message">No saved configurations are available.</p> : null}
          {configurations.map((configuration) => (
            <button type="button" key={configuration.id} onClick={() => onChoose(configuration)}>
              <span><strong>{configuration.name}</strong><small>{configuration.description || "No description"}</small></span>
              <time dateTime={configuration.created_at}>{new Date(configuration.created_at).toLocaleString()}</time>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
