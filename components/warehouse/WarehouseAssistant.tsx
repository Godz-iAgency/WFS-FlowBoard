"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type AssistantMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  snapshotTime?: string;
  intro?: boolean;
};

const starterMessage: AssistantMessage = {
  id: 0,
  role: "assistant",
  text: "Ask me about live ULD types, destinations, lane positions, docks, trucks, tug connections, or floor areas.",
  intro: true,
};

const suggestions = [
  "Where are the AKE ULDs?",
  "Which docks are occupied?",
  "What equipment is on the floor?",
];

function formatSnapshotTime(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function WarehouseAssistant({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([starterMessage]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const messageId = useRef(1);
  const messageList = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageList.current?.scrollTo?.({ top: messageList.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function ask(rawQuestion: string) {
    const message = rawQuestion.trim();
    if (busy || message.length < 2) return;
    const history = messages
      .filter((turn) => !turn.intro)
      .slice(-8)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    setMessages((current) => [...current, { id: messageId.current++, role: "user", text: message }]);
    setQuestion("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const payload = await response.json() as { answer?: string; error?: string; snapshotTime?: string };
      const text = response.ok && payload.answer
        ? payload.answer
        : payload.error ?? "The FlowBoard agent could not answer right now. Please try again.";
      setMessages((current) => [...current, {
        id: messageId.current++,
        role: "assistant",
        text,
        snapshotTime: response.ok ? payload.snapshotTime : undefined,
      }]);
    } catch {
      setMessages((current) => [...current, {
        id: messageId.current++,
        role: "assistant",
        text: "The FlowBoard agent could not connect. Please try again.",
      }]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(question);
    }
  }

  return (
    <div className="drawer-backdrop assistant-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="warehouse-assistant" role="dialog" aria-modal="true" aria-labelledby="warehouse-assistant-title">
        <header className="assistant-header">
          <div>
            <p>LIVE FLOOR DATA</p>
            <h2 id="warehouse-assistant-title">FlowBoard Agent</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close FlowBoard agent" onClick={onClose}>×</button>
        </header>

        <div className="assistant-scope">
          <span aria-hidden="true">✦</span>
          <p>Read-only answers from the latest authorized warehouse snapshot. The agent cannot change the board.</p>
        </div>

        <div ref={messageList} className="assistant-messages" aria-live="polite">
          {messages.map((message) => {
            const checkedAt = formatSnapshotTime(message.snapshotTime);
            return (
              <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
                <strong>{message.role === "user" ? "You" : "FlowBoard Agent"}</strong>
                <p>{message.text}</p>
                {checkedAt ? <small>Live data checked {checkedAt}</small> : null}
              </article>
            );
          })}
          {busy ? <div className="assistant-thinking" role="status"><span aria-hidden="true" />Checking the live board…</div> : null}
        </div>

        {messages.length === 1 ? (
          <div className="assistant-suggestions" aria-label="Suggested questions">
            {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
          </div>
        ) : null}

        <form className="assistant-form" onSubmit={handleSubmit}>
          <label htmlFor="warehouse-assistant-question">Ask about the floor</label>
          <textarea
            id="warehouse-assistant-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            maxLength={800}
            rows={3}
            placeholder="Example: Which ULDs are going to DFW?"
            disabled={busy}
          />
          <div><small>{question.length} / 800</small><button type="submit" className="primary-button" disabled={busy || question.trim().length < 2}>{busy ? "Checking…" : "Ask Agent"}</button></div>
        </form>
      </aside>
    </div>
  );
}
