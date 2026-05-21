import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Papa from "papaparse";
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
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  Search,
  Send,
  Square,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelCampaign,
  fetchCampaign,
  pauseCampaign,
  retryFailedSends,
  startCampaign,
  type OutreachCampaign,
} from "@/hooks/useOutreachCampaigns";
import { useCampaignSends, type CampaignSend } from "@/hooks/useCampaignSends";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const SENDS_PAGE_SIZE = 50;

const SEND_STATUS_TONE: Record<string, string> = {
  QUEUED:      "bg-slate-100 text-slate-700 border-slate-200",
  SENDING:     "bg-sky-100 text-sky-700 border-sky-200",
  SENT:        "bg-blue-100 text-blue-700 border-blue-200",
  DELIVERED:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  BOUNCED:     "bg-amber-100 text-amber-700 border-amber-200",
  COMPLAINED:  "bg-red-100 text-red-700 border-red-200",
  FAILED:      "bg-red-100 text-red-700 border-red-200",
  SKIPPED:     "bg-slate-100 text-slate-500 border-slate-200",
};

type SendFilter = "all" | "queued" | "sent" | "opened" | "clicked" | "bounced" | "failed";

const SEND_FILTERS: Array<{ key: SendFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
  { key: "bounced", label: "Bounced" },
  { key: "failed", label: "Failed" },
];

function matchesFilter(send: CampaignSend, filter: SendFilter): boolean {
  if (filter === "all") return true;
  if (filter === "queued") return send.status === "QUEUED" || send.status === "SENDING";
  if (filter === "sent") return send.status === "SENT" || send.status === "DELIVERED";
  if (filter === "opened") return send.open_count > 0;
  if (filter === "clicked") return send.click_count > 0;
  if (filter === "bounced") return send.status === "BOUNCED" || send.status === "COMPLAINED";
  if (filter === "failed") return send.status === "FAILED" || send.status === "SKIPPED";
  return true;
}

