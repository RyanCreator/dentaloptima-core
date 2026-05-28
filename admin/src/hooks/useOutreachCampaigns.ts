import { useCallback, useEffect, useState } from "react";
import { supabaseOps as supabase } from "@/integrations/supabase/client";
import { debounce } from "@/lib/debounce";

const REALTIME_DEBOUNCE_MS = 300;

export type OutreachCampaignStatus = "DRAFT" | "SENDING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type OutreachSendStatus =
  | "QUEUED" | "SENDING" | "SENT" | "DELIVERED"
  | "BOUNCED" | "COMPLAINED" | "FAILED" | "SKIPPED";

export async function fetchCampaign(id: string): Promise<OutreachCampaign | null> {
  const { data } = await supabase
    .from("outreach_campaign")
    .select("*, template:template_id(id, name, subject)")
    .eq("id", id)
    .maybeSingle();
  return data as OutreachCampaign | null;
}

export interface OutreachCampaign {
  id: string;
  name: string;
  template_id: string | null;
  template?: { id: string; name: string; subject: string } | null;
  from_address: string;
  reply_to_address: string | null;
  send_interval_seconds: number;
  status: OutreachCampaignStatus;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  bounced_count: number;
  complained_count: number;
  opened_count: number;
  clicked_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useOutreachCampaigns(opts: { showArchived?: boolean } = {}) {
  const { showArchived = false } = opts;
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("outreach_campaign")
      .select("*, template:template_id(id, name, subject)")
      .order("created_at", { ascending: false });
    // Default view hides archived. Pass showArchived to surface them.
    if (!showArchived) query = query.is("archived_at", null);
    const { data } = await query;
    setCampaigns((data as OutreachCampaign[]) || []);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    reload();
    const debouncedReload = debounce(reload, REALTIME_DEBOUNCE_MS);
    // Realtime — sent_count climbs as the cron processes rows. Debounce
    // collapses the burst of updates into a single fetch.
    const channel = supabase
      .channel(`outreach-campaigns-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "ops", table: "outreach_campaign" },
        () => debouncedReload()
      )
      .subscribe();
    return () => {
      debouncedReload.cancel();
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { campaigns, loading, reload };
}

export interface CreateCampaignInput {
  name: string;
  template_id: string;
  from_address: string;
  reply_to_address?: string | null;
  send_interval_seconds: number;
  contact_ids: string[];
}

// Creates the campaign + outreach_send rows atomically (well, sequentially —
// we can't run a transaction client-side, but we insert the campaign as DRAFT
// first then add the sends; the campaign isn't started until we explicitly
// flip it to SENDING). The trigger keeps total_count in sync.
export async function createCampaign(input: CreateCampaignInput): Promise<OutreachCampaign> {
  const { data: campaign, error } = await supabase
    .from("outreach_campaign")
    .insert({
      name: input.name.trim(),
      template_id: input.template_id,
      from_address: input.from_address,
      reply_to_address: input.reply_to_address?.trim() || null,
      send_interval_seconds: input.send_interval_seconds,
      status: "DRAFT",
    })
    .select("*")
    .single();
  if (error || !campaign) throw error ?? new Error("Campaign create failed");

  if (input.contact_ids.length > 0) {
    const sendRows = input.contact_ids.map((cid) => ({
      campaign_id: (campaign as OutreachCampaign).id,
      contact_id: cid,
    }));
    // Batch insert (Postgres handles thousands fine).
    for (let i = 0; i < sendRows.length; i += 500) {
      const batch = sendRows.slice(i, i + 500);
      const { error: sErr } = await supabase.from("outreach_send").insert(batch);
      if (sErr) throw sErr;
    }
  }

  return campaign as OutreachCampaign;
}

/**
 * Adds contacts to an existing campaign as recipients. Used by the
 * Contacts page's "Add to campaign" flow — the user multi-selects on
 * Contacts, then bulk-adds in one round trip.
 *
 * The unique (campaign_id, contact_id) constraint on outreach_send
 * means re-adding a contact already in the campaign is a no-op (via
 * upsert with ignoreDuplicates). Returns the count actually inserted.
 */
export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[],
): Promise<{ inserted: number; alreadyPresent: number }> {
  if (contactIds.length === 0) return { inserted: 0, alreadyPresent: 0 };

  // Find which contacts are already on the campaign so we can report
  // an honest "inserted N (M were already there)" number.
  const { data: existing } = await supabase
    .from("outreach_send")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .in("contact_id", contactIds);
  const existingSet = new Set((existing ?? []).map((r) => r.contact_id));
  const toInsert = contactIds.filter((id) => !existingSet.has(id));

  if (toInsert.length === 0) {
    return { inserted: 0, alreadyPresent: contactIds.length };
  }

  const rows = toInsert.map((cid) => ({ campaign_id: campaignId, contact_id: cid }));
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("outreach_send").insert(batch);
    if (error) throw error;
  }
  return { inserted: toInsert.length, alreadyPresent: existingSet.size };
}

/** Lists DRAFT campaigns — the only ones it's safe to add recipients to.
 *  SENDING / COMPLETED campaigns shouldn't grow new rows mid-flight. */
export async function fetchDraftCampaigns(): Promise<OutreachCampaign[]> {
  const { data, error } = await supabase
    .from("outreach_campaign")
    .select("*")
    .eq("status", "DRAFT")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutreachCampaign[];
}

export async function startCampaign(id: string) {
  const { error } = await supabase
    .from("outreach_campaign")
    .update({ status: "SENDING", started_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function pauseCampaign(id: string) {
  const { error } = await supabase
    .from("outreach_campaign")
    .update({ status: "PAUSED" })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelCampaign(id: string) {
  const { error } = await supabase
    .from("outreach_campaign")
    .update({ status: "CANCELLED", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Soft delete — sets archived_at so the row drops out of the default view.
// The data (including send history) stays intact for audit / GDPR / "did we
// already email this contact?" checks.
export async function archiveCampaign(id: string) {
  const { error } = await supabase
    .from("outreach_campaign")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreCampaign(id: string) {
  const { error } = await supabase
    .from("outreach_campaign")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
}

// Duplicate an existing campaign as a fresh DRAFT. Copies the template,
// from/reply addresses, and send pace; the operator picks a new recipient
// list before sending. Returns the new campaign so the caller can route
// to its compose page (`/outreach/campaigns/new?from=<id>`) or directly
// open it for editing.
export async function duplicateCampaign(id: string): Promise<OutreachCampaign> {
  const source = await fetchCampaign(id);
  if (!source) throw new Error("Source campaign not found");
  const { data: created, error } = await supabase
    .from("outreach_campaign")
    .insert({
      name: `${source.name} (copy)`,
      template_id: source.template_id,
      from_address: source.from_address,
      reply_to_address: source.reply_to_address,
      send_interval_seconds: source.send_interval_seconds,
      status: "DRAFT",
    })
    .select("*")
    .single();
  if (error || !created) throw error ?? new Error("Duplicate failed");
  return created as OutreachCampaign;
}

// Mark failed/skipped sends as QUEUED so the cron picks them up again.
// Useful when transient SMTP issues cause a batch of failures and the
// underlying problem (rate limit, DNS hiccup) has cleared.
export async function retryFailedSends(campaignId: string): Promise<number> {
  const { error, count } = await supabase
    .from("outreach_send")
    .update(
      {
        status: "QUEUED",
        failed_at: null,
        failure_reason: null,
      },
      { count: "exact" },
    )
    .eq("campaign_id", campaignId)
    .in("status", ["FAILED", "SKIPPED"]);
  if (error) throw error;
  return count ?? 0;
}
