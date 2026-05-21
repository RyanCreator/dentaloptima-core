import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseCore, supabaseRegistry } from "@/integrations/supabase/client";

// All tenant CRUD goes directly via supabaseCore (service-role client).
// No edge functions in the hot path — operators have full cross-tenant
// access by design. The security perimeter is the operator login at
// admin.dentaloptima.co.uk, not RLS.
//
// Edge functions still used for COMPLEX multi-step operations:
//   - create-practice-with-owner (provision practice + invite owner)
//   - invite-member (invite a practice member)
//   These need admin-auth APIs (auth.admin.inviteUserByEmail) and
//   transactional rollback, so they stay server-side.

export type PracticeStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "OFFBOARDED";

export interface Practice {
  id: string;
  name: string;
  slug: string;
  status: PracticeStatus;
  plan: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  timezone: string;
  nhs_contract_number: string | null;
  cqc_provider_id: string | null;
  custom_hostname: string | null;
  marketing_site_enabled: boolean;
  booking_app_enabled: boolean;
  staff_seat_limit: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function useTenants() {
  return useQuery({
    queryKey: ["practices"],
    queryFn: async (): Promise<Practice[]> => {
      const { data, error } = await supabaseCore
        .from("practice")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Practice[];
    },
  });
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: ["practice", id],
    enabled: !!id,
    queryFn: async (): Promise<Practice | null> => {
      if (!id) return null;
      const { data, error } = await supabaseCore
        .from("practice")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Practice | null;
    },
  });
}

export interface CreatePracticeInput {
  practice_name: string;
  slug: string;
  owner_email: string;
  owner_full_name: string;
  trial_days?: number;
  redirect_to?: string;
}

export interface CreatePracticeResult {
  practice_id: string;
  slug: string;
  owner_user_id: string;
  trial_ends_at: string;
  message: string;
}

export type PracticeRole = "OWNER" | "ADMIN" | "DENTIST" | "HYGIENIST" | "NURSE" | "RECEPTIONIST";

export interface InviteMemberInput {
  practice_id: string;
  email: string;
  role: PracticeRole;
  full_name: string;
  redirect_to?: string;
}

// invite-member edge function handles auth.admin.inviteUserByEmail +
// practice_member insert with rollback. Verified via operator JWT.
export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteMemberInput) => {
      const { data: sessionData } = await supabaseRegistry.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to invite");
      return json;
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["practice-members", vars.practice_id] }),
  });
}

export interface UpdatePracticeInput {
  id: string;
  patch: Partial<Pick<Practice,
    | "name" | "primary_email" | "primary_phone"
    | "city" | "postcode"
    | "nhs_contract_number" | "cqc_provider_id"
    | "status" | "plan" | "trial_ends_at"
    | "custom_hostname"
    | "marketing_site_enabled"
    | "booking_app_enabled"
    | "staff_seat_limit"
  >>;
}

export function useUpdatePractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdatePracticeInput) => {
      const { data, error } = await supabaseCore
        .from("practice")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Practice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["practice", vars.id] });
      qc.invalidateQueries({ queryKey: ["practices"] });
    },
  });
}

// Adds N days to the practice's trial_ends_at. If trial has already expired,
// the new end is N days from now (not N days from the past expiry) so a
// "+30d" extension actually gives them 30 days of runway.
export function useExtendTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days, currentEnd }: { id: string; days: number; currentEnd: string | null }) => {
      const base = currentEnd && new Date(currentEnd) > new Date() ? new Date(currentEnd) : new Date();
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabaseCore
        .from("practice")
        .update({ trial_ends_at: newEnd })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Practice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["practice", vars.id] });
      qc.invalidateQueries({ queryKey: ["practices"] });
    },
  });
}

// Move a TRIAL practice to ACTIVE. Clears trial_ends_at — once they're
// paying we don't need to track the trial countdown any more.
export function useConvertToActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan?: string }) => {
      const patch: Record<string, unknown> = {
        status: "ACTIVE",
        trial_ends_at: null,
      };
      if (plan) patch.plan = plan;
      const { data, error } = await supabaseCore
        .from("practice")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Practice;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["practice", vars.id] });
      qc.invalidateQueries({ queryKey: ["practices"] });
    },
  });
}

export interface PracticeMember {
  id: string;
  user_id: string;
  practice_id: string;
  role: PracticeRole;
  full_name: string | null;
  email: string;
  is_active: boolean;
  available_for_booking: boolean;
  gdc_number: string | null;
  specialism: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function usePracticeMembers(practiceId: string | undefined) {
  return useQuery({
    queryKey: ["practice-members", practiceId],
    enabled: !!practiceId,
    queryFn: async (): Promise<PracticeMember[]> => {
      if (!practiceId) return [];
      const { data, error } = await supabaseCore
        .from("practice_member")
        .select(
          "id, user_id, practice_id, role, full_name, email, is_active, available_for_booking, gdc_number, specialism, created_at, updated_at, deleted_at",
        )
        .eq("practice_id", practiceId)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PracticeMember[];
    },
  });
}

export interface UpdateMemberInput {
  id: string;
  practice_id: string;
  patch: Partial<Pick<PracticeMember, "role" | "is_active" | "full_name" | "available_for_booking" | "gdc_number" | "specialism">>;
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateMemberInput) => {
      const { data, error } = await supabaseCore
        .from("practice_member")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PracticeMember;
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["practice-members", vars.practice_id] }),
  });
}

// Re-sends the sign-in email for a member who never received the original
// invite (e.g. their inbox didn't exist yet). The edge function tries:
//   1. invite refresh         → kind="invite"
//   2. password-reset email   → kind="reset"  (when user is already confirmed)
//   3. generateLink fallback  → kind="link"   (when both email paths fail —
//                                              rate limit, SMTP issue, fake
//                                              email account, etc). Returns
//                                              the magic link in `link`.
//
// The caller surfaces the link with a Copy button when kind === "link" so
// the operator can share it manually.
export interface ResendInviteResult {
  ok: true;
  kind: "invite" | "reset" | "link";
  message: string;
  link?: string; // present when kind === "link"
}

export function useResendMemberInvite() {
  return useMutation({
    mutationFn: async (input: {
      practice_id: string;
      member_id: string;
      // Where the recipient lands after clicking the link — typically the
      // practice's booking app /auth/callback. Computed by the caller from
      // practice.custom_hostname so we don't need to fetch it again here.
      redirect_to?: string;
    }): Promise<ResendInviteResult> => {
      const { data: sessionData } = await supabaseRegistry.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend-invite`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to resend invite");
      return json as ResendInviteResult;
    },
  });
}

// Soft-delete via deleted_at + is_active=false. The auth.users row stays —
// we don't sign people out of Supabase auth, we just remove their practice
// link so they can't see anything via RLS. To restore: set deleted_at NULL.
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, practice_id }: { id: string; practice_id: string }) => {
      const { error } = await supabaseCore
        .from("practice_member")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id);
      if (error) throw error;
      return { id, practice_id };
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["practice-members", vars.practice_id] }),
  });
}

// Creates a new practice + invites the owner via the create-practice-with-owner
// edge function (uses auth.admin APIs which need server-side service role).
export function useCreatePractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePracticeInput): Promise<CreatePracticeResult> => {
      const { data: sessionData } = await supabaseRegistry.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-practice-with-owner`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = [json.error, json.detail].filter(Boolean).join(" — ") || "Failed to create practice";
        throw new Error(message);
      }
      return json as CreatePracticeResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practices"] }),
  });
}
