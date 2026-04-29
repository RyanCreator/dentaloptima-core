// Read-only access to the current tenant's config from React components.
//
// Tenant config is resolved once at boot (see src/main.tsx) and never changes
// during a session, so this is a simple wrapper around the static getter — no
// context provider needed. If you need a different tenant, the user is on a
// different domain and a fresh boot will resolve it.

import { getTenant } from "@/lib/tenantBranding";
import type { TenantConfig } from "@/lib/tenantLoader";

export function useTenant(): TenantConfig {
  return getTenant();
}
