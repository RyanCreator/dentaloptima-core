import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Send,
  Plus,
  Megaphone,
  Pause,
  Square,
  Archive,
  ArchiveRestore,
  Search,
  ArrowLeft,
  Copy,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveCampaign,
  cancelCampaign,
  createCampaign,
  duplicateCampaign,
  fetchCampaign,
  pauseCampaign,
  restoreCampaign,
  startCampaign,
  useOutreachCampaigns,
  type OutreachCampaign,
  type OutreachCampaignStatus,
} from "@/hooks/useOutreachCampaigns";
import { useOutreachTemplates, renderTemplate } from "@/hooks/useOutreachTemplates";
import {
  useOutreachContacts,
  type OutreachContact,
} from "@/hooks/useOutreachContacts";
import { useEmailAccounts } from "@/hooks/useEmailInbox";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<OutreachCampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SENDING: "bg-blue-100 text-blue-700 border-blue-200",
  PAUSED: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

// Route-aware: `/outreach/campaigns/new` → full-page compose, otherwise list.
export default function OutreachCampaigns() {
  const location = useLocation();
  if (location.pathname.endsWith("/campaigns/new")) {
    return <ComposeCampaignPage />;
  }
  return <CampaignsList />;
}

// ---- LIST VIEW -----------------------------------------------------------

type FilterKey = "all" | "draft" | "sending" | "paused" | "completed" | "cancelled" | "archived";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sending", label: "Sending" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "archived", label: "Archived" },
];

