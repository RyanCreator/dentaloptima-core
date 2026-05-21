import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public-facing patient site for dentaloptima-core. Hits the shared Supabase
// project as anon — never authenticated. Tenancy is resolved per-request from
// the hostname via `lookup_practice_by_hostname` RPC, not from a JWT.
//
// Booking + contact forms write to `booking_request` (practice_id stamped from
// the resolved tenant). Anon RLS policies on `service` and `booking_request`
// gate what's reachable — see migration 0031_marketing_anon_access.sql.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Marketing site never logs anyone in — disabling persistence avoids
    // accidental session writes from any future sign-in code paths.
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Backwards-compat shims for the original template's call sites.
// `BookingForm` calls getPracticeSupabase() / hasPracticeSupabase() — both
// now resolve trivially since the client is always available at module load
// (a missing env var would have thrown above).
export function getPracticeSupabase(): SupabaseClient {
  return supabase;
}

export function hasPracticeSupabase(): boolean {
  return true;
}
