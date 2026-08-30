"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("FlowBoard render failure", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="state-page">
      <div className="state-card state-card--error" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>The warehouse board could not be displayed</h1>
        <p>Your data remains in Supabase. Check the connection and try loading the board again.</p>
        <button className="primary-button" type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
