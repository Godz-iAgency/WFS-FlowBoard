import { signOut } from "@/app/auth/actions";

export function AccessDenied({ warehouseCode }: { warehouseCode: string }) {
  return (
    <main className="state-page">
      <div className="state-card state-card--error">
        <span className="state-icon" aria-hidden="true">!</span>
        <p className="eyebrow">ACCESS REQUIRED</p>
        <h1>No warehouse membership found</h1>
        <p>Your account is authenticated but has not been assigned to <strong>{warehouseCode}</strong>.</p>
        <p className="state-help">Ask a warehouse administrator to add your account as an Operator, Manager, or Admin.</p>
        <form action={signOut}><button className="secondary-button" type="submit">Sign out</button></form>
      </div>
    </main>
  );
}
