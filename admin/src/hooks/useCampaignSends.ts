import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";
import { debounce } from "@/lib/debounce";
import type { OutreachSendStatus } from "@/hooks/useOutreachCampaigns";

const REALTIME_DEBOUNCE_MS = 300;

export interface CampaignSend {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: OutreachSendStatus;
  rendered_subject: string | null;
  rendered_body_text: string | null;
  postmark_message_id: string | null;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  complained_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  contact?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    practice_name: string | null;
    status: string;
    archived_at: string | null;
  } | null;
}

export function useCampaignSends(campaignId: string | null) {
  const [sends, setSends] = useState<CampaignSend[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks whether the current effect is still alive. Async fetches that
  // resolve after unmount or after campaignId changes use this to avoid
  // overwriting state with stale results.
  const aliveRef = useRef(true);

  const reload = useCallback(async () => {
    if (!campaignId) {
      if (aliveRef.current) {
        setSends([]);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("outreach_send")
      .select("*, contact:contact_id(email, first_name, last_name, practice_name, status, archived_at)")
      .eq("campaign_id", campaignId)
      .order("queued_at", { ascending: true });
    if (!aliveRef.current) return;
    setSends((data as CampaignSend[]) || []);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    aliveRef.current = true;
    reload();
    if (!campaignId) return;
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    // Realtime — opens, deliveries, status changes all push live updates
    // to the campaign detail page while the user watches it.
    const channel = supabase
      .channel(`campaign-sends-${campaignId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "outreach_send", filter: `campaign_id=eq.${campaignId}` },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      aliveRef.current = false;
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [campaignId, reload]);

  return { sends, loading, reload };
}
