import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Activity,
  Check,
} from "lucide-react";
import { useAuditLog, type AuditEntry } from "@/hooks/useAuditLog";
import { useTenants } from "@/hooks/useTenants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const ACTION_STYLES: Record<AuditEntry["action"], string> = {
  INSERT: "bg-blue-100 text-blue-700",
  UPDATE: "bg-slate-100 text-slate-700",
  DELETE: "bg-red-100 text-red-700",
};

const KIND_STYLES: Record<AuditEntry["kind"], string> = {
  GENERIC: "bg-stone-100 text-stone-700",
  CLINICAL: "bg-amber-100 text-amber-800",
};

type KindFilter = "ALL" | AuditEntry["kind"];
type ActionFilter = "ALL" | AuditEntry["action"];
type TimeFilter = "today" | "7d" | "30d" | "90d" | "all";

const TIME_OPTIONS: Array<{ key: TimeFilter; label: string; days: number | null }> = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7d", days: 7 },
  { key: "30d", label: "Last 30d", days: 30 },
  { key: "90d", label: "Last 90d", days: 90 },
  { key: "all", label: "All", days: null },
];

// How many rows we fetch from the DB per filter window. Stays modest for the
// short windows; jumps for "all" because the operator likely wants to scan
// or export. Going much beyond ~5k starts to feel laggy on the client.
function limitForTime(t: TimeFilter): number {
  if (t === "today") return 500;
  if (t === "7d") return 1000;
  if (t === "30d") return 2500;
  if (t === "90d") return 5000;
  return 5000;
}

