import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseOps as supabase } from "@/integrations/supabase/client";

export type AnnouncementSeverity = "info" | "warning" | "critical";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  severity: AnnouncementSeverity;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from("platform_announcement")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

export interface AnnouncementDraft {
  title: string;
  body?: string | null;
  severity: AnnouncementSeverity;
  starts_at?: string;
  ends_at?: string | null;
  active?: boolean;
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

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_announcement").delete().eq("id", id);
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
