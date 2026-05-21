// Two-Supabase-project architecture for the admin dashboard.
//
//  ┌──────────────────────────────────────────────────────────────────┐
//  │  TENANT-REGISTRY (hbsuhalvececxvusrqlh)                          │
//  │  Operator/internal data. Auth lives here.                        │
//  │  Tables: admin_user, support_*, email_*, outreach_*, payment_*,  │
//  │          marketing_lead, platform_announcement, tenant_audit,    │
//  │          tenant.                                                 │
//  │                                                                  │
//  │  → supabaseRegistry uses the publishable/anon key. The operator's│
//  │    JWT (via login) is the actual access boundary; tenant-registry│
//  │    RLS gates operations to the operator's admin_user row.        │
//  └──────────────────────────────────────────────────────────────────┘
//
//  ┌──────────────────────────────────────────────────────────────────┐
//  │  DENTALOPTIMA-CORE (jvwuorwfzoutojpyjnfk)                        │
//  │  Tenant/client data. RLS-isolated by practice_id (for the booking│
//  │  app and marketing site).                                        │
//  │                                                                  │
//  │  → supabaseCore uses the SERVICE ROLE KEY. This bypasses all RLS │
//  │    by design — operators need cross-tenant access to support all │
//  │    practices on the platform.                                    │
//  │                                                                  │
//  │  ⚠ SECURITY MODEL: this admin app is operator-only, served from  │
//  │    admin.dentaloptima.co.uk. Anyone who can log in (i.e. anyone  │
//  │    with an active admin_user row in tenant-registry) can read/   │
//  │    write any tenant's data. The service role key is therefore in │
//  │    the browser bundle, accessible to anyone who lands on a       │
//  │    page-load AFTER auth.                                         │
//  │                                                                  │
//  │    Risks accepted:                                               │
//  │    - Bundle source is downloadable by anyone who reaches the URL │
//  │      (mitigated: noindex + auth gate on the app, but the JS file │
//  │      itself is technically public if you know the path).         │
//  │    - Operator credentials being phished gives full data access.  │
//  │      This is the same risk as edge-function-based access — the   │
//  │      service-role key just removes a HTTP hop.                   │
//  │                                                                  │
//  │    Mitigations:                                                  │
//  │    - admin/.env.local is git-ignored (verify before commit).     │
//  │    - admin/dist/ is git-ignored (only deploy targets see it).    │
//  │    - Rotate the service role key on any suspected exposure       │
//  │      (Supabase dashboard → Settings → API → Reset).              │
//  └──────────────────────────────────────────────────────────────────┘

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Tenant-registry client (auth + ops) ──────────────────────────────────

const REGISTRY_URL = import.meta.env.VITE_REGISTRY_SUPABASE_URL;
const REGISTRY_ANON_KEY = import.meta.env.VITE_REGISTRY_SUPABASE_ANON_KEY;

if (!REGISTRY_URL || !REGISTRY_ANON_KEY) {
  throw new Error(
    "Missing VITE_REGISTRY_SUPABASE_URL or VITE_REGISTRY_SUPABASE_ANON_KEY. " +
      "See admin/.env.example.",
  );
}

export const supabaseRegistry: SupabaseClient = createClient(
  REGISTRY_URL,
  REGISTRY_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "sb-registry-auth-token",
    },
  },
);

// ── Dentaloptima-core client (service-role; bypasses RLS) ────────────────

const CORE_URL = import.meta.env.VITE_SUPABASE_URL;
const CORE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!CORE_URL || !CORE_SERVICE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY. " +
      "Service role key required for cross-tenant admin access. " +
      "See admin/.env.example.",
  );
}

export const supabaseCore: SupabaseClient = createClient(
  CORE_URL,
  CORE_SERVICE_KEY,
  {
    auth: {
      // Service-role client doesn't carry user sessions — it's a privileged
      // backend identity that operates on behalf of any practice.
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

// ── Backwards-compat aliases (deprecated, will be removed) ───────────────
/** @deprecated import `supabaseRegistry` (ops queries) or `supabaseCore` (tenant data) */
export const supabase = supabaseRegistry;
/** @deprecated import `supabaseRegistry` instead */
export const supabaseOps = supabaseRegistry;

// Operator token kept for backwards compat with edge functions that may
// still reference it. New flows use the operator's tenant-registry JWT.
/** @deprecated edge functions verify operator JWTs now */
export const OPERATOR_TOKEN = import.meta.env.VITE_OPERATOR_TOKEN ?? "";