export default function AuditLog() {
  const [time, setTime] = useState<TimeFilter>("7d");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [action, setAction] = useState<ActionFilter>("ALL");
  const [tenantId, setTenantId] = useState<string | "ALL">("ALL");
  const [actorEmail, setActorEmail] = useState<string | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const fromDate = useMemo(() => {
    const opt = TIME_OPTIONS.find((o) => o.key === time);
    if (!opt || opt.days === null) return null;
    if (opt.days === 0) return startOfDay(new Date()).toISOString();
    return subDays(new Date(), opt.days).toISOString();
  }, [time]);

  const { data: entries, isLoading, error } = useAuditLog({
    limit: limitForTime(time),
    fromDate,
  });
  const { data: tenants } = useTenants();

  const tenantNameById = useMemo(() => {
    const map = new Map<string, string>();
    tenants?.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  // Distinct actor emails seen in the loaded window, for the actor dropdown.
  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries ?? []) {
      if (e.performed_by_email) set.add(e.performed_by_email);
    }
    return Array.from(set).sort();
  }, [entries]);

  // Reset to page 0 whenever any filter / search changes.
  useEffect(() => {
    setPage(0);
  }, [time, kind, action, tenantId, actorEmail, debouncedSearch]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    let rows = entries;
    if (kind !== "ALL") rows = rows.filter((e) => e.kind === kind);
    if (action !== "ALL") rows = rows.filter((e) => e.action === action);
    if (tenantId !== "ALL") {
      rows = rows.filter((e) => (tenantId === "__none__" ? !e.practice_id : e.practice_id === tenantId));
    }
    if (actorEmail !== "ALL") {
      rows = rows.filter((e) =>
        actorEmail === "__system__"
          ? !e.performed_by_email
          : e.performed_by_email === actorEmail,
      );
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      rows = rows.filter((e) => {
        const tenantName = e.practice_id ? tenantNameById.get(e.practice_id) ?? "" : "";
        return [
          tenantName,
          e.entity_type,
          e.entity_id,
          e.action,
          e.performed_by_email ?? "",
          e.context ?? "",
        ].join(" ").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [entries, kind, action, tenantId, actorEmail, debouncedSearch, tenantNameById]);

  const counts = useMemo(() => {
    const total = entries?.length ?? 0;
    const todayStart = startOfDay(new Date()).toISOString();
    const weekStart = subDays(new Date(), 7).toISOString();
    let today = 0;
    let week = 0;
    let clinical = 0;
    for (const e of entries ?? []) {
      if (e.performed_at >= todayStart) today++;
      if (e.performed_at >= weekStart) week++;
      if (e.kind === "CLINICAL") clinical++;
    }
    return { total, today, week, clinical };
  }, [entries]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleExport = () => {
    if (filtered.length === 0) {
      return;
    }
    const flat = filtered.map((e) => ({
      performed_at: e.performed_at,
      kind: e.kind,
      action: e.action,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      practice_id: e.practice_id ?? "",
      practice_name: e.practice_id ? tenantNameById.get(e.practice_id) ?? "" : "",
      patient_id: e.patient_id ?? "",
      performed_by_id: e.performed_by_id ?? "",
      performed_by_email: e.performed_by_email ?? "",
      context: e.context ?? "",
      before_data: e.before_data ? JSON.stringify(e.before_data) : "",
      after_data: e.after_data ? JSON.stringify(e.after_data) : "",
    }));
    const csv = Papa.unparse(flat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${time}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {entries
              ? `${counts.today} today · ${counts.week} this week · ${counts.clinical} clinical · ${counts.total} loaded`
              : "Generic + clinical changes across all practices. Append-only."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search practice, entity, actor, context…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export ({filtered.length})
          </Button>
        </div>
      </div>

      {/* Single tidy filter row. Time stays as quick-pills (operators flip
          this often). Everything else collapses into compact dropdowns so
          we don't burn three rows of vertical space. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {TIME_OPTIONS.map((o) => (
            <FilterPill
              key={o.key}
              active={time === o.key}
              onClick={() => setTime(o.key)}
              label={o.label}
            />
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        <SearchablePicker
          label="Kind"
          options={[
            { value: "ALL", label: "All kinds" },
            { value: "GENERIC", label: "Generic" },
            { value: "CLINICAL", label: "Clinical" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as KindFilter)}
          showSearch={false}
        />
        <SearchablePicker
          label="Action"
          options={[
            { value: "ALL", label: "Any action" },
            { value: "INSERT", label: "INSERT" },
            { value: "UPDATE", label: "UPDATE" },
            { value: "DELETE", label: "DELETE" },
          ]}
          value={action}
          onChange={(v) => setAction(v as ActionFilter)}
          showSearch={false}
        />
        <SearchablePicker
          label="Practice"
          options={[
            { value: "ALL", label: "All practices" },
            { value: "__none__", label: "(no practice)" },
            ...(tenants ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
          value={tenantId}
          onChange={(v) => setTenantId(v as string)}
        />
        <SearchablePicker
          label="Actor"
          options={[
            { value: "ALL", label: "Any actor" },
            { value: "__system__", label: "system (no actor)" },
            ...actors.map((a) => ({ value: a, label: a })),
          ]}
          value={actorEmail}
          onChange={(v) => setActorEmail(v as string)}
        />

        {(tenantId !== "ALL" || actorEmail !== "ALL" || kind !== "ALL" || action !== "ALL" || debouncedSearch.trim()) && (
          <button
            onClick={() => {
              setTenantId("ALL");
              setActorEmail("ALL");
              setKind("ALL");
              setAction("ALL");
              setSearch("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground tabular-nums ml-auto">
          {filtered.length.toLocaleString("en-GB")} {filtered.length === 1 ? "match" : "matches"}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading audit entries…
        </div>
      )}

      {!isLoading && filtered.length === 0 && entries && entries.length > 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          No audit entries match the current filters.
        </div>
      )}

      {!isLoading && (!entries || entries.length === 0) && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Activity className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once practices start using the booking app, every change lands here.
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">When</th>
                    <th className="text-left font-medium px-4 py-2.5">Kind</th>
                    <th className="text-left font-medium px-4 py-2.5">Practice</th>
                    <th className="text-left font-medium px-4 py-2.5">Action</th>
                    <th className="text-left font-medium px-4 py-2.5">Entity</th>
                    <th className="text-left font-medium px-4 py-2.5">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paged.map((e) => (
                    <tr
                      key={`${e.kind}-${e.id}`}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelected(e)}
                    >
                      <td
                        className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap"
                        title={format(new Date(e.performed_at), "d MMM yyyy HH:mm:ss")}
                      >
                        {formatDistanceToNow(new Date(e.performed_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className={cn("text-[10px]", KIND_STYLES[e.kind])}>
                          {e.kind}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {e.practice_id ? (
                          tenantNameById.get(e.practice_id) ?? (
                            <span className="text-muted-foreground italic">deleted</span>
                          )
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className={cn("text-[10px]", ACTION_STYLES[e.action])}>
                          {e.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{e.entity_type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {e.performed_by_email ?? "system"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {(safePage * PAGE_SIZE + 1).toLocaleString("en-GB")}
              –{Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString("en-GB")} of{" "}
              {filtered.length.toLocaleString("en-GB")}
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
              <span className="px-2 tabular-nums">
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
        </>
      )}

      <AuditDetailSheet
        entry={selected}
        tenantName={selected?.practice_id ? tenantNameById.get(selected.practice_id) ?? null : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-[28px]",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card hover:bg-muted/60 text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

interface PickerOption {
  value: string;
  label: string;
}

// Compact searchable dropdown — reused pattern. Renders inside a popover-
// style absolutely-positioned panel so it doesn't push surrounding layout.
// Pass showSearch={false} to hide the in-popover filter when the option list
// is short enough that searching just adds noise.
function SearchablePicker({
  label,
  options,
  value,
  onChange,
  showSearch = true,
}: {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  showSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value) ?? options[0];
  const isAll = value === "ALL" || !value;

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, showSearch]);

  // Close on outside click — simple click-outside via a wrapping div
  // listening for blur events on its descendants.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors min-h-[32px]",
          !isAll ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted/60",
        )}
      >
        <span className={cn("text-[10px] uppercase tracking-wider", !isAll ? "opacity-80" : "text-muted-foreground/80")}>
          {label}:
        </span>
        <span className="font-medium truncate max-w-[140px]">{selected?.label}</span>
      </button>
      {open && (
        <>
          {/* click-outside backdrop */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />
          <div className="absolute left-0 top-full mt-1 w-[280px] rounded-md border bg-background shadow-lg z-40">
            {showSearch && (
              <div className="border-b">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="border-0 focus-visible:ring-0 rounded-none h-8 text-xs"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No matches.</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2",
                      o.value === value && "bg-accent/60",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Detail sheet — surfaces the actor + before/after JSON diff so operators
// can see what actually changed, not just "UPDATE on patient". Critical
// for CQC-style audit review.
function AuditDetailSheet({
  entry,
  tenantName,
  onClose,
}: {
  entry: AuditEntry | null;
  tenantName: string | null;
  onClose: () => void;
}) {
  if (!entry) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const before = entry.before_data as Record<string, unknown> | null;
  const after = entry.after_data as Record<string, unknown> | null;
  const diff = computeDiff(before, after);

  return (
    <Sheet open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={cn("text-[10px]", KIND_STYLES[entry.kind])}>
              {entry.kind}
            </Badge>
            <Badge variant="secondary" className={cn("text-[10px]", ACTION_STYLES[entry.action])}>
              {entry.action}
            </Badge>
            <span className="font-mono text-sm">{entry.entity_type}</span>
          </SheetTitle>
          <SheetDescription className="text-left">
            {format(new Date(entry.performed_at), "d MMM yyyy 'at' HH:mm:ss")}
            {entry.performed_by_email && ` · by ${entry.performed_by_email}`}
            {tenantName && ` · ${tenantName}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {entry.context && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Context</p>
              <p>{entry.context}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Identifiers</p>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs font-mono">
              <div><span className="text-muted-foreground">audit_id:</span> {entry.id}</div>
              <div><span className="text-muted-foreground">entity_id:</span> {entry.entity_id}</div>
              {entry.practice_id && (
                <div><span className="text-muted-foreground">practice_id:</span> {entry.practice_id}</div>
              )}
              {entry.patient_id && (
                <div><span className="text-muted-foreground">patient_id:</span> {entry.patient_id}</div>
              )}
              {entry.performed_by_id && (
                <div><span className="text-muted-foreground">performed_by_id:</span> {entry.performed_by_id}</div>
              )}
            </div>
          </div>

          {/* What-changed view — shows fields that differ between before
              and after, with a +/- visual. Falls back to "(no field-level
              diff)" if either side is null (typical of INSERT / DELETE). */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What changed</p>
            {entry.action === "INSERT" && after ? (
              <DataPanel label="Inserted" tone="add" data={after} />
            ) : entry.action === "DELETE" && before ? (
              <DataPanel label="Deleted" tone="remove" data={before} />
            ) : diff.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground italic">
                No field-level diff available.
              </div>
            ) : (
              <div className="rounded-md border bg-card divide-y">
                {diff.map((d) => (
                  <div key={d.key} className="px-3 py-2 text-xs">
                    <div className="font-mono text-foreground/80">{d.key}</div>
                    <div className="mt-1 grid grid-cols-1 gap-1">
                      <div className="flex items-start gap-2">
                        <span className="text-red-600 font-mono shrink-0">−</span>
                        <pre className="whitespace-pre-wrap break-all font-mono text-red-900 dark:text-red-200 bg-red-50/60 dark:bg-red-950/20 px-2 py-1 rounded flex-1">
                          {formatVal(d.before)}
                        </pre>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-700 font-mono shrink-0">+</span>
                        <pre className="whitespace-pre-wrap break-all font-mono text-emerald-900 dark:text-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-2 py-1 rounded flex-1">
                          {formatVal(d.after)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw JSON for completeness — collapsed by default to keep the
              diff view tidy. */}
          {(before || after) && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                Raw JSON
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <RawJson label="before" data={before} />
                <RawJson label="after" data={after} />
              </div>
            </details>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
}

function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffEntry[] {
  if (!before || !after) return [];
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  // Skip keys that are bookkeeping noise — they change on every UPDATE
  // but tell the operator nothing useful.
  const NOISE = new Set(["updated_at"]);
  const out: DiffEntry[] = [];
  for (const k of keys) {
    if (NOISE.has(k)) continue;
    const a = before[k];
    const b = after[k];
    if (!deepEqual(a, b)) {
      out.push({ key: k, before: a, after: b });
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "(null)";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function DataPanel({
  label,
  tone,
  data,
}: {
  label: string;
  tone: "add" | "remove";
  data: Record<string, unknown>;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-xs space-y-1",
        tone === "add" && "border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20",
        tone === "remove" && "border-red-300/60 bg-red-50/60 dark:bg-red-950/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <div className="space-y-0.5">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="font-mono">
            <span className="text-muted-foreground">{k}:</span> {formatVal(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

function RawJson({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-[11px]">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <pre className="whitespace-pre-wrap break-all font-mono">
        {data ? JSON.stringify(data, null, 2) : "(null)"}
      </pre>
    </div>
  );
}