// Status sort weight — Sending always at top so operators can see live
// progress without scrolling. Paused next (needs your attention), then the
// rest.
const STATUS_RANK: Record<OutreachCampaignStatus, number> = {
  SENDING: 0,
  PAUSED: 1,
  DRAFT: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function CampaignsList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const { campaigns: allCampaigns, loading, reload } = useOutreachCampaigns({ showArchived: true });

  const counts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: 0,
      draft: 0,
      sending: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
      archived: 0,
    };
    for (const c of allCampaigns) {
      if (c.archived_at) {
        acc.archived++;
        continue;
      }
      acc.all++;
      acc[c.status.toLowerCase() as FilterKey]++;
    }
    return acc;
  }, [allCampaigns]);

  const filtered = useMemo(() => {
    let rows = allCampaigns;
    if (filter === "archived") {
      rows = rows.filter((c) => c.archived_at);
    } else {
      rows = rows.filter((c) => !c.archived_at);
      if (filter !== "all") {
        rows = rows.filter((c) => c.status.toLowerCase() === filter);
      }
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      rows = rows.filter((c) =>
        [c.name, c.template?.name ?? "", c.from_address].join(" ").toLowerCase().includes(q),
      );
    }
    // Status-aware sort: SENDING first, PAUSED next, then by created date desc.
    return [...rows].sort((a, b) => {
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [allCampaigns, filter, debouncedSearch]);

  return (
    <Layout
      title="Campaigns"
      description={
        loading
          ? "Pick contacts, pick a template, send at a controlled pace."
          : `${counts.sending} sending · ${counts.draft} drafts · ${counts.all} total`
      }
      actions={
        <>
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, template, sender…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button size="sm" onClick={() => navigate("/outreach/campaigns/new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            New campaign
          </Button>
        </>
      }
    >
      {/* Filter pills with counts. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const n = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "text-[10px] rounded px-1 tabular-nums",
                  isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
        {(filter !== "all" || debouncedSearch.trim()) && (
          <span className="text-xs text-muted-foreground tabular-nums ml-1">
            {filtered.length} {filtered.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {filter === "archived"
              ? "No archived campaigns"
              : counts.all === 0
                ? "No campaigns yet"
                : "No matches"}
          </p>
          <p className="text-sm mt-1">
            {filter === "archived"
              ? "Archived campaigns will appear here. Restore them to act on them again."
              : counts.all === 0
                ? "Create one to send to your contacts."
                : "Try a different filter or clear the search."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((c) => (
            <CampaignRow key={c.id} campaign={c} onChange={reload} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function CampaignRow({ campaign, onChange }: { campaign: OutreachCampaign; onChange: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const sentPct = campaign.total_count > 0 ? Math.round((campaign.sent_count / campaign.total_count) * 100) : 0;

  const wrap = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const doStart = () => wrap(async () => {
    await startCampaign(campaign.id);
    setConfirmStart(false);
  }, `Started — sending 1 every ${campaign.send_interval_seconds}s`);

  const doPause = () => wrap(() => pauseCampaign(campaign.id), "Paused");
  const doResume = () => wrap(() => startCampaign(campaign.id), "Resumed");
  const doCancel = () => wrap(async () => {
    await cancelCampaign(campaign.id);
    setConfirmCancel(false);
  }, "Cancelled");
  const doArchive = () => wrap(async () => {
    await archiveCampaign(campaign.id);
    setConfirmArchive(false);
  }, "Archived");
  const doRestore = () => wrap(() => restoreCampaign(campaign.id), "Restored");

  const handleDuplicate = async () => {
    setBusy(true);
    try {
      const copy = await duplicateCampaign(campaign.id);
      toast.success("Duplicated as draft");
      navigate(`/outreach/campaigns/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
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
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border", STATUS_TONE[campaign.status])}>
              {campaign.status.toLowerCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {campaign.template?.name ?? "(no template)"} · From {campaign.from_address}
          </p>
          {campaign.total_count > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    campaign.status === "SENDING" ? "bg-blue-500 animate-pulse" : "bg-foreground/70",
                  )}
                  style={{ width: `${sentPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {campaign.sent_count} / {campaign.total_count}
              </span>
            </div>
          )}
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
            <Button size="sm" onClick={() => setConfirmStart(true)} disabled={busy || campaign.total_count === 0}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Start sending
            </Button>
          )}
          {campaign.status === "SENDING" && (
            <Button size="sm" variant="outline" onClick={doPause} disabled={busy}>
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause
            </Button>
          )}
          {campaign.status === "PAUSED" && (
            <Button size="sm" onClick={doResume} disabled={busy}>
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
          {!campaign.archived_at && (
            <Button size="sm" variant="ghost" onClick={handleDuplicate} disabled={busy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Duplicate
            </Button>
          )}
          {!campaign.archived_at && (campaign.status === "DRAFT" || campaign.status === "CANCELLED" || campaign.status === "COMPLETED") && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
          )}
          {campaign.archived_at && (
            <Button size="sm" variant="outline" onClick={doRestore} disabled={busy}>
              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
              Restore
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title={`Start sending "${campaign.name}"?`}
        description={
          <>
            <strong>{campaign.total_count} recipient{campaign.total_count === 1 ? "" : "s"}</strong> · 1 email every {campaign.send_interval_seconds}s ·
            roughly {Math.ceil((campaign.total_count * campaign.send_interval_seconds) / 60)} min total.
            <p className="mt-2 text-xs">Already-sent emails can't be unsent. You can pause or cancel mid-send if needed.</p>
          </>
        }
        confirmLabel={`Send to ${campaign.total_count}`}
        onConfirm={doStart}
      />
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
        description="It will be hidden from the list but the send history (opens, clicks, bounces) is kept on file. Restore later from the Archived filter."
        confirmLabel="Archive"
        onConfirm={doArchive}
      />
    </div>
  );
}

// ---- COMPOSE PAGE -------------------------------------------------------

const PICKER_TARGET_TONE: Record<string, string> = {
  TARGET: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MAYBE: "bg-amber-100 text-amber-700 border-amber-200",
  LATER: "bg-blue-100 text-blue-700 border-blue-200",
  GROUP: "bg-slate-100 text-slate-700 border-slate-200",
  NO: "bg-red-100 text-red-700 border-red-200",
};

function ComposeCampaignPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromCampaignId = searchParams.get("from"); // optional duplicate seed

  const { templates } = useOutreachTemplates();
  const { contacts: activeContacts } = useOutreachContacts({
    status: "ACTIVE",
    pageSize: 5000,
  });
  const { accounts } = useEmailAccounts();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [fromAddress, setFromAddress] = useState<string>("");
  const [replyTo, setReplyTo] = useState("");
  const [sendInterval, setSendInterval] = useState(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);

  // Hydrate from a source campaign for duplicate flow.
  useEffect(() => {
    if (!fromCampaignId) return;
    fetchCampaign(fromCampaignId).then((src) => {
      if (!src) return;
      setName(`${src.name} (copy)`);
      setTemplateId(src.template_id ?? "");
      setFromAddress(src.from_address);
      setReplyTo(src.reply_to_address ?? "");
      setSendInterval(src.send_interval_seconds);
    });
  }, [fromCampaignId]);

  // Seed selected contacts (+ optionally a template) when the editor
  // is reached via Contacts → "Add to campaign". Runs once on mount —
  // re-runs would clobber subsequent edits to the picker.
  const location = useLocation();
  useEffect(() => {
    const state = location.state as {
      prefilledContactIds?: string[];
      prefilledTemplateId?: string;
    } | null;
    if (state?.prefilledContactIds && state.prefilledContactIds.length > 0) {
      setSelectedIds(new Set(state.prefilledContactIds));
    }
    if (state?.prefilledTemplateId) {
      setTemplateId(state.prefilledTemplateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default From to first active account once they load.
  useEffect(() => {
    if (!fromAddress && accounts[0]) setFromAddress(accounts[0].address);
  }, [accounts, fromAddress]);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Preview against the first selected contact, falling back to the first
  // active contact, falling back to a generic sample.
  const previewContact = useMemo(() => {
    if (selectedIds.size > 0) {
      const found = activeContacts.find((c) => selectedIds.has(c.id));
      if (found) return found;
    }
    return activeContacts[0] ?? null;
  }, [activeContacts, selectedIds]);

  const isValid = name.trim() && templateId && fromAddress && selectedIds.size > 0;

  const handleCreate = async (startImmediately: boolean) => {
    if (!isValid) return;
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
        toast.success(`Started — sending ${selectedIds.size} email${selectedIds.size === 1 ? "" : "s"}`);
      } else {
        toast.success(`Saved as draft (${selectedIds.size} recipient${selectedIds.size === 1 ? "" : "s"})`);
      }
      navigate(`/outreach/campaigns/${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirmStart(false);
    }
  };

  return (
    <Layout
      title="New campaign"
      description={fromCampaignId ? "Duplicating from existing campaign — pick recipients and adjust." : "Build the send. Save as draft to review first, or start sending immediately."}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate("/outreach/campaigns")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to list
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Campaign name <span className="text-muted-foreground font-normal text-xs">(internal)</span></Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Introduction Q3 2026"' disabled={busy} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-template">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="c-template">
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent className="min-w-[300px]">
                {templates.length === 0 ? (
                  <SelectItem value="__none__" disabled>No templates yet — create one first</SelectItem>
                ) : templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-from">From</Label>
              <Select value={fromAddress} onValueChange={setFromAddress}>
                <SelectTrigger id="c-from">
                  <SelectValue placeholder="Pick account" />
                </SelectTrigger>
                <SelectContent className="min-w-[260px]">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.address}>{a.address}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-reply">Reply-to <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="c-reply" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={fromAddress} disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-pace">Send pace · seconds between emails</Label>
            <Input
              id="c-pace"
              type="number"
              min={1}
              value={sendInterval}
              onChange={(e) => setSendInterval(Math.max(1, parseInt(e.target.value || "30")))}
              disabled={busy}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              30s = ~120/hr · 60s = ~60/hr · Lower = faster, more risk of recipient rate limits.
            </p>
          </div>

          {template && previewContact && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Preview · how {previewContact.first_name || previewContact.email} will see it
              </Label>
              <div className="rounded-lg border bg-background p-4 text-sm">
                <p className="text-xs text-muted-foreground mb-1">From: {fromAddress}</p>
                <p className="text-xs text-muted-foreground mb-2">To: {previewContact.email}</p>
                <p className="font-semibold mb-2">{renderTemplate(template.subject, previewContact)}</p>
                <hr className="my-2" />
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {renderTemplate(template.body_text, previewContact)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Recipient picker — side panel */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-3 lg:sticky lg:top-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Recipients</h2>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {selectedIds.size} of {activeContacts.length} active
              </span>
            </div>
            <ContactPickerInline
              contacts={activeContacts}
              selected={selectedIds}
              onChange={setSelectedIds}
            />
          </div>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {selectedIds.size > 0 && (
            <>
              {selectedIds.size} recipient{selectedIds.size === 1 ? "" : "s"} ·
              {" "}~{Math.ceil((selectedIds.size * sendInterval) / 60)} min to send all
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleCreate(false)} disabled={busy || !isValid}>
            Save as draft
          </Button>
          <Button onClick={() => setConfirmStart(true)} disabled={busy || !isValid}>
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? "Starting…" : `Start sending (${selectedIds.size})`}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title={`Start sending to ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}?`}
        description={
          <>
            <strong>{selectedIds.size}</strong> email{selectedIds.size === 1 ? "" : "s"} from <strong>{fromAddress}</strong> · 1 every {sendInterval}s ·
            roughly {Math.ceil((selectedIds.size * sendInterval) / 60)} min total.
            <p className="mt-2 text-xs">Already-sent emails can't be unsent. You can pause or cancel mid-send.</p>
          </>
        }
        confirmLabel={`Send to ${selectedIds.size}`}
        onConfirm={() => handleCreate(true)}
      />
    </Layout>
  );
}

// Inline contact picker — lives inside the compose form's side panel
// instead of opening a nested sheet. Has the same filters as the old
// ContactPickerSheet (search + target rating + area) but inline.
function ContactPickerInline({
  contacts,
  selected,
  onChange,
}: {
  contacts: OutreachContact[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("ALL");
  const debouncedSearch = useDebouncedValue(search, 200);

  // Distinct, sorted tag values across the loaded contact set. Drives the
  // tag dropdown so the operator can target "Target" prospects without
  // remembering every label they've ever used.
  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      if (c.tag && c.tag.trim()) set.add(c.tag.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      if (tagFilter === "__untagged__") {
        if (c.tag && c.tag.trim()) return false;
      } else if (tagFilter !== "ALL") {
        if ((c.tag ?? "").trim() !== tagFilter) return false;
      }
      if (q) {
        const hay = [c.email, c.practice_name, c.postcode, c.principal_dentist]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, debouncedSearch, tagFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      for (const c of filtered) next.delete(c.id);
    } else {
      for (const c of filtered) next.add(c.id);
    }
    onChange(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>
      <Select value={tagFilter} onValueChange={setTagFilter}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="All tags" />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          <SelectItem value="ALL">All tags</SelectItem>
          <SelectItem value="__untagged__">— untagged —</SelectItem>
          {knownTags.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {filtered.length} match · {selected.size} selected
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="hover:text-foreground underline disabled:opacity-50"
            disabled={filtered.length === 0}
          >
            {allFilteredSelected ? "Deselect filtered" : "Select filtered"}
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={clearAll} className="hover:text-foreground underline">
              Clear all
            </button>
          )}
        </div>
      </div>
      <div className="rounded-md border divide-y max-h-[420px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No matches.
          </div>
        ) : (
          filtered.map((c) => {
            const rating = ((c.custom?.target_rating as string) ?? "").toUpperCase();
            const area = ((c.custom?.area as string) ?? "").trim();
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/40 text-xs"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-foreground"
                  checked={selected.has(c.id)}
                  onChange={(e) => toggleOne(c.id, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate flex-1">{c.practice_name || c.email}</p>
                    {rating && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1 rounded text-[9px] font-medium uppercase tracking-wide border shrink-0",
                          PICKER_TARGET_TONE[rating] ?? "bg-muted text-muted-foreground border-transparent",
                        )}
                      >
                        {rating}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
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
  );
}
