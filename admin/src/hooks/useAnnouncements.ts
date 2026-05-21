import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

const QUERY_KEY = ["announcements"] as const;

export type AnnouncementSeverity = "info" | "warning" | "critical";

// Audience targeting — see migration tenant-registry/0002.
//   ALL     = every tenant (default; existing rows pre-migration are this)
//   STATUS  = tenants whose `status` is in audience_status
//   TENANTS = tenants whose `id` is in audience_tenant_ids
export type AnnouncementAudienceKind = "ALL" | "STATUS" | "TENANTS";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  severity: AnnouncementSeverity;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  audience_kind: AnnouncementAudienceKind;
  audience_status: string[];
  audience_tenant_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_email: string | null;
  deleted_at: string | null;
}

export function useAnnouncements() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Announcement[]> => {
      // Hide soft-deleted rows. The trash button on the admin UI sets
      // deleted_at; the row stays in the DB so the audit trail of
      // platform broadcasts survives.
      const { data, error } = await supabase
        .from("platform_announcement")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  // Subscribe to ops.platform_announcement changes. When another operator
  // creates/edits/deletes one in another tab, our list refreshes without
  // waiting for the 30s stale refetch.
  useEffect(() => {
    const channel = supabase
      .channel(`announcements-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "platform_announcement" },
        () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export interface AnnouncementDraft {
  title: string;
  body?: string | null;
  severity: AnnouncementSeverity;
  starts_at?: string;
  ends_at?: string | null;
  active?: boolean;
  audience_kind?: AnnouncementAudienceKind;
  audience_status?: string[];
  audience_tenant_ids?: string[];
}

// Convenience for the list row + booking-app banner: human-readable
// summary of who this announcement targets.
export function audienceLabel(a: Announcement): string {
  if (a.audience_kind === "ALL") return "All tenants";
  if (a.audience_kind === "STATUS") {
    if (a.audience_status.length === 0) return "No statuses selected";
    return `Status: ${a.audience_status.join(", ")}`;
  }
  // TENANTS — caller usually wants a count rather than the raw ids
  return `${a.audience_tenant_ids.length} tenant${a.audience_tenant_ids.length === 1 ? "" : "s"}`;
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: AnnouncementDraft) => {
      const { data, error } = await supabase
        .from("platform_announcement")
        .insert(draft)
        .select()
        .single();
      if (error) throw error;
      return data as Announcement;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AnnouncementDraft> }) => {
      const { data, error } = await supabase
        .from("platform_announcement")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Announcement;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

// Soft-delete: sets deleted_at and is_active=false so the row no longer
// matches the default list query. Use this instead of DELETE; the row
// stays in the DB to preserve the audit trail of who broadcast what.
export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platform_announcement")
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
}

// Whether an announcement is currently visible to tenants (respecting
// active + starts_at/ends_at window).
export function isAnnouncementLive(a: Announcement): boolean {
  if (!a.active) return false;
  const now = new Date();
  const starts = new Date(a.starts_at);
  if (starts > now) return false;
  if (a.ends_at && new Date(a.ends_at) <= now) return false;
  return true;
}
