import { supabase } from "@/lib/supabase";

// Resolve current hostname → practice via `lookup_practice_by_hostname` RPC.
// Mirrors web/'s tenantLoader so the boot flow is consistent across apps.
//
// Three outcomes:
//   - { kind: "found", tenant }       → hostname maps to a live practice
//   - { kind: "not_configured" }      → hostname has no practice row
//   - { kind: "unavailable", … }      → row exists but status is SUSPENDED/OFFBOARDED
//
// Demo mode: when `VITE_PRACTICE_HOSTNAME` is set OR the page is loaded with
// `?dev_hostname=foo` (DEV only, sticky via sessionStorage), that takes
// precedence over `window.location.hostname`. Lets us preview a tenant's
// site locally without DNS jiggery-pokery.
//
// We never throw on "no tenant" — that's an expected runtime state. We DO
// throw on network/DB errors so the caller can render an explicit failure.

export type PracticeStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "OFFBOARDED";

export interface PracticeBootRow {
  id: string;
  name: string;
  slug: string;
  status: PracticeStatus;
  country: string;
  timezone: string;
  marketing_site_enabled: boolean;
  // When false, the public site renders a simple enquiry form on /book
  // rather than the multi-step booking wizard. RPCs that expose services
  // also gate on this flag.
  booking_app_enabled: boolean;
  // Regulator-display fields. All optional — public footer hides each
  // row whose value is null/empty so partial data still looks clean.
  ico_registration_number: string | null;
  cqc_provider_id: string | null;
  cqc_rating: "OUTSTANDING" | "GOOD" | "REQUIRES_IMPROVEMENT" | "INADEQUATE" | null;
  cqc_rating_date: string | null;
  // Operator-edited patient complaints procedure (CQC requirement).
  // JSONB column — see lib/complaintsProcedure for the shape. Null when
  // the practice has not yet published a procedure; the /complaints
  // page renders a "not yet published" notice in that case.
  complaints_procedure: unknown;
  // Named Principal Dentist + GDC number — shown in the Footer's
  // Regulatory Information block. Live values override the static
  // marketing-config `team` entry; when null the Footer falls back to
  // whichever team member's role matches "principal|owner" in config.
  principal_dentist_name: string | null;
  principal_dentist_gdc_number: string | null;
}

export interface MarketingTenant {
  hostname: string;
  practice: PracticeBootRow;
}

export type BootResult =
  // Practice resolved AND marketing site is enabled — render the site.
  | { kind: "found"; tenant: MarketingTenant }
  // Hostname doesn't map to any practice row.
  | { kind: "not_configured"; hostname: string }
  // Practice exists but suspended/offboarded — site can't render at all.
  | { kind: "unavailable"; hostname: string; practice: PracticeBootRow }
  // Practice exists and is live, but the marketing site is toggled off.
  // Distinct from "unavailable" — we render a "coming soon" state for this,
  // not the suspension page, because nothing is wrong with the practice.
  | { kind: "site_disabled"; hostname: string; practice: PracticeBootRow };

const DEV_HOSTNAME_KEY = "marketing:dev:hostname";

function resolveHostname(): string {
  const envOverride = import.meta.env.VITE_PRACTICE_HOSTNAME as string | undefined;
  if (envOverride && envOverride.trim()) return envOverride.trim().toLowerCase();

  if (import.meta.env.DEV) {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("dev_hostname");
    if (fromQuery) {
      sessionStorage.setItem(DEV_HOSTNAME_KEY, fromQuery.toLowerCase());
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
    throw new Error(`Failed to look up practice for ${hostname}: ${error.message}`);
  }

  const row = (data?.[0] ?? null) as PracticeBootRow | null;
  if (!row) {
    return { kind: "not_configured", hostname };
  }

  if (row.status === "SUSPENDED" || row.status === "OFFBOARDED") {
    return { kind: "unavailable", hostname, practice: row };
  }

  if (!row.marketing_site_enabled) {
    return { kind: "site_disabled", hostname, practice: row };
  }

  return {
    kind: "found",
    tenant: { hostname, practice: row },
  };
}
