import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, ScrollText, Plus, Pencil, Trash2, Stethoscope, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: string;
  practice_id: string | null;
  performed_by_id: string | null;
  performed_by_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  context: string | null;
  performed_at: string;
  // Synthetic — which source table this came from. Lets us tag rows in
  // the UI without a second column on the table.
  _source: "audit" | "clinical_audit";
}

interface MemberLite { id: string; full_name: string | null }

const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  INSERT: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
};

const ACTION_STYLE: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

const PAGE_SIZE = 50;

export function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // hasMore tracks per-source: as soon as one source runs out, we can still
  // fetch more from the other. When both are empty, the "Load older" button
  // disappears.
  const [hasMore, setHasMore] = useState({ audit: true, clinical_audit: true });
  const [scope, setScope] = useState<"all" | "clinical" | "system">("all");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  useEffect(() => {
    // Reset pagination state when the scope changes — different stream
    // composition means the cursor logic starts fresh.
    setRows([]);
    setHasMore({ audit: true, clinical_audit: true });
    void load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  /** Loads one page. When `reset` is true, ignores the current cursor and
   *  starts from "now"; otherwise picks up from the oldest row already in
   *  state (per-source cursor). */
  const load = async ({ reset }: { reset?: boolean } = {}) => {
    if (reset) setLoading(true); else setLoadingMore(true);

    // Per-source cursor — the oldest performed_at we already have for that
    // source. On reset, both are undefined (= "no upper bound").
    const auditCursor = reset
      ? null
      : rows.filter((r) => r._source === "audit").at(-1)?.performed_at ?? null;
    const clinicalCursor = reset
      ? null
      : rows.filter((r) => r._source === "clinical_audit").at(-1)?.performed_at ?? null;

    const fetches: Array<Promise<{ source: "audit" | "clinical_audit"; rows: AuditRow[] }>> = [];

    if ((scope === "all" || scope === "system") && (reset || hasMore.audit)) {
      fetches.push((async () => {
        let q = supabase
          .from("audit")
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(PAGE_SIZE);
        if (auditCursor) q = q.lt("performed_at", auditCursor);
        const { data, error } = await q;
        if (error) { logger.error("audit load failed", error); return { source: "audit", rows: [] }; }
        return {
          source: "audit" as const,
          rows: (data ?? []).map((r) => ({
            ...(r as unknown as Omit<AuditRow, "_source">),
            _source: "audit" as const,
          })),
        };
      })());
    }
    if ((scope === "all" || scope === "clinical") && (reset || hasMore.clinical_audit)) {
      fetches.push((async () => {
        let q = supabase
          .from("clinical_audit")
          .select("*")
          .order("performed_at", { ascending: false })
          .limit(PAGE_SIZE);
        if (clinicalCursor) q = q.lt("performed_at", clinicalCursor);
        const { data, error } = await q;
        if (error) { logger.error("clinical_audit load failed", error); return { source: "clinical_audit", rows: [] }; }
        return {
          source: "clinical_audit" as const,
          rows: (data ?? []).map((r) => ({
            ...(r as unknown as Omit<AuditRow, "_source">),
            _source: "clinical_audit" as const,
          })),
        };
      })());
    }

    const results = await Promise.all(fetches);

    // A source is "done" when its page came back smaller than PAGE_SIZE.
    const nextHasMore = { ...hasMore };
    results.forEach((r) => {
      if (r.rows.length < PAGE_SIZE) nextHasMore[r.source] = false;
    });
    setHasMore(nextHasMore);

    const newRows = results.flatMap((r) => r.rows);
    const combined = reset ? newRows : [...rows, ...newRows];
    combined.sort((a, b) => b.performed_at.localeCompare(a.performed_at));
    setRows(combined);

    // Hydrate member names for any new actors.
    const memberIds = Array.from(new Set(
      combined
        .map((r) => r.performed_by_id)
        .filter((v): v is string => Boolean(v) && !members[v as string]),
    ));
    if (memberIds.length > 0) {
      const { data: m } = await supabase
        .from("practice_member")
        .select("id, full_name")
        .in("id", memberIds);
      const map: Record<string, MemberLite> = { ...members };
      (m ?? []).forEach((row) => { map[row.id] = row as MemberLite; });
      setMembers(map);
    }

    if (reset) setLoading(false); else setLoadingMore(false);
  };

  const canLoadMore =
    (scope === "all"      && (hasMore.audit || hasMore.clinical_audit)) ||
    (scope === "system"   && hasMore.audit) ||
    (scope === "clinical" && hasMore.clinical_audit);

  // Unique entity types in the current result set drive the entity filter.
  const entityTypes = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.entity_type))).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (actionFilter !== "ALL") result = result.filter((r) => r.action === actionFilter);
    if (entityFilter !== "ALL") result = result.filter((r) => r.entity_type === entityFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        r.entity_type.toLowerCase().includes(s) ||
        r.entity_id.toLowerCase().includes(s) ||
        r.performed_by_email?.toLowerCase().includes(s) ||
        (r.performed_by_id && members[r.performed_by_id]?.full_name?.toLowerCase().includes(s)) ||
        r.context?.toLowerCase().includes(s),
      );
    }
    return result;
  }, [rows, actionFilter, entityFilter, search, members]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity, member, ID..."
            className="pl-9"
          />
        </div>

        <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audit logs</SelectItem>
            <SelectItem value="clinical">Clinical only</SelectItem>
            <SelectItem value="system">System only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            <SelectItem value="INSERT">Created</SelectItem>
            <SelectItem value="UPDATE">Updated</SelectItem>
            <SelectItem value="DELETE">Deleted</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All entities</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <ScrollText className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No audit entries</p>
          <p className="text-sm mt-1">
            {rows.length === 0
              ? "The audit log will populate as patient + clinical records are created and changed."
              : "No entries match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {filtered.map((r) => {
            const ActionIcon = ACTION_ICON[r.action];
            const actor = r.performed_by_id ? members[r.performed_by_id]?.full_name : null;
            return (
              <button
                key={`${r._source}-${r.id}`}
                onClick={() => setSelectedRow(r)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  ACTION_STYLE[r.action] ?? "bg-muted",
                )}>
                  <ActionIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {actionVerb(r.action)} {r.entity_type}
                    </span>
                    {r._source === "clinical_audit" && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        <Stethoscope className="h-3 w-3" /> Clinical
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(parseISO(r.performed_at), "d MMM yyyy, HH:mm:ss")}
                    {actor && <> · {actor}</>}
                    {!actor && r.performed_by_email && <> · {r.performed_by_email}</>}
                    {!actor && !r.performed_by_email && <> · System</>}
                    <span className="mx-1">·</span>
                    <span className="font-mono">{r.entity_id.slice(0, 8)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination — RLS already scopes each query, so we just keep
          fetching older windows until both sources report exhaustion. */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} shown
            {rows.length !== filtered.length && ` (${rows.length} loaded, filters narrowing)`}
          </span>
          {canLoadMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loadingMore}
              className="h-7 text-xs"
            >
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              {loadingMore ? "Loading…" : "Load older"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={Boolean(selectedRow)} onOpenChange={(o) => !o && setSelectedRow(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionVerb(selectedRow.action)} {selectedRow.entity_type}
                </DialogTitle>
                <DialogDescription>
                  {format(parseISO(selectedRow.performed_at), "EEE d MMM yyyy, HH:mm:ss")}
                  {" · "}
                  {selectedRow.performed_by_id && members[selectedRow.performed_by_id]?.full_name
                    ? members[selectedRow.performed_by_id].full_name
                    : selectedRow.performed_by_email ?? "System"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 mt-2">
                <DetailRow label="Entity ID" value={selectedRow.entity_id} mono />
                {selectedRow.context && (
                  <DetailRow label="Context" value={selectedRow.context} />
                )}

                {selectedRow.action === "UPDATE" && selectedRow.before_data && selectedRow.after_data && (
                  <Diff before={selectedRow.before_data} after={selectedRow.after_data} />
                )}

                {selectedRow.action === "INSERT" && selectedRow.after_data && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Created with
                    </p>
                    <JsonView data={selectedRow.after_data} />
                  </div>
                )}

                {selectedRow.action === "DELETE" && selectedRow.before_data && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Deleted record
                    </p>
                    <JsonView data={selectedRow.before_data} />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function actionVerb(a: string): string {
  if (a === "INSERT") return "Created";
  if (a === "UPDATE") return "Updated";
  if (a === "DELETE") return "Deleted";
  return a;
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className={cn(mono && "font-mono text-xs break-all")}>{value}</span>
    </div>
  );
}

function JsonView({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto max-h-72 overflow-y-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// Compact field-level diff. Skips keys where both sides match (saves rows
// in big tables) and skips audit-noise fields (`updated_at` always changes).
function Diff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const skip = new Set(["updated_at", "updated_by"]);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((k) => !skip.has(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  if (keys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No field-level changes (timestamp-only update).</p>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Changes
      </p>
      <div className="rounded border divide-y text-xs">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[140px_1fr] gap-2 p-2">
            <span className="font-mono text-muted-foreground">{k}</span>
            <div className="space-y-1 min-w-0">
              <div className="flex items-start gap-1">
                <span className="text-red-600 shrink-0">−</span>
                <span className="break-all">{formatValue(before[k])}</span>
              </div>
              <div className="flex items-start gap-1">
                <span className="text-green-600 shrink-0">+</span>
                <span className="break-all">{formatValue(after[k])}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
