import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import {
  Inbox,
  Mail,
  ExternalLink,
  MessageSquare,
  UserPlus,
  Search,
  Download,
  MoreVertical,
  Archive,
  CheckCircle2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ErrorState";
import {
  bulkUpdateLeadStatus,
  useLeads,
  useUpdateLead,
  type Lead,
  type LeadStatus,
} from "@/hooks/useLeads";
import { useTenants, type Practice } from "@/hooks/useTenants";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | LeadStatus;
type SortKey = "newest" | "oldest" | "stale_first";

const STATUS_META: Record<LeadStatus, { label: string; badge: string }> = {
  NEW: { label: "New", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  CONTACTED: { label: "Contacted", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  CONVERTED: { label: "Converted", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  ARCHIVED: { label: "Archived", badge: "bg-muted text-muted-foreground" },
};

const VALID_FILTERS: StatusFilter[] = ["all", "NEW", "CONTACTED", "CONVERTED", "ARCHIVED"];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "stale_first", label: "Stale leads first" },
];

// A NEW lead older than this is "stale" — operators should chase or archive.
const STALE_DAYS = 7;

function isStale(lead: Lead): boolean {
  if (lead.status !== "NEW") return false;
  return differenceInDays(new Date(), new Date(lead.created_at)) >= STALE_DAYS;
}

export default function Leads() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: leads, isLoading, error, refetch } = useLeads();

  const rawFilter = searchParams.get("status") as StatusFilter | null;
  const statusFilter: StatusFilter = rawFilter && VALID_FILTERS.includes(rawFilter) ? rawFilter : "all";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function setStatusFilter(next: StatusFilter) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") nextParams.delete("status");
    else nextParams.set("status", next);
    setSearchParams(nextParams, { replace: true });
  }

  // Reset selection on filter / search / sort changes — otherwise you'd
  // bulk-act on rows that scrolled off.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, debouncedSearch, sortBy]);

  const counts = useMemo(() => {
    const acc: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, ARCHIVED: 0 };
    let stale = 0;
    for (const l of leads ?? []) {
      acc[l.status]++;
      if (isStale(l)) stale++;
    }
    return { ...acc, stale };
  }, [leads]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    let rows: Lead[] = leads;
    if (statusFilter !== "all") rows = rows.filter((l) => l.status === statusFilter);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      rows = rows.filter((l) =>
        [l.name, l.email, l.message ?? ""].join(" ").toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (sortBy === "newest") {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
      // stale_first: stale NEW leads first (oldest first within), then
      // everything else newest first.
      sorted.sort((a, b) => {
        const aStale = isStale(a) ? 0 : 1;
        const bStale = isStale(b) ? 0 : 1;
        if (aStale !== bStale) return aStale - bStale;
        if (aStale === 0) return a.created_at.localeCompare(b.created_at);
        return b.created_at.localeCompare(a.created_at);
      });
    }
    return sorted;
  }, [leads, statusFilter, debouncedSearch, sortBy]);

  const selected = useMemo(
    () => (routeId ? leads?.find((l) => l.id === routeId) ?? null : null),
    [routeId, leads],
  );

  const closeDetail = () => {
    navigate({ pathname: "/leads", search: searchParams.toString() });
  };

  // Selection helpers
  const allOnPageSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));
  const someOnPageSelected = filtered.some((l) => selectedIds.has(l.id));
  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const l of filtered) next.delete(l.id);
      } else {
        for (const l of filtered) next.add(l.id);
      }
      return next;
    });
  };
  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkStatus = async (s: LeadStatus) => {
    setBulkBusy(true);
    try {
      const n = await bulkUpdateLeadStatus(Array.from(selectedIds), s);
      toast.success(`Marked ${n} lead${n === 1 ? "" : "s"} ${STATUS_META[s].label.toLowerCase()}`);
      clearSelection();
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const flat = filtered.map((l) => ({
      name: l.name,
      email: l.email,
      message: l.message ?? "",
      status: l.status,
      notes: l.notes ?? "",
      created_at: l.created_at,
      converted_to_tenant_id: l.converted_to_tenant_id ?? "",
    }));
    const csv = Papa.unparse(flat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${statusFilter}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${flat.length} lead${flat.length === 1 ? "" : "s"}`);
  };

  const total = leads?.length ?? 0;

  return (
    <Layout
      title="Leads"
      description={
        total > 0
          ? `${counts.NEW} new${counts.stale > 0 ? ` · ${counts.stale} stale` : ""} · ${total} total`
          : "No enquiries yet"
      }
      actions={
        <>
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export ({filtered.length})
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState title="Failed to load leads" error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading leads…
        </div>
      ) : !leads || leads.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No enquiries yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Submissions from the contact form on dentaloptima.co.uk land here.
          </p>
        </div>
      ) : (
        <>
          {/* Status filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "NEW", "CONTACTED", "CONVERTED", "ARCHIVED"] as StatusFilter[]).map((s) => {
              const isActive = statusFilter === s;
              const label = s === "all" ? "All" : STATUS_META[s as LeadStatus].label;
              const count = s === "all" ? total : counts[s as LeadStatus];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                    isActive
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card hover:bg-muted/60 text-muted-foreground",
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "text-[10px] rounded px-1 tabular-nums",
                      isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            {(statusFilter !== "all" || debouncedSearch.trim()) && (
              <span className="text-xs text-muted-foreground tabular-nums ml-1">
                {filtered.length} {filtered.length === 1 ? "match" : "matches"}
              </span>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="rounded-md border bg-accent/40 p-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium px-1.5">{selectedIds.size} selected</span>
              <Button size="sm" variant="ghost" onClick={() => handleBulkStatus("CONTACTED")} disabled={bulkBusy} className="h-7 text-xs">
                Mark contacted
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkStatus("ARCHIVED")} disabled={bulkBusy} className="h-7 text-xs">
                <Archive className="h-3 w-3 mr-1" />Archive
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy} className="h-7 text-xs ml-auto">
                Clear
              </Button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              No leads match the current filter / search.
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead className="border-b bg-muted/30">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-foreground"
                          checked={allOnPageSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                          }}
                          onChange={togglePageSelection}
                          aria-label="Select all on page"
                        />
                      </th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">Name</th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">Email</th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">Status</th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">Received</th>
                      <th className="w-10 px-1 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((l) => (
                      <LeadRow
                        key={l.id}
                        lead={l}
                        selected={selectedIds.has(l.id)}
                        onToggleSelect={() => toggleRowSelection(l.id)}
                        onOpen={() => navigate(`/leads/${l.id}`)}
                        onChange={() => refetch()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <LeadDetailSheet lead={selected} onClose={closeDetail} />
    </Layout>
  );
}

function LeadRow({
  lead,
  selected,
  onToggleSelect,
  onOpen,
  onChange,
}: {
  lead: Lead;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onChange: () => void;
}) {
  const update = useUpdateLead();
  const hasMessage = Boolean(lead.message?.trim());
  const stale = isStale(lead);

  const setStatus = async (status: LeadStatus) => {
    try {
      await update.mutateAsync({ id: lead.id, patch: { status } });
      toast.success(`Marked ${STATUS_META[status].label.toLowerCase()}`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <tr
      className={cn(
        "cursor-pointer hover:bg-muted/30 transition-colors",
        selected && "bg-accent/30",
        stale && !selected && "bg-amber-50/40 dark:bg-amber-950/10",
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-row-actions]") || target.closest("[data-row-select]")) return;
        onOpen();
      }}
    >
      <td className="px-3 py-3.5" data-row-select>
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-foreground"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${lead.email}`}
        />
      </td>
      <td className="px-4 sm:px-5 py-3.5 font-medium">
        <div className="flex items-center gap-2">
          {lead.name}
          {hasMessage && (
            <MessageSquare
              className="h-3.5 w-3.5 text-muted-foreground shrink-0"
              aria-label="Has message"
            />
          )}
          {stale && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title={`Untouched for ${differenceInDays(new Date(), new Date(lead.created_at))} days`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              stale
            </span>
          )}
        </div>
      </td>
      <td className="px-4 sm:px-5 py-3.5 text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[240px]">{lead.email}</span>
        </div>
      </td>
      <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", STATUS_META[lead.status].badge)}>
          {STATUS_META[lead.status].label}
        </span>
      </td>
      <td className="px-4 sm:px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
      </td>
      <td className="px-1 py-3.5" data-row-actions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={update.isPending}
              className="p-1 rounded hover:bg-accent"
              aria-label="Row actions"
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOpen}>
              Open detail
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {lead.status !== "CONTACTED" && (
              <DropdownMenuItem onClick={() => setStatus("CONTACTED")}>
                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                Mark contacted
              </DropdownMenuItem>
            )}
            {lead.status !== "NEW" && (
              <DropdownMenuItem onClick={() => setStatus("NEW")}>
                Reset to New
              </DropdownMenuItem>
            )}
            {lead.status !== "ARCHIVED" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setStatus("ARCHIVED")}>
                  <Archive className="h-3 w-3 mr-1.5" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function LeadDetailSheet({
  lead,
  onClose,
}: {
  lead: Lead | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const update = useUpdateLead();
  const { data: tenants } = useTenants();

  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [notes, setNotes] = useState("");
  const [convertedTo, setConvertedTo] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setStatus(lead.status);
      setNotes(lead.notes ?? "");
      setConvertedTo(lead.converted_to_tenant_id ?? null);
    }
  }, [lead]);

  const convertedTenant = useMemo(
    () => (convertedTo ? tenants?.find((t) => t.id === convertedTo) ?? null : null),
    [convertedTo, tenants],
  );

  if (!lead) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const dirty =
    status !== lead.status ||
    (notes ?? "") !== (lead.notes ?? "") ||
    (convertedTo ?? null) !== (lead.converted_to_tenant_id ?? null);

  async function handleSave() {
    if (!lead) return;
    try {
      await update.mutateAsync({
        id: lead.id,
        patch: {
          status,
          notes: notes.trim() || null,
          converted_to_tenant_id: convertedTo,
        },
      });
      toast.success("Lead updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Sheet open={Boolean(lead)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lead.name}</SheetTitle>
          <SheetDescription>
            Received {format(new Date(lead.created_at), "d MMM yyyy, HH:mm")} from {lead.email}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 flex-1">
          {/* Contact block */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a
                href={`mailto:${lead.email}`}
                className="text-primary hover:underline truncate"
              >
                {lead.email}
              </a>
            </div>
            {lead.ip_address && (
              <div className="text-xs text-muted-foreground font-mono">
                IP: {lead.ip_address}
              </div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message</Label>
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[60px]">
              {lead.message?.trim() ? (
                lead.message
              ) : (
                <span className="text-muted-foreground italic">
                  No message — they just left name + email.
                </span>
              )}
            </div>
          </div>

          {/* Stage-gated next action. */}
          {lead.status === "NEW" && (
            <div className="rounded-md border border-blue-300/40 bg-blue-50/60 dark:bg-blue-950/20 p-3">
              <div className="flex items-start gap-2.5">
                <Mail className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Reached out?</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">
                    Mark this lead as contacted once you've started the conversation. Convert later when they're ready.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setStatus("CONTACTED")}>
                    Mark as contacted
                  </Button>
                </div>
              </div>
            </div>
          )}

          {lead.status === "CONTACTED" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-2.5">
                <UserPlus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Ready to convert?</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">
                    Opens the new-tenant form with name + email prefilled. The lead is auto-linked once the practice is created.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams({
                        fromLead: lead.id,
                        name: lead.name,
                        email: lead.email,
                      });
                      navigate(`/tenants?${params.toString()}`);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Create tenant from this lead
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
              <SelectTrigger id="lead-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">New</SelectItem>
                <SelectItem value="CONTACTED">Contacted</SelectItem>
                <SelectItem value="CONVERTED">Converted to customer</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Linked tenant — searchable picker */}
          {status === "CONVERTED" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Linked tenant</Label>
              <TenantPicker value={convertedTo} onChange={setConvertedTo} tenants={tenants ?? []} />
              {convertedTenant && (
                <a
                  href={`/tenants/${convertedTenant.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  Open tenant
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-notes" className="text-xs text-muted-foreground">
              Internal notes
            </Label>
            <Textarea
              id="lead-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call summary, objections, follow-up date…"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6 pt-4 border-t shrink-0">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button onClick={handleSave} disabled={!dirty || update.isPending} className="flex-1">
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Searchable tenant picker — reused pattern from Support's NewThreadSheet.
// Inline filter on top of a scrollable list, Select-like but works at any
// tenant list size.
function TenantPicker({
  value,
  onChange,
  tenants,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  tenants: Practice[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return tenants;
    const q = query.trim().toLowerCase();
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [tenants, query]);
  const selected = tenants.find((t) => t.id === value) ?? null;

  return (
    <div className="rounded-md border bg-background">
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={selected ? selected.name : "Search practices…"}
          className="pl-9 border-0 focus-visible:ring-0 rounded-none"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
            value === null && "bg-accent/60",
          )}
        >
          <span className="text-muted-foreground italic">(Not linked yet)</span>
          {value === null && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
        </button>
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">No matches.</div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
                value === t.id && "bg-accent/60",
              )}
            >
              <span className="truncate">{t.name}</span>
              {value === t.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
