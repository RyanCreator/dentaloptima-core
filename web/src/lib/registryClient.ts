import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Thin client pointed at the tenant-registry project. The booking app
// authenticates against dentaloptima-core, so this client is only used
// for anon-callable RPCs that don't require a session — currently just
// `list_announcements_for_practice`.
//
// Configured via VITE_TENANT_REGISTRY_URL + VITE_TENANT_REGISTRY_ANON_KEY.
// If those aren't set (e.g. local dev without registry access) we return
// null and callers degrade to "no announcements" rather than blowing up.

let cached: SupabaseClient | null | undefined;

export function getRegistryClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = import.meta.env.VITE_TENANT_REGISTRY_URL as string | undefined;
  const key = import.meta.env.VITE_TENANT_REGISTRY_ANON_KEY as string | undefined;
  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: {
      // No session persistence — we only call public RPCs from this client.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
