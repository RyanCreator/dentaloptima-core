import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role DB client for mutating specs: used for setup, teardown, and
// "did it really persist?" assertions — NOT for the action under test (that
// goes through the UI). Requires service-role env (bypasses RLS):
//   SUPABASE_URL / VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const hasServiceRole = Boolean(url && key);
export const db: SupabaseClient | null = hasServiceRole
  ? createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