export default function OutreachCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const { sends, loading: sendsLoading, reload: reloadSends } = useCampaignSends(id ?? null);
  const [previewSend, setPreviewSend] = useState<CampaignSend | null>(null);

  const [filter, setFilter] = useState<SendFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);

  const reloadCampaign = async () => {
    if (!id) return;
    const c = await fetchCampaign(id);
    setCampaign(c);
  };

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then((c) => {
      setCampaign(c);
      setCampaignLoading(false);
    });
  }, [id]);

  // Reset to page 0 whenever filter/search changes — otherwise you might
  // be on page 5 of "all" and switch to "failed" which has only one page.
  useEffect(() => {
    setPage(0);
  }, [filter, debouncedSearch]);

  // Status counts driven by the current sends array.
  const filterCounts = useMemo(() => {
    const acc: Record<SendFilter, number> = {
      all: sends.length,
      queued: 0,
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
    };
    for (const s of sends) {
      if (matchesFilter(s, "queued")) acc.queued++;
      if (matchesFilter(s, "sent")) acc.sent++;
      if (matchesFilter(s, "opened")) acc.opened++;
      if (matchesFilter(s, "clicked")) acc.clicked++;
      if (matchesFilter(s, "bounced")) acc.bounced++;
      if (matchesFilter(s, "failed")) acc.failed++;
    }
    return acc;
  }, [sends]);

  const filteredSends = useMemo(() => {
    let rows = sends.filter((s) => matchesFilter(s, filter));
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      rows = rows.filter((s) => {
        const hay = [
          s.contact?.email ?? "",
          s.contact?.first_name ?? "",
          s.contact?.last_name ?? "",
          s.contact?.practice_name ?? "",
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [sends, filter, debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil(filteredSends.length / SENDS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedSends = useMemo(
    () => filteredSends.slice(safePage * SENDS_PAGE_SIZE, (safePage + 1) * SENDS_PAGE_SIZE),
    [filteredSends, safePage],
  );

  const wrap = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await reloadCampaign();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    if (filteredSends.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const flat = filteredSends.map((s) => ({
      email: s.contact?.email ?? "",
      first_name: s.contact?.first_name ?? "",
      last_name: s.contact?.last_name ?? "",
      practice_name: s.contact?.practice_name ?? "",
      status: s.status,
      sent_at: s.sent_at ?? "",
      delivered_at: s.delivered_at ?? "",
      first_opened_at: s.first_opened_at ?? "",
      open_count: s.open_count,
      first_clicked_at: s.first_clicked_at ?? "",
      click_count: s.click_count,
      bounced_at: s.bounced_at ?? "",
      complained_at: s.complained_at ?? "",
      failed_at: s.failed_at ?? "",
      failure_reason: s.failure_reason ?? "",
    }));
    const csv = Papa.unparse(flat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const slug = (campaign?.name ?? "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-${filter}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${flat.length} send${flat.length === 1 ? "" : "s"}`);
  };

  const handleRetry = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const n = await retryFailedSends(id);
      toast.success(n > 0 ? `Re-queued ${n} send${n === 1 ? "" : "s"}` : "Nothing to retry");
      reloadSends();
      await reloadCampaign();
      setConfirmRetry(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  };

  if (campaignLoading) {
    return (
      <Layout title="Campaign" description="">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Layout>
    );
  }
  if (!campaign) {
    return (
      <Layout title="Campaign not found" description="">
        <p className="text-sm text-muted-foreground">This campaign doesn't exist or was deleted.</p>
        <Link to="/outreach/campaigns" className="text-sm underline mt-2 inline-block">Back to campaigns</Link>
      </Layout>
    );
  }

  const failedCount = campaign.failed_count + campaign.skipped_count;

  return (
    <Layout
      title={campaign.name}
      description={`From ${campaign.from_address} · ${campaign.template?.name ?? "(no template)"} · ${campaign.status.toLowerCase()}`}
      actions={
        <>
          {/* Status-aware controls — operators can pause/resume/cancel
              without going back to the list. */}
          {campaign.status === "DRAFT" && campaign.total_count > 0 && (
            <Button size="sm" onClick={() => wrap(() => startCampaign(campaign.id), "Started")} disabled={busy}>
              <Send className="h-3.5 w-3.5 mr-1.5" />Start sending
            </Button>
          )}
          {campaign.status === "SENDING" && (
            <Button size="sm" variant="outline" onClick={() => wrap(() => pauseCampaign(campaign.id), "Paused")} disabled={busy}>
              <Pause className="h-3.5 w-3.5 mr-1.5" />Pause
            </Button>
          )}
          {campaign.status === "PAUSED" && (
            <Button size="sm" onClick={() => wrap(() => startCampaign(campaign.id), "Resumed")} disabled={busy}>
              <Play className="h-3.5 w-3.5 mr-1.5" />Resume
            </Button>
          )}
          {(campaign.status === "SENDING" || campaign.status === "PAUSED") && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
              <Square className="h-3.5 w-3.5 mr-1.5" />Cancel
            </Button>
          )}
          {failedCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => setConfirmRetry(true)} disabled={busy}>
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />Retry {failedCount} failed
            </Button>
          )}
          <Link to="/outreach/campaigns">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1.5" />Back
            </Button>
          </Link>
        </>
      }
    >
      {/* Stat tiles. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2">
        <StatTile label="Total" value={campaign.total_count} />
        <StatTile label="Sent" value={campaign.sent_count} rate={pct(campaign.sent_count, campaign.total_count)} />
        <StatTile label="Delivered" value={campaign.delivered_count} tone="emerald" rate={pct(campaign.delivered_count, campaign.sent_count)} />
        <StatTile label="Opened" value={campaign.opened_count} tone="blue" rate={pct(campaign.opened_count, campaign.delivered_count)} />
        <StatTile label="Clicked" value={campaign.clicked_count} tone="indigo" rate={pct(campaign.clicked_count, campaign.delivered_count)} />
        <StatTile label="Bounced" value={campaign.bounced_count} tone="amber" rate={pct(campaign.bounced_count, campaign.sent_count)} />
        <StatTile
          label="Failed"
          value={failedCount + campaign.complained_count}
          tone="red"
          rate={pct(failedCount + campaign.complained_count, campaign.total_count)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sends table */}
        <div className="lg:col-span-3 space-y-3">
          {/* Sends toolbar — search + export */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipient name, email, practice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={filteredSends.length === 0}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export {filter === "all" ? "all" : filter} ({filteredSends.length})
            </Button>
          </div>

          {/* Sends filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {SEND_FILTERS.map((f) => {
              const isActive = filter === f.key;
              const n = filterCounts[f.key];
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
          </div>

          {sendsLoading ? (
            <p className="text-sm text-muted-foreground">Loading recipients…</p>
          ) : sends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipients on this campaign.</p>
          ) : filteredSends.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No sends match the current filter / search.
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Recipient</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium">Sent</th>
                      <th className="text-left px-4 py-2.5 font-medium">Opens</th>
                      <th className="text-left px-4 py-2.5 font-medium">Clicks</th>
                      <th className="text-left px-4 py-2.5 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSends.map((s) => (
                      <SendRow key={s.id} send={s} onPreview={() => setPreviewSend(s)} />
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs">
                  <span className="text-muted-foreground">
                    {safePage * SENDS_PAGE_SIZE + 1}–{Math.min((safePage + 1) * SENDS_PAGE_SIZE, filteredSends.length)} of {filteredSends.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2 text-muted-foreground">
                      Page {safePage + 1} of {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={safePage >= pageCount - 1}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata sidebar */}
        <div className="lg:col-span-1">
          <CampaignMetadata campaign={campaign} />
        </div>
      </div>

      {previewSend && (
        <PreviewSheet send={previewSend} onClose={() => setPreviewSend(null)} />
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel "${campaign.name}"?`}
        description="Already-sent emails stay sent. Queued ones won't go out."
        confirmLabel="Cancel campaign"
        cancelLabel="Keep sending"
        variant="destructive"
        onConfirm={() => wrap(async () => {
          await cancelCampaign(campaign.id);
          setConfirmCancel(false);
        }, "Campaign cancelled")}
      />
      <ConfirmDialog
        open={confirmRetry}
        onOpenChange={setConfirmRetry}
        title={`Retry ${failedCount} failed send${failedCount === 1 ? "" : "s"}?`}
        description="Resets failed/skipped sends to QUEUED. The cron worker will pick them up on its next pass. Already-delivered sends are not affected."
        confirmLabel={`Re-queue ${failedCount}`}
        onConfirm={handleRetry}
      />
    </Layout>
  );
}

// Read-only metadata sidebar — surfaces all the campaign config that
// otherwise lives in the description line, plus full timestamps.
function CampaignMetadata({ campaign }: { campaign: OutreachCampaign }) {
  const elapsed = campaign.started_at && !campaign.completed_at ? "in progress" : null;
  const totalSent = campaign.sent_count;
  const eta =
    campaign.status === "SENDING" && campaign.total_count > totalSent
      ? Math.ceil(((campaign.total_count - totalSent) * campaign.send_interval_seconds) / 60)
      : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3 text-xs lg:sticky lg:top-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Campaign info
      </h3>
      <div className="space-y-1.5">
        <Field label="Status" value={campaign.status.toLowerCase()} />
        <Field label="Template" value={campaign.template?.name ?? "(none)"} />
        <Field label="From" value={campaign.from_address} mono />
        {campaign.reply_to_address && <Field label="Reply-to" value={campaign.reply_to_address} mono />}
        <Field label="Send pace" value={`1 every ${campaign.send_interval_seconds}s`} />
        <Field label="Recipients" value={campaign.total_count.toLocaleString("en-GB")} />
      </div>

      <div className="border-t pt-3 space-y-1.5">
        <Field label="Created" value={format(new Date(campaign.created_at), "d MMM yyyy HH:mm")} />
        {campaign.started_at && (
          <Field label="Started" value={format(new Date(campaign.started_at), "d MMM yyyy HH:mm")} />
        )}
        {campaign.completed_at && (
          <Field label="Completed" value={format(new Date(campaign.completed_at), "d MMM yyyy HH:mm")} />
        )}
        {elapsed && eta !== null && (
          <Field label="ETA" value={`~${eta} min remaining`} />
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right break-all", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}

function pct(part: number, whole: number): string | null {
  if (!whole) return null;
  const n = (part / whole) * 100;
  return n < 10 ? `${n.toFixed(1)}%` : `${Math.round(n)}%`;
}

function StatTile({
  label,
  value,
  tone,
  rate,
}: {
  label: string;
  value: number;
  tone?: string;
  rate?: string | null;
}) {
  const toneClass = tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "indigo" ? "text-indigo-700"
    : tone === "amber" ? "text-amber-700"
    : tone === "red" ? "text-red-700"
    : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={cn("text-lg font-semibold", toneClass)}>{value}</p>
        {rate && <p className="text-xs text-muted-foreground">{rate}</p>}
      </div>
    </div>
  );
}

function SendRow({ send, onPreview }: { send: CampaignSend; onPreview: () => void }) {
  const fullName = [send.contact?.first_name, send.contact?.last_name].filter(Boolean).join(" ");
  const isArchived = !!send.contact?.archived_at;
  const contactMissing = !send.contact;
  return (
    <tr className="border-t hover:bg-accent/30 transition-colors">
      <td className="px-4 py-2.5">
        <div className={cn("text-sm", (isArchived || contactMissing) && "text-muted-foreground")}>
          {contactMissing ? (
            <span className="italic">(contact deleted)</span>
          ) : (
            <>
              {fullName || send.contact?.email}
              {send.contact?.practice_name && (
                <span className="text-muted-foreground text-xs ml-1">· {send.contact.practice_name}</span>
              )}
              {isArchived && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide bg-muted text-muted-foreground border">
                  archived
                </span>
              )}
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {send.contact?.email ?? "—"}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border", SEND_STATUS_TONE[send.status])}>
          {send.status.toLowerCase()}
        </span>
        {send.failure_reason && (
          <p className="text-[11px] text-red-600 mt-0.5 truncate max-w-[280px]" title={send.failure_reason}>
            {send.failure_reason}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {send.sent_at ? format(new Date(send.sent_at), "d MMM HH:mm") : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {send.open_count > 0 ? (
          <span className="font-semibold">
            {send.open_count}
            {send.last_opened_at && (
              <span className="text-muted-foreground font-normal ml-1">
                · {format(new Date(send.last_opened_at), "d MMM HH:mm")}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {send.click_count > 0 ? (
          <span className="font-semibold">{send.click_count}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <button
          onClick={onPreview}
          disabled={!send.rendered_subject}
          className="text-xs underline text-foreground/70 hover:text-foreground disabled:opacity-30 disabled:no-underline"
        >
          View email
        </button>
      </td>
    </tr>
  );
}

function PreviewSheet({ send, onClose }: { send: CampaignSend; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{send.rendered_subject}</SheetTitle>
          <SheetDescription className="text-left">
            Sent to {send.contact?.email}
            {send.sent_at && ` · ${format(new Date(send.sent_at), "d MMM yyyy HH:mm")}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1">
          <div className="rounded-lg border bg-background p-4 text-sm">
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {send.rendered_body_text || "(no body)"}
            </p>
          </div>

          <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Status:</span> {send.status}</p>
            {send.delivered_at && <p><span className="text-muted-foreground">Delivered:</span> {format(new Date(send.delivered_at), "d MMM yyyy HH:mm")}</p>}
            {send.first_opened_at && <p><span className="text-muted-foreground">First opened:</span> {format(new Date(send.first_opened_at), "d MMM yyyy HH:mm")}</p>}
            {send.last_opened_at && send.last_opened_at !== send.first_opened_at && <p><span className="text-muted-foreground">Last opened:</span> {format(new Date(send.last_opened_at), "d MMM yyyy HH:mm")} ({send.open_count} opens total)</p>}
            {send.first_clicked_at && <p><span className="text-muted-foreground">First clicked:</span> {format(new Date(send.first_clicked_at), "d MMM yyyy HH:mm")} ({send.click_count} clicks)</p>}
            {send.bounced_at && <p className="text-amber-700"><span className="text-muted-foreground">Bounced:</span> {format(new Date(send.bounced_at), "d MMM yyyy HH:mm")}</p>}
            {send.complained_at && <p className="text-red-700"><span className="text-muted-foreground">Spam complaint:</span> {format(new Date(send.complained_at), "d MMM yyyy HH:mm")}</p>}
            {send.failure_reason && <p className="text-red-700"><span className="text-muted-foreground">Failure:</span> {send.failure_reason}</p>}
            {send.postmark_message_id && (
              <p className="font-mono text-[10px] text-muted-foreground mt-2 break-all">
                Postmark MessageID: {send.postmark_message_id}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
