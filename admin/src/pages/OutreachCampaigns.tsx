import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Send, Plus, Megaphone, Pause, Square, Archive, ArchiveRestore } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveCampaign,
  cancelCampaign,
  createCampaign,
  pauseCampaign,
  restoreCampaign,
  startCampaign,
  useOutreachCampaigns,
  type OutreachCampaign,
  type OutreachCampaignStatus,
} from "@/hooks/useOutreachCampaigns";
import { useOutreachTemplates, renderTemplate, type OutreachTemplate } from "@/hooks/useOutreachTemplates";
import {
  useOutreachContacts,
  type OutreachContact,
} from "@/hooks/useOutreachContacts";

// Wayne first because outreach should feel personal — recipients respond
// better to an email from a named person than a shared contact@ inbox.
// contact@ kept in the list as an option but no longer the default.
const SENDABLE_FROM_ADDRESSES = [
  "wayne@dentaloptima.co.uk",
  "ryan@dentaloptima.co.uk",
  "contact@dentaloptima.co.uk",
];

const STATUS_TONE: Record<OutreachCampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SENDING: "bg-blue-100 text-blue-700 border-blue-200",
  PAUSED: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

export default function OutreachCampaigns() {
  const [showArchived, setShowArchived] = useState(false);
  const { campaigns: allCampaigns, loading, reload } = useOutreachCampaigns({ showArchived: true });
  // Two views in one fetch — split client-side so toggling between them is
  // instant and the counts in the toggle label stay accurate.
  const campaigns = showArchived
    ? allCampaigns.filter((c) => c.archived_at)
    : allCampaigns.filter((c) => !c.archived_at);
  const archivedCount = allCampaigns.filter((c) => c.archived_at).length;
  const [composing, setComposing] = useState(false);

  return (
    <Layout
      title="Campaigns"
      description="Pick contacts, pick a template, send at a controlled pace."
      actions={
        <>
          <Button
            size="sm"
            variant={showArchived ? "secondary" : "ghost"}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="h-4 w-4 mr-1.5" />
            {showArchived ? "Showing archived" : `Archived (${archivedCount})`}
          </Button>
          <Button size="sm" onClick={() => setComposing(true)} disabled={showArchived}>
            <Plus className="h-4 w-4 mr-1.5" />
            New campaign
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {showArchived ? "No archived campaigns" : "No campaigns yet"}
          </p>
          <p className="text-sm mt-1">
            {showArchived
              ? "Archived campaigns will appear here. Restore them to act on them again."
              : "Create one to send to your contacts."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} onChange={reload} />
          ))}
        </div>
      )}

      {composing && (
        <ComposeCampaignSheet
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            reload();
          }}
        />
      )}
    </Layout>
  );
}

