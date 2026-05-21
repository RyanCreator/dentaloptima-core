// Resolve the current hostname to a practice via the
// `public.lookup_practice_by_hostname` RPC. Runs at app boot, before auth.
//
// Three outcomes:
//   - { kind: "found", practice }   → hostname maps to a practice row
//   - { kind: "not_configured" }    → hostname has no row; show DomainNotConfigured page
//   - { kind: "unavailable", … }    → row exists but status is SUSPENDED/OFFBOARDED
//
// We never throw on "no practice" — that's an expected runtime state, not an
// error. We DO throw on network/DB errors so the ErrorBoundary can render a
// generic failure message.
//
// Dev override: localhost has no DNS mapping, so to test against a tenant
// hostname locally:
//   - Set VITE_DEV_HOSTNAME in .env.local (build-time), or
//   - Append ?dev_hostname=app.optimadental.co.uk to the URL once (sticky
//     via sessionStorage so route changes don't lose it).

import { supabase } from "@/integrations/supabase/client";

export type PracticeStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "OFFBOARDED";

export interface PracticeBootRow {
  id: string;
  name: string;
  slug: string;
  status: PracticeStatus;
  country: string;
  timezone: string;
  // Operator-controlled toggles (from migrations 0032, 0033). Web app uses
  // `booking_app_enabled` to render a wall page after sign-in for practices
  // that are on the website-only plan.
  marketing_site_enabled: boolean;
  booking_app_enabled: boolean;
  // Max number of active practice_member rows allowed for this practice.
  // null = unlimited. Surfaced via lookup_practice_by_hostname (migration
  // 0037) so the booking-app StaffManagement page can show usage and
  // disable the self-service invite button when full.
  staff_seat_limit: number | null;
}

export interface TenantConfig {
  hostname: string;
  practice: PracticeBootRow;
  // Convenience aliases — older lifted code reads these instead of `practice`.
  practiceName: string;
  contactEmail: string | null;
  active: boolean;
}

export type BootResult =
  | { kind: "found"; tenant: TenantConfig }
  | { kind: "not_configured"; hostname: string }
  | { kind: "unavailable"; hostname: string; practice: PracticeBootRow };

const DEV_HOSTNAME_KEY = "dev:hostname";

function resolveHostname(): string {
  // Build-time override
  const envOverride = import.meta.env.VITE_DEV_HOSTNAME as string | undefined;
  if (envOverride && envOverride.trim()) return envOverride.trim().toLowerCase();

  // Runtime override (sticky for the session)
  if (import.meta.env.DEV) {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("dev_hostname");
    if (fromQuery) {
      sessionStorage.setItem(DEV_HOSTNAME_KEY, fromQuery.toLowerCase());
      // Strip the param so the URL stays clean across reloads
      url.searchParams.delete("dev_hostname");
      window.history.replaceState({}, "", url.toString());
    }
    const fromSession = sessionStorage.getItem(DEV_HOSTNAME_KEY);
    if (fromSession) return fromSession;
  }

  return window.location.hostname.toLowerCase();
}

export async function loadTenantConfig(): Promise<BootResult> {
  const hostname = resolveHostname();

  const { data, error } = await supabase.rpc("lookup_practice_by_hostname", {
    p_hostname: hostname,
  });

  if (error) {
    // Surface the network/RPC error — ErrorBoundary handles it.
    throw new Error(`Failed to look up practice for ${hostname}: ${error.message}`);
  }

  const row = (data?.[0] ?? null) as PracticeBootRow | null;
  if (!row) {
    return { kind: "not_configured", hostname };
  }

  if (row.status === "SUSPENDED" || row.status === "OFFBOARDED") {
    return { kind: "unavailable", hostname, practice: row };
  }

  return {
    kind: "found",
    tenant: {
      hostname,
      practice: row,
      practiceName: row.name,
      contactEmail: null,
      active: true,
    },
  };
}
