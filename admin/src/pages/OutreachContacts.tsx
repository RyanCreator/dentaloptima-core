import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Users, Archive, ArchiveRestore, MoreVertical, ChevronLeft, ChevronRight, Pencil, Plus, Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveContact,
  bulkArchiveContacts,
  bulkImportContacts,
  bulkUpdateContactStatus,
  createContact,
  fetchAllContacts,
  restoreContact,
  updateContact,
  updateContactStatus,
  useOutreachContactCounts,
  useOutreachContactTags,
  type TagFilter,
  type AreaFilter,
  type LastEmailedFilter,
  useOutreachContactAreas,
  useOutreachContacts,
  type ContactSortKey,
  type OutreachContact,
  type OutreachContactStatus,
} from "@/hooks/useOutreachContacts";
import {
  addContactsToCampaign,
  fetchDraftCampaigns,
  type OutreachCampaign,
} from "@/hooks/useOutreachCampaigns";
import {
  fetchActiveTemplates,
  type OutreachTemplate,
} from "@/hooks/useOutreachTemplates";
import { Send, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const TARGET_OPTIONS = ["TARGET", "MAYBE", "LATER", "GROUP", "NO"] as const;

const STATUS_LABEL: Record<OutreachContactStatus | "ALL", string> = {
  ALL: "All",
  ACTIVE: "Active",
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  COMPLAINED: "Spam complaint",
};

// Combined filter key — collapses the old (status + showArchived) tuple
// into a single FilterKey so it slots into a pill row. ARCHIVED is the
// only value that flips showArchived=true; everything else implies false.
type FilterKey = "ACTIVE" | "ALL" | "UNSUBSCRIBED" | "BOUNCED" | "COMPLAINED" | "ARCHIVED";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "ACTIVE", label: "Active" },
  { key: "ALL", label: "All" },
  { key: "UNSUBSCRIBED", label: "Unsubscribed" },
  { key: "BOUNCED", label: "Bounced" },
  { key: "COMPLAINED", label: "Spam complaint" },
  { key: "ARCHIVED", label: "Archived" },
];

const SORT_OPTIONS: Array<{ key: ContactSortKey; label: string }> = [
  { key: "created_desc", label: "Newest first" },
  { key: "created_asc", label: "Oldest first" },
  { key: "last_emailed_asc", label: "Last emailed (oldest)" },
  { key: "last_emailed_desc", label: "Last emailed (newest)" },
  { key: "email_asc", label: "Email (A–Z)" },
  { key: "practice_asc", label: "Practice (A–Z)" },
];

const STATUS_TONE: Record<OutreachContactStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  UNSUBSCRIBED: "bg-slate-100 text-slate-700 border-slate-200",
  BOUNCED: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLAINED: "bg-red-100 text-red-700 border-red-200",
};

// Map free-text tags to pill colours. We can't enumerate every possible
// value (operators add their own), so we recognise common ones and fall
// back to a neutral slate. Matching is case-insensitive and prefix-
// based so "Target" / "TARGET" / "target prospect" all hit the same
// tone, and the chain-name aliases (Portman / Portman Group / etc.)
// share a single corporate-group tone.
/**
 * Compact "last emailed" label for the per-row indicator. Tuned for
 * operator scanning — exact dates would be too noisy and absolute
 * timestamps don't answer "is this stale?" at a glance.
 *   null   → "Never emailed"
 *   today  → "Emailed today"
 *   1 day  → "Emailed yesterday"
 *   2–6d   → "Emailed Nd ago"
 *   7–29d  → "Emailed Nw ago"
 *   30d+   → "Emailed N mo ago"
 */
function formatLastEmailed(lastEmailedAt: string | null): string {
  if (!lastEmailedAt) return "Never emailed";
  const then = new Date(lastEmailedAt).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / 86_400_000);
  if (days < 1) return "Emailed today";
  if (days === 1) return "Emailed yesterday";
  if (days < 7) return `Emailed ${days}d ago`;
  if (days < 30) return `Emailed ${Math.floor(days / 7)}w ago`;
  return `Emailed ${Math.floor(days / 30)} mo ago`;
}

