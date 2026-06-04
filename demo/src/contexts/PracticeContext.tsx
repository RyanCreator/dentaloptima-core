import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  loadTenantConfig,
  type BootResult,
  type MarketingTenant,
} from "@/lib/tenantLoader";

// PracticeBootstrap mirrors web/'s pattern: resolve hostname → practice
// before rendering anything that depends on tenant context (booking form,
// contact form, anywhere we render practice.name from DB). Static marketing
// content (hero copy, services list, team) is independent and rendered the
// same regardless of tenant.

interface PracticeContextValue {
  tenant: MarketingTenant;
}

const PracticeContext = createContext<PracticeContextValue | null>(null);

// Hard read — every form/page that imports this assumes a resolved practice.
// Anywhere it's used outside <PracticeBootstrap> is a bug.
export function usePractice(): MarketingTenant {
  const ctx = useContext(PracticeContext);
  if (!ctx) {
    throw new Error("usePractice must be used inside <PracticeBootstrap>");
  }
  return ctx.tenant;
}

// Soft read — returns null if no tenant is resolved. Used by marketing
// content that wants to substitute the practice name when known but
// fall back to a generic label in the meantime.
export function useMaybePractice(): MarketingTenant | null {
  return useContext(PracticeContext)?.tenant ?? null;
}

interface PracticeBootstrapProps {
  children: ReactNode;
  renderLoading?: () => ReactNode;
  renderNotConfigured: (hostname: string) => ReactNode;
  renderUnavailable: (hostname: string, practice: { name: string; status: string }) => ReactNode;
  // Practice exists + is live, but marketing site is toggled off in admin.
  renderSiteDisabled: (hostname: string, practice: { name: string }) => ReactNode;
  renderError: (error: Error) => ReactNode;
}

export function PracticeBootstrap({
  children,
  renderLoading,
  renderNotConfigured,
  renderUnavailable,
  renderSiteDisabled,
  renderError,
}: PracticeBootstrapProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; tenant: MarketingTenant }
    | { kind: "not_configured"; hostname: string }
    | { kind: "unavailable"; hostname: string; practice: { name: string; status: string } }
    | { kind: "site_disabled"; hostname: string; practice: { name: string } }
    | { kind: "error"; error: Error }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadTenantConfig()
      .then((result: BootResult) => {
        if (cancelled) return;
        if (result.kind === "found") {
          setState({ kind: "ready", tenant: result.tenant });
        } else if (result.kind === "not_configured") {
          setState({ kind: "not_configured", hostname: result.hostname });
        } else if (result.kind === "site_disabled") {
          setState({
            kind: "site_disabled",
            hostname: result.hostname,
            practice: { name: result.practice.name },
          });
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
  if (state.kind === "site_disabled") {
    return <>{renderSiteDisabled(state.hostname, state.practice)}</>;
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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-sm text-ink/60">Loading…</div>
    </div>
  );
}
