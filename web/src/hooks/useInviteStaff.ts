import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Self-service staff invite for the booking app. Calls the dual-auth
// invite-member edge function with the current practice member's JWT.
// The edge function:
//   - Verifies the caller is OWNER/ADMIN of body.practice_id (via RLS).
//   - Rejects ADMINs trying to invite OWNER (only operators + OWNER can).
//   - Pre-checks practice.staff_seat_limit; the DB trigger enforces it
//     as the hard guarantee.
//   - Creates the auth.users row + practice_member row in lockstep,
//     rolling back the auth row on practice_member insert failure.
//
// Caller passes the resolved practice_id (from useAuth().member.practice_id
// or the tenant context). The redirectTo URL is where the invitee will
// land — defaults to this booking app's /auth/callback.

export type StaffRole = "OWNER" | "ADMIN" | "DENTIST" | "HYGIENIST" | "NURSE" | "RECEPTIONIST";

export interface InviteStaffInput {
  practice_id: string;
  email: string;
  role: StaffRole;
  full_name: string;
}

export interface InviteStaffResult {
  user_id: string;
  practice_id: string;
  role: StaffRole;
  message: string;
}

interface InviteError extends Error {
  status?: number;
  seat_limit?: number;
  active_count?: number;
}

export function useInviteStaff() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<InviteError | null>(null);

  async function invite(input: InviteStaffInput): Promise<InviteStaffResult> {
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        const e: InviteError = new Error("Not signed in");
        throw e;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({
          ...input,
          redirect_to: `${window.location.origin}/auth/callback`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e: InviteError = new Error(json.error ?? "Failed to invite");
        e.status = res.status;
        e.seat_limit = json.seat_limit;
        e.active_count = json.active_count;
        throw e;
      }
      return json as InviteStaffResult;
    } catch (err) {
      const e = err as InviteError;
      setError(e);
      throw e;
    } finally {
      setSubmitting(false);
    }
  }

  return { invite, submitting, error };
}
