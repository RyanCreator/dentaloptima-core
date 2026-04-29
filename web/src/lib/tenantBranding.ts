// Compatibility stub. Branding will eventually come from the `practice` row;
// for now, return defaults.

import type { TenantConfig } from "./tenantLoader";

let _tenant: TenantConfig | null = null;

export function applyTenantBranding(tenant: TenantConfig): void {
  _tenant = tenant;
}

export function getTenant(): TenantConfig {
  if (!_tenant) {
    return {
      hostname: window.location.hostname,
      practiceName: "Dentaloptima",
      contactEmail: null,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
      branding: {},
      active: true,
      trialEndsAt: null,
      paidUntil: null,
    };
  }
  return _tenant;
}