function CampaignRow({ campaign, onChange }: { campaign: OutreachCampaign; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const sentPct = campaign.total_count > 0 ? Math.round((campaign.sent_count / campaign.total_count) * 100) : 0;

  const handleStart = async () => {
    setBusy(true);
    try {
      await startCampaign(campaign.id);
      toast.success(`Started — sending 1 every ${campaign.send_interval_seconds}s`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    setBusy(true);
    try {
      await pauseCampaign(campaign.id);
      toast.success("Paused");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    setBusy(true);
    try {
      await startCampaign(campaign.id);
      toast.success("Resumed");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const doCancel = async () => {
    setBusy(true);
    try {
      await cancelCampaign(campaign.id);
      toast.success("Cancelled");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async () => {
    setBusy(true);
    try {
      await archiveCampaign(campaign.id);
      toast.success("Archived");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      await restoreCampaign(campaign.id);
      toast.success("Restored");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/outreach/campaigns/${campaign.id}`} className="font-semibold truncate hover:underline">
              {campaign.name}
            </Link>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${STATUS_TONE[campaign.status]}`}>
              {campaign.status.toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {campaign.template?.name ?? "(no template)"} · From {campaign.from_address}
          </p>
          {/* Progress bar */}
          {campaign.total_count > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-foreground/70 transition-all"
                  style={{ width: `${sentPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {campaign.sent_count} / {campaign.total_count}
              </span>
            </div>
          )}
          {/* Status counters */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            {campaign.delivered_count > 0 && <span>✓ {campaign.delivered_count} delivered</span>}
            {campaign.opened_count > 0 && <span>👁 {campaign.opened_count} opened</span>}
            {campaign.clicked_count > 0 && <span>↗ {campaign.clicked_count} clicked</span>}
            {campaign.bounced_count > 0 && <span className="text-amber-700">↩ {campaign.bounced_count} bounced</span>}
            {campaign.complained_count > 0 && <span className="text-red-700">⚠ {campaign.complained_count} complained</span>}
            {campaign.failed_count > 0 && <span className="text-red-700">✗ {campaign.failed_count} failed</span>}
            {campaign.skipped_count > 0 && <span>− {campaign.skipped_count} skipped</span>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Created {format(new Date(campaign.created_at), "d MMM HH:mm")}
            {campaign.started_at && ` · Started ${format(new Date(campaign.started_at), "d MMM HH:mm")}`}
            {campaign.completed_at && ` · Done ${format(new Date(campaign.completed_at), "d MMM HH:mm")}`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {campaign.status === "DRAFT" && (
            <Button size="sm" onClick={handleStart} disabled={busy || campaign.total_count === 0}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Start sending
            </Button>
          )}
          {campaign.status === "SENDING" && (
            <Button size="sm" variant="outline" onClick={handlePause} disabled={busy}>
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause
            </Button>
          )}
          {campaign.status === "PAUSED" && (
            <Button size="sm" onClick={handleResume} disabled={busy}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Resume
            </Button>
          )}
          {(campaign.status === "SENDING" || campaign.status === "PAUSED") && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
          {!campaign.archived_at && (campaign.status === "DRAFT" || campaign.status === "CANCELLED" || campaign.status === "COMPLETED") && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
          )}
          {campaign.archived_at && (
            <Button size="sm" variant="outline" onClick={handleRestore} disabled={busy}>
              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
              Restore
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel "${campaign.name}"?`}
        description="Already-sent emails stay sent. Queued ones won't go out."
        confirmLabel="Cancel campaign"
        cancelLabel="Keep sending"
        onConfirm={doCancel}
        variant="destructive"
      />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive "${campaign.name}"?`}
        description="It will be hidden from the list but the send history (opens, clicks, bounces) is kept on file. You can restore it later from 'Show archived'."
        confirmLabel="Archive"
        onConfirm={doArchive}
      />
    </div>
  );
}

function ComposeCampaignSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { templates } = useOutreachTemplates();
  // Default to ACTIVE only — never want to email unsubscribed/bounced people
  // by accident.
  // Campaign picker wants all active contacts on one page. Fine for low
  // thousands; revisit with a search+pagination UI if we ever cross ~5k.
  const { contacts: activeContacts } = useOutreachContacts({
    status: "ACTIVE",
    pageSize: 5000,
  });

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [fromAddress, setFromAddress] = useState(SENDABLE_FROM_ADDRESSES[0]);
  const [replyTo, setReplyTo] = useState("");
  const [sendInterval, setSendInterval] = useState(30);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);
  const sampleContact = useMemo(() => {
    if (selectedIds.size === 0) return activeContacts[0];
    return activeContacts.find((c) => selectedIds.has(c.id)) ?? activeContacts[0];
  }, [activeContacts, selectedIds]);

  const handleCreate = async (startImmediately: boolean) => {
    if (!name.trim() || !templateId || selectedIds.size === 0) return;
    setBusy(true);
    try {
      const c = await createCampaign({
        name,
        template_id: templateId,
        from_address: fromAddress,
        reply_to_address: replyTo || null,
        send_interval_seconds: sendInterval,
        contact_ids: [...selectedIds],
      });
      if (startImmediately) {
        await startCampaign(c.id);
        toast.success(`Campaign created and started — sending ${selectedIds.size} email${selectedIds.size === 1 ? "" : "s"}`);
      } else {
        toast.success(`Campaign saved as draft (${selectedIds.size} recipient${selectedIds.size === 1 ? "" : "s"})`);
      }
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New campaign</SheetTitle>
          <SheetDescription>
            Build the send. Save as draft to review first, or start sending immediately.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4 flex-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Campaign name (internal)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Introduction Q3 2026"' disabled={busy} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent className="min-w-[300px]">
                {templates.length === 0 ? (
                  <SelectItem value="__none__" disabled>No templates yet — create one first</SelectItem>
                ) : templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">From</label>
              <Select value={fromAddress} onValueChange={setFromAddress}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[260px]">
                  {SENDABLE_FROM_ADDRESSES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reply-to (optional)</label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={fromAddress} disabled={busy} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Send pace · seconds between emails
            </label>
            <Input type="number" min={1} value={sendInterval} onChange={(e) => setSendInterval(Math.max(1, parseInt(e.target.value || "30")))} disabled={busy} className="w-32" />
            <p className="text-[11px] text-muted-foreground mt-1">
              30s = ~120/hour. Lower = faster but more likely to trip recipient rate limits.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Recipients</label>
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-foreground/80 hover:text-foreground underline"
              >
                {selectedIds.size === 0 ? "Pick contacts" : "Edit selection"}
              </button>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {selectedIds.size === 0 ? (
                <span className="text-muted-foreground">No recipients selected yet</span>
              ) : (
                <span>
                  <span className="font-semibold">{selectedIds.size}</span> active contact{selectedIds.size === 1 ? "" : "s"} selected
                  <span className="text-muted-foreground"> · {Math.ceil((selectedIds.size * sendInterval) / 60)} min to send all</span>
                </span>
              )}
            </div>
          </div>

          {template && sampleContact && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Preview · how {sampleContact.first_name || sampleContact.email} will see it
              </p>
              <div className="rounded-lg border bg-background p-4 text-sm">
                <p className="text-xs text-muted-foreground mb-1">From: {fromAddress}</p>
                <p className="text-xs text-muted-foreground mb-2">To: {sampleContact.email}</p>
                <p className="font-semibold mb-2">{renderTemplate(template.subject, sampleContact)}</p>
                <hr className="my-2" />
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {renderTemplate(template.body_text, sampleContact)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-3 flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => handleCreate(false)} disabled={busy || !name.trim() || !templateId || selectedIds.size === 0}>
            Save as draft
          </Button>
          <Button onClick={() => handleCreate(true)} disabled={busy || !name.trim() || !templateId || selectedIds.size === 0}>
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? "Starting..." : `Start sending (${selectedIds.size})`}
          </Button>
        </div>

        {pickerOpen && (
          <ContactPickerSheet
            contacts={activeContacts}
            initialSelected={selectedIds}
            onClose={() => setPickerOpen(false)}
            onConfirm={(ids) => {
              setSelectedIds(ids);
              setPickerOpen(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

const PICKER_TARGET_TONE: Record<string, string> = {
  TARGET: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MAYBE: "bg-amber-100 text-amber-700 border-amber-200",
  LATER: "bg-blue-100 text-blue-700 border-blue-200",
  GROUP: "bg-slate-100 text-slate-700 border-slate-200",
  NO: "bg-red-100 text-red-700 border-red-200",
};

function ContactPickerSheet({
  contacts,
  initialSelected,
  onClose,
  onConfirm,
}: {
  contacts: OutreachContact[];
  initialSelected: Set<string>;
  onClose: () => void;
  onConfirm: (ids: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<string>("ALL");
  const [areaFilter, setAreaFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  // Distinct areas across all active contacts — sorted for a stable dropdown.
  // Contacts without an area get grouped under "(unset)" so they're still
  // reachable via filter.
  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      const a = (c.custom?.area as string) ?? "";
      set.add(a.trim() || "(unset)");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (targetFilter !== "ALL") {
        const rating = ((c.custom?.target_rating as string) ?? "").toUpperCase();
        if (targetFilter === "__unrated__") {
          if (rating) return false;
        } else if (rating !== targetFilter) {
          return false;
        }
      }
      if (areaFilter !== "ALL") {
        const area = ((c.custom?.area as string) ?? "").trim() || "(unset)";
        if (area !== areaFilter) return false;
      }
      if (q) {
        const hay = [c.email, c.first_name, c.last_name, c.practice_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, search, targetFilter, areaFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allFilteredSelected) {
        for (const c of filtered) next.delete(c.id);
      } else {
        for (const c of filtered) next.add(c.id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setTargetFilter("ALL");
    setAreaFilter("ALL");
  };

  const anyFilterActive = search.trim() !== "" || targetFilter !== "ALL" || areaFilter !== "ALL";

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Pick recipients</SheetTitle>
          <SheetDescription>Active contacts only — unsubscribed / bounced are excluded automatically.</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 mt-4 flex-1 flex flex-col min-h-0">
          <Input
            placeholder="Search email, name, practice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Select value={targetFilter} onValueChange={setTargetFilter}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Target rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ratings</SelectItem>
                <SelectItem value="TARGET">TARGET</SelectItem>
                <SelectItem value="MAYBE">MAYBE</SelectItem>
                <SelectItem value="LATER">LATER</SelectItem>
                <SelectItem value="GROUP">GROUP</SelectItem>
                <SelectItem value="NO">NO</SelectItem>
                <SelectItem value="__unrated__">— unrated —</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="ALL">All areas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={toggleAll}>
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {contacts.length} active · {selected.size} selected
            </p>
            {anyFilterActive && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-md border divide-y">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No active contacts match this filter.
              </div>
            ) : (
              filtered.map((c) => {
                const rating = ((c.custom?.target_rating as string) ?? "").toUpperCase();
                const area = ((c.custom?.area as string) ?? "").trim();
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-accent/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm truncate flex-1">
                          {c.practice_name || c.email}
                        </p>
                        {rating && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border shrink-0 ${
                              PICKER_TARGET_TONE[rating] ?? "bg-muted text-muted-foreground border-transparent"
                            }`}
                          >
                            {rating}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.email}
                        {area && ` · ${area}`}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t pt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selected)} disabled={selected.size === 0}>
            Use {selected.size} contact{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
