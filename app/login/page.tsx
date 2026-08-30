import { LoginForm } from "@/components/auth/LoginForm";
import { SetupRequired } from "@/components/SetupRequired";
import { readPublicEnvironment } from "@/lib/env";

export default function LoginPage() {
  const environment = readPublicEnvironment();
  if (!environment.data) return <SetupRequired message={environment.error ?? "Supabase is not configured."} />;

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="WFS FlowBoard">
        <div className="brand-symbol" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">WFS OPERATIONS</p>
        <h1>Warehouse FlowBoard</h1>
        <p>Secure, live coordination for the cargo handling floor.</p>
      </section>
      <LoginForm />
    </main>
  );
}
