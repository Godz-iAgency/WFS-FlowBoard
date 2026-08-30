export function SetupRequired({ message }: { message: string }) {
  return (
    <main className="state-page">
      <div className="state-card">
        <span className="state-icon state-icon--setup" aria-hidden="true">⚙</span>
        <p className="eyebrow">SETUP REQUIRED</p>
        <h1>Connect the Supabase project</h1>
        <p>{message}</p>
        <p className="state-help">Add the values documented in <strong>.env.example</strong>, then restart the application.</p>
      </div>
    </main>
  );
}
