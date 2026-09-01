import Link from "next/link";

export function BoardLoadFailure({ message, code }: { message: string; code?: string }) {
  return (
    <main className="state-page">
      <div className="state-card state-card--error" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>The warehouse board could not be displayed</h1>
        <p>{message}</p>
        {code ? <p className="state-help">Diagnostic code: {code}</p> : null}
        <Link className="primary-button state-link" href="/">Try again</Link>
      </div>
    </main>
  );
}
