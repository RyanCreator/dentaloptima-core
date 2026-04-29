// Supabase client for the dentaloptima-core admin dashboard.
//
// All admin operations target the dentaloptima-core project (the shared
// multi-tenant DB). RLS scopes data to the operator's view as appropriate;
// for cross-tenant operations we rely on operator role inference at the
// application layer (no `practice_member` row → no practice scope, but
// authenticated role can still SELECT some operator-visible tables once
// we add them).
//
// For destructive operations (creating practices, hard-deleting, etc.) we
// call edge functions that hold the service role key server-side.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in values from the Supabase dashboard."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Separate client pinned to the `ops` schema for operator-level platform
// tables (outreach, email, support, leads, announcements, payments).
// Shares the same auth session as the public client — Supabase auth is
// project-scoped, not schema-scoped, so the JWT works in both.
export const supabaseOps = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "sb-core-auth-token", // share with the main client
  },
  db: { schema: "ops" },
});

// Operator token used by the create-practice and similar edge functions.
// Kept here so callers don't have to plumb it through.
export const OPERATOR_TOKEN = import.meta.env.VITE_OPERATOR_TOKEN ?? "";
