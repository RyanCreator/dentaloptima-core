// Supabase client for the dentaloptima-core booking app.
//
// Single shared Supabase project (per the dentaloptima-core architecture).
// RLS scopes data to the logged-in practice member's practice automatically
// — there's no per-hostname tenant resolution like the legacy booking app.
//
// If you need a separate `ops` schema client (operator-only stuff), don't —
// that's the admin app's job.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local."
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Helper kept for legacy call-sites that asked for the tenant URL.
// Returns the dentaloptima-core URL — there's no tenant-specific routing here.
export function getTenantSupabaseUrl(): string {
  return SUPABASE_URL;
}

// Compatibility shim: legacy code calls initSupabaseClient + isSupabaseInitialised.
// In the new model the client exists at module load. These are no-ops.
export function initSupabaseClient(): void { /* no-op in shared-DB model */ }
export function isSupabaseInitialised(): boolean { return true; }