function tagTone(raw: string): string {
  const t = raw.trim().toLowerCase();
  // Active prospect — green so "go after this one" reads at a glance.
  if (t === "target") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  // Can't reach / unknown — neutral slate.
  if (t === "nf" || t === "not found" || t === "no website" || t === "???" || t.startsWith("ryan")) {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  // Excluded — practice no longer trading.
  if (t === "closed") return "bg-red-50 text-red-700 border-red-200";
  // Excluded by policy — not a target.
  if (t === "no") return "bg-zinc-100 text-zinc-600 border-zinc-200";
  // Corporate group / NHS — exclude from independent-practice outreach.
  if (
    t === "group" ||
    t === "nhs" ||
    t === "portman" || t === "portman group" ||
    t === "bupa" ||
    t === "rodericks" ||
    t === "my dentist" ||
    t === "dental focus"
  ) {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  // Anything else — neutral default so unknown tags still render cleanly.
  return "bg-slate-100 text-slate-700 border-slate-200";
}

// Column-name candidates we'll auto-detect when reading the CSV header row.
// Lowercase + collapsed-whitespace match. First match wins. Includes the
// fields the download-template uses verbatim, plus loose aliases so a
// CSV exported from another tool still maps cleanly.
const FIELD_ALIASES: Record<string, string[]> = {
  practice_name: ["dental practice name", "practice_name", "practice", "practice name", "company", "business", "organisation", "organization", "clinic"],
  postcode: ["postcode", "post code", "post-code", "zip", "zip code"],
  website: ["website address", "website", "url", "site"],
  email: ["email address", "email", "e-mail", "mail"],
  principal_dentist: ["principle dentist/provider", "principal dentist/provider", "principal dentist", "principle dentist", "principal", "principle", "provider", "lead dentist", "owner"],
  // The "Status" column from operator spreadsheets is the prospecting
  // workflow tag (Target / NF / Closed / Portman / etc.), NOT the email
  // deliverability enum. Mapped into the `tag` text column.
  tag: ["status / tag", "tag", "status", "state", "stage", "pipeline", "category"],
  notes: ["comments", "comment", "notes", "note", "remarks"],
  // Legacy fallbacks — accepted so older CSVs (with split first/last
  // and a separate phone column) still import without breaking.
  first_name: ["first_name", "firstname", "first name", "given name"],
  last_name: ["last_name", "lastname", "last name", "surname", "family name"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "contact"],
};

function autoMapColumns(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {
    practice_name: null,
    postcode: null,
    website: null,
    email: null,
    principal_dentist: null,
    tag: null,
    notes: null,
    first_name: null,
    last_name: null,
    phone: null,
  };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const normalisedHeaders = headers.map(norm);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalisedHeaders.indexOf(alias);
      if (idx >= 0) {
        map[field] = headers[idx];
        break;
      }
    }
  }
  return map;
}

// CSV template matching the user-facing column spec. Quoting is added by
// Papa later; this is the human-readable source. Headers MUST match the
// FIELD_ALIASES first-entry strings so auto-detect picks them up.
const CSV_TEMPLATE_HEADERS = [
  "Dental practice name",
  "Postcode",
  "Website address",
  "Email address",
  "Principle dentist/provider",
  "Status / tag",
  "Comments",
];

