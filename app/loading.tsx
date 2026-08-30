export default function Loading() {
  return (
    <main className="state-page" aria-busy="true">
      <div className="state-card">
        <div className="loading-mark" aria-hidden="true" />
        <h1>Loading WFS FlowBoard</h1>
        <p>Retrieving the authoritative warehouse layout and live board state…</p>
      </div>
    </main>
  );
}
