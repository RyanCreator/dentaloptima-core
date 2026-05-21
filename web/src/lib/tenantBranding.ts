// Tenant module-level cache. Set by PracticeBootstrap once the hostname →
// practice lookup resolves. Lifted code paths that don't have access to
// the React context can call getTenant() directly.

import type { TenantConfig } from "./tenantLoader";

let _tenant: TenantConfig | null = null;

export function applyTenantBranding(tenant: TenantConfig): void {
  _tenant = tenant;
}

export function getTenant(): TenantConfig {
  if (!_tenant) {
    throw new Error(
      "Tenant has not been resolved yet. PracticeBootstrap must run before any tenant-dependent code.",
    );
  }
  return _tenant;
}

// Useful for non-render callers that want to gracefully degrade if called
// pre-bootstrap (e.g. analytics that should silently skip).
export function getTenantOrNull(): TenantConfig | null {
  return _tenant;
}