function downloadCsvTemplate() {
  // Headers-only template. One blank row beneath them so the operator
  // immediately sees where to start typing. We deliberately don't ship
  // example rows — they'd risk being imported as real contacts if the
  // operator overlooked them, and the header names alone are explicit
  // enough that the column purpose is unambiguous.
  const rows = [Object.fromEntries(CSV_TEMPLATE_HEADERS.map((h) => [h, ""]))];
  const csv = Papa.unparse({ fields: CSV_TEMPLATE_HEADERS, data: rows });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dentaloptima-contacts-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PAGE_SIZE = 100;

export default function OutreachContacts() {
  const [filter, setFilter] = useState<FilterKey>("ACTIVE");
  const [tagFilter, setTagFilter] = useState<TagFilter>("ALL");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("ALL");
  const [lastEmailedFilter, setLastEmailedFilter] = useState<LastEmailedFilter>("ALL");
  const { areas: knownAreas } = useOutreachContactAreas();
  const navigate = useNavigate();
  // Add-to-campaign popover state. We load draft campaigns when the
  // popover opens so the list is current at click-time (someone could
  // have created a draft in a sibling tab since the page loaded).
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [draftCampaigns, setDraftCampaigns] = useState<OutreachCampaign[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [sortBy, setSortBy] = useState<ContactSortKey>("created_desc");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<OutreachContact | null>(null);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const showArchived = filter === "ARCHIVED";
  const status: OutreachContactStatus | "ALL" = showArchived ? "ALL" : filter;

  // Reset page + selection on any filter / sort / search change.
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [filter, tagFilter, areaFilter, lastEmailedFilter, debouncedSearch, sortBy]);

  const { contacts, totalCount, loading, reload } = useOutreachContacts({
    status,
    search: debouncedSearch,
    tag: tagFilter,
    area: areaFilter,
    lastEmailed: lastEmailedFilter,
    showArchived,
    sortBy,
    page,
    pageSize: PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const { counts, reload: reloadCounts } = useOutreachContactCounts();
  const { tags: knownTags, reload: reloadTags } = useOutreachContactTags();

  const refreshAll = () => {
    reload();
    reloadCounts();
    reloadTags();
  };

  // Selection helpers
  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const someOnPageSelected = contacts.some((c) => selectedIds.has(c.id));
  const togglePageSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const c of contacts) next.delete(c.id);
      } else {
        for (const c of contacts) next.add(c.id);
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

  const handleBulkArchive = async () => {
    setBulkBusy(true);
    try {
      const n = await bulkArchiveContacts(Array.from(selectedIds));
      toast.success(`Archived ${n} contact${n === 1 ? "" : "s"}`);
      clearSelection();
      refreshAll();
      setConfirmBulkArchive(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkStatus = async (s: OutreachContactStatus) => {
    setBulkBusy(true);
    try {
      const n = await bulkUpdateContactStatus(Array.from(selectedIds), s);
      toast.success(`Marked ${n} contact${n === 1 ? "" : "s"} ${STATUS_LABEL[s].toLowerCase()}`);
      clearSelection();
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBulkBusy(false);
    }
  };

  // Build a CSV from any contact list and trigger a download. Single helper
  // so "Export all" and "Export selection" share the formatting + filename
  // logic (filename label changes per mode).
  const downloadCsv = (rows: OutreachContact[], label: string) => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const flat = rows.map((c) => ({
      email: c.email,
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      practice_name: c.practice_name ?? "",
      postcode: c.postcode ?? "",
      website: c.website ?? "",
      principal_dentist: c.principal_dentist ?? "",
      phone: c.phone ?? "",
      tag: c.tag ?? "",
      status: c.status,
      source: c.source ?? "",
      created_at: c.created_at,
      last_emailed_at: c.last_emailed_at ?? "",
      notes: c.notes ?? "",
    }));
    const csv = Papa.unparse(flat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${label}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} contact${rows.length === 1 ? "" : "s"}`);
  };

  // Toolbar export — pulls EVERY row matching the current filter / search
  // (across all pages). Batched 1000-at-a-time so it's fine for thousands
  // of contacts.
  const handleExportAll = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllContacts({
        status,
        search: debouncedSearch,
        showArchived,
      });
      downloadCsv(rows, filter.toLowerCase());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Bulk-action export — only the rows the operator has ticked. Selection
  // can span multiple pages, and the visible-page list doesn't necessarily
  // contain all selected rows, so we re-fetch by id to guarantee complete
  // data for export.
  const handleExportSelection = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const rows = await fetchAllContacts({ ids: Array.from(selectedIds) });
      downloadCsv(rows, "selection");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout
      title="Contacts"
      description={`${counts.ACTIVE} active · ${counts.ALL} total · ${counts.ARCHIVED} archived`}
      actions={
        <>
          <Input
            placeholder="Search practice, postcode, dentist, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-[260px]"
          />
          <Select value={tagFilter} onValueChange={(v) => setTagFilter(v as TagFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All tags" />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="ALL">All tags</SelectItem>
              <SelectItem value="UNTAGGED">— untagged —</SelectItem>
              {knownTags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Postcode-area filter. Auto-extracted from each contact's
              postcode, so the dropdown only shows areas with at least
              one matching contact. "All areas" disables. */}
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="ALL">All areas</SelectItem>
              {knownAreas.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Last-emailed filter — surfaces stale prospects (most useful
              for outreach) and the inverse "recently contacted" cohort. */}
          <Select
            value={lastEmailedFilter}
            onValueChange={(v) => setLastEmailedFilter(v as LastEmailedFilter)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Last emailed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Last emailed: any</SelectItem>
              <SelectItem value="NEVER">Never emailed</SelectItem>
              <SelectItem value="30D+">Not in 30+ days</SelectItem>
              <SelectItem value="60D+">Not in 60+ days</SelectItem>
              <SelectItem value="90D+">Not in 90+ days</SelectItem>
              <SelectItem value="RECENT_7">Emailed in last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as ContactSortKey)}>
            <SelectTrigger className="w-[200px]">
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
            onClick={handleExportAll}
            disabled={exporting || totalCount === 0}
            title={`Export all ${totalCount} matching contact${totalCount === 1 ? "" : "s"}`}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {exporting ? "Exporting…" : `Export all (${totalCount})`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadCsvTemplate}
            title="Download the CSV template with the correct column headers"
          >
            <Download className="h-4 w-4 mr-1.5" />Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Add contact
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />Upload CSV
          </Button>
        </>
      }
    >
      {/* Filter pills with counts — Archived absorbs the old "Show archived"
          toggle as the rightmost pill. */}
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
        {debouncedSearch.trim() && (
          <span className="text-xs text-muted-foreground tabular-nums ml-1">
            {totalCount} {totalCount === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {/* Bulk action bar — only when something is selected. */}
      {selectedIds.size > 0 && (
        <div className="rounded-md border bg-accent/40 p-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium px-1.5">{selectedIds.size} selected</span>
          {/* Add to campaign — the headline action. Opens a dropdown
              listing draft campaigns + templates. Lazy-fetches both on
              open so newly-created drafts/templates show up without a
              full page reload. */}
          <DropdownMenu
            open={addCampaignOpen}
            onOpenChange={async (open) => {
              setAddCampaignOpen(open);
              if (open) {
                setDraftsLoading(true);
                try {
                  const [drafts, tpls] = await Promise.all([
                    fetchDraftCampaigns(),
                    fetchActiveTemplates(),
                  ]);
                  setDraftCampaigns(drafts);
                  setTemplates(tpls);
                } catch {
                  toast.error("Couldn't load campaigns / templates");
                } finally {
                  setDraftsLoading(false);
                }
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="default"
                disabled={bulkBusy || addingToCampaign}
                className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-3 w-3 mr-1" />
                {addingToCampaign ? "Adding…" : "Add to campaign"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[320px] max-h-[420px] overflow-y-auto">
              {draftsLoading ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  Loading…
                </div>
              ) : (
                <>
                  {/* Section 1 — drafts the operator can extend. Hidden
                      entirely when none exist (rather than showing an
                      empty heading). */}
                  {draftCampaigns.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Add to draft campaign
                      </div>
                      {draftCampaigns.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onSelect={async () => {
                            setAddCampaignOpen(false);
                            setAddingToCampaign(true);
                            try {
                              const { inserted, alreadyPresent } = await addContactsToCampaign(
                                c.id,
                                Array.from(selectedIds),
                              );
                              if (inserted === 0 && alreadyPresent > 0) {
                                toast.info(`All ${alreadyPresent} already on "${c.name}"`);
                              } else if (alreadyPresent > 0) {
                                toast.success(
                                  `${inserted} added to "${c.name}" (${alreadyPresent} were already there)`,
                                );
                              } else {
                                toast.success(`${inserted} added to "${c.name}"`);
                              }
                              clearSelection();
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Couldn't add to campaign",
                              );
                            } finally {
                              setAddingToCampaign(false);
                            }
                          }}
                          className="flex flex-col items-start gap-0.5 cursor-pointer"
                        >
                          <span className="text-sm font-medium">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.total_count} recipient{c.total_count === 1 ? "" : "s"} · created{" "}
                            {format(new Date(c.created_at), "d MMM")}
                          </span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Section 2 — templates → new campaign. This is the
                      common path: most outreach happens by re-using an
                      existing email template against a fresh recipient
                      list. Picking a template routes to the new-campaign
                      editor with both the template AND the contacts
                      pre-filled, so the operator only sets the name +
                      sends. */}
                  {templates.length > 0 ? (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Start a new campaign from a template
                      </div>
                      {templates.map((t) => (
                        <DropdownMenuItem
                          key={t.id}
                          onSelect={() => {
                            setAddCampaignOpen(false);
                            navigate("/outreach/campaigns/new", {
                              state: {
                                prefilledContactIds: Array.from(selectedIds),
                                prefilledTemplateId: t.id,
                              },
                            });
                          }}
                          className="flex flex-col items-start gap-0.5 cursor-pointer"
                        >
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            {t.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate w-full">
                            {t.subject}
                          </span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  ) : (
                    draftCampaigns.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        No drafts or templates yet.
                      </div>
                    )
                  )}

                  {/* Always offer a blank campaign as the escape hatch. */}
                  <DropdownMenuItem
                    onSelect={() => {
                      setAddCampaignOpen(false);
                      navigate("/outreach/campaigns/new", {
                        state: { prefilledContactIds: Array.from(selectedIds) },
                      });
                    }}
                    className="cursor-pointer text-primary"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Blank campaign with these contacts
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportSelection}
            disabled={bulkBusy || exporting}
            className="h-7 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            {exporting ? "Exporting…" : `Export ${selectedIds.size}`}
          </Button>
          {!showArchived && (
            <Button size="sm" variant="outline" onClick={() => setConfirmBulkArchive(true)} disabled={bulkBusy} className="h-7 text-xs">
              <Archive className="h-3 w-3 mr-1" />Archive
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => handleBulkStatus("ACTIVE")} disabled={bulkBusy} className="h-7 text-xs">
            Mark active
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleBulkStatus("UNSUBSCRIBED")} disabled={bulkBusy} className="h-7 text-xs">
            Mark unsubscribed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleBulkStatus("BOUNCED")} disabled={bulkBusy} className="h-7 text-xs">
            Mark bounced
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy} className="h-7 text-xs ml-auto">
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {showArchived
              ? "No archived contacts"
              : counts.ALL === 0
                ? "No contacts yet"
                : "No matches for this filter"}
          </p>
          <p className="text-sm mt-1">
            {showArchived
              ? "Archived contacts will appear here. Restore them to email again."
              : counts.ALL === 0
                ? "Upload a CSV or add a contact to get started."
                : "Try a different filter or clear the search."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            Showing {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            {showArchived
              ? ` archived contact${totalCount === 1 ? "" : "s"}`
              : ` ${STATUS_LABEL[status].toLowerCase()} contact${totalCount === 1 ? "" : "s"}`}
          </p>
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
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
                    <th className="text-left px-4 py-2.5 font-medium">Practice</th>
                    <th className="text-left px-4 py-2.5 font-medium">Postcode</th>
                    <th className="text-left px-4 py-2.5 font-medium">Website</th>
                    <th className="text-left px-4 py-2.5 font-medium">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium">Principal dentist</th>
                    <th className="text-left px-4 py-2.5 font-medium">Tag</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium">Comments</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      selected={selectedIds.has(c.id)}
                      onToggleSelect={() => toggleRowSelection(c.id)}
                      onChange={refreshAll}
                      onEdit={() => setEditing(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs">
                <span className="text-muted-foreground">
                  Page {safePage + 1} of {pageCount}
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
        </>
      )}

      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={() => {
          setUploadOpen(false);
          refreshAll();
        }}
      />

      <NewContactSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          refreshAll();
        }}
      />

      <EditContactSheet
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refreshAll();
        }}
      />

      <ConfirmDialog
        open={confirmBulkArchive}
        onOpenChange={setConfirmBulkArchive}
        title={`Archive ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}?`}
        description="They will be hidden from the contact list and excluded from new campaigns. Their open / click history is kept on file. You can restore them later from the Archived filter."
        confirmLabel="Archive"
        onConfirm={handleBulkArchive}
      />
    </Layout>
  );
}

const TARGET_TONE: Record<string, string> = {
  TARGET: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MAYBE: "bg-amber-100 text-amber-700 border-amber-200",
  LATER: "bg-blue-100 text-blue-700 border-blue-200",
  GROUP: "bg-slate-100 text-slate-700 border-slate-200",
  NO: "bg-red-100 text-red-700 border-red-200",
};

function ContactRow({
  contact,
  selected,
  onToggleSelect,
  onChange,
  onEdit,
}: {
  contact: OutreachContact;
  selected: boolean;
  onToggleSelect: () => void;
  onChange: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Make the website cell click-through to the practice's site without
  // triggering the row edit. The link's stopPropagation matters because
  // the row has its own click handler.
  const websiteHref = (() => {
    const w = contact.website?.trim();
    if (!w) return null;
    return w.startsWith("http") ? w : `https://${w}`;
  })();

  const handleStatus = async (s: OutreachContactStatus) => {
    setBusy(true);
    try {
      await updateContactStatus(contact.id, s);
      toast.success(`Marked ${STATUS_LABEL[s].toLowerCase()}`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const [confirmArchive, setConfirmArchive] = useState(false);

  const doArchive = async () => {
    setBusy(true);
    try {
      await archiveContact(contact.id);
      toast.success("Archived");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      await restoreContact(contact.id);
      toast.success("Restored");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr
      className={cn(
        "border-t hover:bg-accent/30 transition-colors cursor-pointer",
        selected && "bg-accent/30",
      )}
      onClick={(e) => {
        // Don't trigger edit when clicking the actions menu or the row
        // checkbox — both have their own handlers. Walk up to spot the
        // region via data attributes.
        const target = e.target as HTMLElement;
        if (target.closest("[data-row-actions]")) return;
        if (target.closest("[data-row-select]")) return;
        onEdit();
      }}
    >
      <td className="px-3 py-2.5" data-row-select>
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-foreground"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${contact.practice_name ?? "contact"}`}
        />
      </td>
      <td
        className="px-4 py-2.5 font-medium truncate max-w-[240px]"
        title={contact.practice_name ?? ""}
      >
        {contact.practice_name || "—"}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs uppercase">{contact.postcode || "—"}</td>
      <td className="px-4 py-2.5 text-xs">
        {websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline truncate inline-block max-w-[180px] align-middle"
          >
            {contact.website?.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs">{contact.email || "—"}</td>
      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]" title={contact.principal_dentist ?? ""}>
        {contact.principal_dentist || "—"}
      </td>
      <td className="px-4 py-2.5">
        {contact.tag ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${tagTone(contact.tag)}`}
            title={contact.tag}
          >
            {contact.tag}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${STATUS_TONE[contact.status]}`}>
          {contact.status.toLowerCase()}
        </span>
        {/* Last-emailed indicator — quick scan for "who haven't I touched
            in a while?". The filter dropdown above lets you bucket;
            this gives you the per-row detail at a glance. */}
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {formatLastEmailed(contact.last_emailed_at)}
        </div>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[240px]" title={contact.notes ?? ""}>
        {contact.notes || "—"}
      </td>
      <td className="px-1 py-2.5" data-row-actions>
        {/* Radix-portaled menu — escapes the table's overflow-hidden which
            would otherwise clip an inline absolutely-positioned popup. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              className="p-1 rounded hover:bg-accent"
              aria-label="Row actions"
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {contact.archived_at ? (
              <DropdownMenuItem onClick={handleRestore}>
                <ArchiveRestore className="h-3 w-3 mr-1.5" />
                Restore
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3 w-3 mr-1.5" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {contact.status !== "ACTIVE" && (
                  <DropdownMenuItem onClick={() => handleStatus("ACTIVE")}>
                    Mark active
                  </DropdownMenuItem>
                )}
                {contact.status !== "UNSUBSCRIBED" && (
                  <DropdownMenuItem onClick={() => handleStatus("UNSUBSCRIBED")}>
                    Mark unsubscribed
                  </DropdownMenuItem>
                )}
                {contact.status !== "BOUNCED" && (
                  <DropdownMenuItem onClick={() => handleStatus("BOUNCED")}>
                    Mark bounced
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-3 w-3 mr-1.5" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive ${contact.practice_name ?? "this contact"}?`}
          description="They will be hidden from the contact list and excluded from new campaigns. Their open / click history is kept on file. You can restore them later from the Archived filter."
          confirmLabel="Archive"
          onConfirm={doArchive}
        />
      </td>
    </tr>
  );
}

interface ParsedRow {
  [key: string]: string | undefined;
}

function UploadSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSource("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedHeaders = results.meta.fields ?? [];
        setHeaders(parsedHeaders);
        setRows(results.data);
        setMapping(autoMapColumns(parsedHeaders));
      },
      error: (err) => {
        toast.error(`CSV parse failed: ${err.message}`);
      },
    });
  };

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  // Pre-flight validation. The new identity is (practice_name, postcode)
  // — both mandatory, both must be present and non-empty to count.
  // Email is optional now; we still validate format when it's there.
  const stats = useMemo(() => {
    if (!mapping.practice_name || !mapping.postcode) {
      return { valid: 0, invalid: 0, unique: 0 };
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    let invalid = 0;
    for (const r of rows) {
      const name = (r[mapping.practice_name!] ?? "").trim();
      const postcode = (r[mapping.postcode!] ?? "").trim();
      const email = mapping.email ? (r[mapping.email] ?? "").trim().toLowerCase() : "";
      if (!name || !postcode) { invalid++; continue; }
      if (email && !emailRe.test(email)) { invalid++; continue; }
      const key = `${name.toLowerCase()}|${postcode.toUpperCase().replace(/\s+/g, "")}`;
      if (!seen.has(key)) seen.add(key);
    }
    return { valid: seen.size, invalid, unique: seen.size };
  }, [rows, mapping.practice_name, mapping.postcode, mapping.email]);

  const handleImport = async () => {
    if (!mapping.practice_name) {
      toast.error("Pick which CSV column has the practice name");
      return;
    }
    if (!mapping.postcode) {
      toast.error("Pick which CSV column has the postcode");
      return;
    }
    setBusy(true);
    try {
      const inputs = rows.map((r) => ({
        practice_name: r[mapping.practice_name!] ?? null,
        postcode: r[mapping.postcode!] ?? null,
        website: mapping.website ? r[mapping.website] : null,
        email: mapping.email ? r[mapping.email] : null,
        principal_dentist: mapping.principal_dentist ? r[mapping.principal_dentist] : null,
        notes: mapping.notes ? r[mapping.notes] : null,
        tag: mapping.tag ? r[mapping.tag] : null,
        // Legacy fallbacks — preserved if the CSV uses them.
        first_name: mapping.first_name ? r[mapping.first_name] : null,
        last_name: mapping.last_name ? r[mapping.last_name] : null,
        phone: mapping.phone ? r[mapping.phone] : null,
      }));
      const result = await bulkImportContacts(inputs, source.trim() || null);
      if (result.error) {
        toast.error(`Import error: ${result.error}`);
      } else {
        toast.success(
          `Imported ${result.inserted} new · ${result.duplicates} already existed · ${result.invalid} invalid`
        );
        reset();
        onImported();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Upload contacts CSV</SheetTitle>
          <SheetDescription>
            First row should be column headers. <strong>Practice name</strong>
            and <strong>postcode</strong> are required (we use them to dedupe
            against existing contacts). Other fields auto-map by header name —
            you can override below. Existing rows matching practice+postcode
            are skipped.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4 flex-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              CSV file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground mt-1">
                {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {headers.length > 0 && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Source (optional but recommended)
                </label>
                <Input
                  placeholder='e.g. "Dental conference Sept 2025", "BDA list", "Wayne import"'
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Stored on every imported contact. Helps you remember where your contacts came from.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  Column mapping
                </label>
                <div className="space-y-1.5">
                  {(["practice_name", "postcode", "website", "email", "principal_dentist", "tag", "notes"] as const).map((field) => (
                    <div key={field} className="flex items-center gap-2 text-sm">
                      <span className="w-40 text-muted-foreground">
                        {field === "practice_name" && "Practice name"}
                        {field === "postcode" && "Postcode"}
                        {field === "website" && "Website"}
                        {field === "email" && "Email"}
                        {field === "principal_dentist" && "Principal dentist"}
                        {field === "tag" && "Status / tag"}
                        {field === "notes" && "Comments"}
                        {(field === "practice_name" || field === "postcode") && (
                          <span className="text-red-500"> *</span>
                        )}
                      </span>
                      <Select
                        value={mapping[field] ?? "__none__"}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [field]: v === "__none__" ? null : v }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="min-w-[200px]">
                          <SelectItem value="__none__">— skip —</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-0.5">
                <p>
                  <span className="font-semibold">{stats.unique}</span> valid + unique practice{stats.unique === 1 ? "" : "s"} ready to import
                </p>
                {stats.invalid > 0 && (
                  <p className="text-amber-700">
                    {stats.invalid} row{stats.invalid === 1 ? "" : "s"} will be skipped (missing practice name or postcode, or invalid email)
                  </p>
                )}
                <p className="text-muted-foreground">
                  Contacts matching an existing (practice name + postcode) are skipped — your existing records are kept as-is.
                </p>
              </div>

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Preview (first 5 rows)
                  </p>
                  <div className="rounded-md border overflow-x-auto text-xs">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          {headers.map((h) => (
                            <th key={h} className="text-left px-2 py-1.5 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className="border-t">
                            {headers.map((h) => (
                              <td key={h} className="px-2 py-1.5 truncate max-w-[140px]">
                                {r[h] || ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t pt-3 flex justify-end gap-2">
          {headers.length > 0 && (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Reset
            </Button>
          )}
          <Button onClick={handleImport} disabled={busy || !mapping.practice_name || !mapping.postcode || stats.unique === 0}>
            {busy ? "Importing..." : `Import ${stats.unique} contact${stats.unique === 1 ? "" : "s"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditContactSheet({
  contact,
  onClose,
  onSaved,
}: {
  contact: OutreachContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [practiceName, setPracticeName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [principalDentist, setPrincipalDentist] = useState("");
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Hydrate form whenever a different contact is selected.
  useEffect(() => {
    if (!contact) return;
    setPracticeName(contact.practice_name ?? "");
    setPostcode(contact.postcode ?? "");
    // Website was historically in custom.website — fall back to that so
    // existing rows still surface the URL.
    setWebsite(contact.website ?? (contact.custom?.website as string) ?? "");
    setEmail(contact.email ?? "");
    setPrincipalDentist(
      contact.principal_dentist ??
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ??
        "",
    );
    setTag(contact.tag ?? "");
    setNotes(contact.notes ?? "");
  }, [contact?.id]);

  const handleSave = async () => {
    if (!contact) return;
    setBusy(true);
    try {
      await updateContact(contact.id, {
        practice_name: practiceName.trim() || null,
        postcode: postcode.trim() || null,
        website: website.trim() || null,
        email: email.trim().toLowerCase() || null,
        principal_dentist: principalDentist.trim() || null,
        tag: tag.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(contact)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit contact</SheetTitle>
          <SheetDescription className="break-all">
            {contact?.practice_name ?? "Unnamed practice"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 mt-4 flex-1">
          <div className="space-y-1">
            <Label htmlFor="practice-name" className="text-xs">Dental practice name <span className="text-destructive">*</span></Label>
            <Input id="practice-name" value={practiceName} onChange={(e) => setPracticeName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="postcode" className="text-xs">Postcode <span className="text-destructive">*</span></Label>
              <Input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="M1 1AA" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="principal-dentist" className="text-xs">Principal dentist / provider</Label>
              <Input id="principal-dentist" value={principalDentist} onChange={(e) => setPrincipalDentist(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="website" className="text-xs">Website address</Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs">Email address</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tag" className="text-xs">Status / tag</Label>
            <Input
              id="tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Target, NF, Closed, Portman"
            />
            <p className="text-[11px] text-muted-foreground">
              Your prospecting workflow label — free text. Distinct from the email-deliverability status (Active / Unsubscribed / etc.) which the system manages automatically.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs">Comments</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Free-form notes the rest of the team should see."
            />
          </div>
        </div>

        <div className="border-t pt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// One-shot single-contact form. Complement to the bulk CSV upload — for the
// "Wayne mentioned Dr Smith at the conference, add him" workflow that
// shouldn't require building a one-row CSV.
function NewContactSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [practiceName, setPracticeName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [principalDentist, setPrincipalDentist] = useState("");
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset on open so old values don't leak between create attempts.
  useEffect(() => {
    if (open) {
      setPracticeName("");
      setPostcode("");
      setWebsite("");
      setEmail("");
      setPrincipalDentist("");
      setTag("");
      setNotes("");
      setSource("");
    }
  }, [open]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValid = email.trim().length === 0 || EMAIL_RE.test(email.trim());
  const canSubmit = practiceName.trim().length > 0 && postcode.trim().length > 0 && emailValid;

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createContact({
        practice_name: practiceName,
        postcode,
        website: website || null,
        email: email || null,
        principal_dentist: principalDentist || null,
        tag: tag.trim() || null,
        notes: notes || null,
        source: source || null,
      });
      toast.success("Contact added");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add contact</SheetTitle>
          <SheetDescription>
            Single-contact entry. For more than a few, use Upload CSV instead.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="nc-practice">Dental practice name <span className="text-destructive">*</span></Label>
            <Input
              id="nc-practice"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-postcode">Postcode <span className="text-destructive">*</span></Label>
              <Input
                id="nc-postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="M1 1AA"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-principal">Principal dentist</Label>
              <Input
                id="nc-principal"
                value={principalDentist}
                onChange={(e) => setPrincipalDentist(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-website">Website address</Label>
            <Input
              id="nc-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.co.uk"
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-email">Email address</Label>
            <Input
              id="nc-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="reception@…"
              disabled={busy}
              aria-invalid={!emailValid}
            />
            {!emailValid && (
              <p className="text-[11px] text-destructive">That doesn't look like a valid email address.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-tag">Status / tag</Label>
            <Input
              id="nc-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Target, NF, Closed, Portman"
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">
              Your prospecting label — free text. Optional.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-notes">Comments</Label>
            <textarea
              id="nc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Anything the team should know about this prospect."
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-source">Source</Label>
            <Input
              id="nc-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder='e.g. "Conference Sept 2025", "Referral from Wayne"'
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">
              Helps you remember where this contact came from. Optional but useful.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy || !canSubmit} className="flex-1">
              {busy ? "Adding…" : "Add contact"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
