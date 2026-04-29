// Compatibility stub. The legacy watcher polled the registry to detect tenant
// suspension; in dentaloptima-core this is enforced via RLS + practice.status.
export function startTenantWatcher(): void { /* no-op */ }
