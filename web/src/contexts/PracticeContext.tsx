import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  loadTenantConfig,
  type BootResult,
  type TenantConfig,
} from "@/lib/tenantLoader";
import { applyTenantBranding } from "@/lib/tenantBranding";

interface PracticeContextValue {
  tenant: TenantConfig;
}

const PracticeContext = createContext<PracticeContextValue | null>(null);

export function usePractice(): TenantConfig {
  const ctx = useContext(PracticeContext);
  if (!ctx) {
    // Strict because every authed page in the app assumes a resolved practice.
    // If you see this, something is rendering outside <PracticeBootstrap>.
    throw new Error("usePractice must be used inside <PracticeBootstrap>");
  }
  return ctx.tenant;
}

interface PracticeBootstrapProps {
  children: ReactNode;
  // Render-prop overrides for the failure modes — keeps PracticeContext free
  // of route/import knowledge so we can use it independently of <App>.
  renderLoading?: () => ReactNode;
  renderNotConfigured: (hostname: string) => ReactNode;
  renderUnavailable: (hostname: string, practice: { name: string; status: string }) => ReactNode;
  renderError: (error: Error) => ReactNode;
}

// Bootstraps the practice from the current hostname, then renders children.
// While the lookup is in flight, renders the loading state. On terminal
// failure modes (no tenant configured, suspended, network error), renders
// the appropriate page WITHOUT the rest of the app — the operator/practice
// member can't proceed past these.
export function PracticeBootstrap({
  children,
  renderLoading,
  renderNotConfigured,
  renderUnavailable,
  renderError,
}: PracticeBootstrapProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; tenant: TenantConfig }
    | { kind: "not_configured"; hostname: string }
    | { kind: "unavailable"; hostname: string; practice: { name: string; status: string } }
    | { kind: "error"; error: Error }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadTenantConfig()
      .then((result: BootResult) => {
        if (cancelled) return;
        if (result.kind === "found") {
          applyTenantBranding(result.tenant);
          setState({ kind: "ready", tenant: result.tenant });
        } else if (result.kind === "not_configured") {
          setState({ kind: "not_configured", hostname: result.hostname });
        } else {
          setState({
            kind: "unavailable",
            hostname: result.hostname,
            practice: { name: result.practice.name, status: result.practice.status },
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <>{renderLoading ? renderLoading() : <DefaultLoading />}</>;
  }
  if (state.kind === "not_configured") {
    return <>{renderNotConfigured(state.hostname)}</>;
  }
  if (state.kind === "unavailable") {
    return <>{renderUnavailable(state.hostname, state.practice)}</>;
  }
  if (state.kind === "error") {
    return <>{renderError(state.error)}</>;
  }

  return (
    <PracticeContext.Provider value={{ tenant: state.tenant }}>
      {children}
    </PracticeContext.Provider>
  );
}

function DefaultLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}
