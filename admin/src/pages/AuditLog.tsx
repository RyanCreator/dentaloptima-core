import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useTenants } from "@/hooks/useTenants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const ACTION_STYLES = {
  INSERT: "bg-blue-100 text-blue-700",
  UPDATE: "bg-slate-100 text-slate-700",
  DELETE: "bg-red-100 text-red-700",
};

const KIND_STYLES = {
  GENERIC: "bg-stone-100 text-stone-700",
  CLINICAL: "bg-amber-100 text-amber-800",
};

export default function AuditLog() {
  const { data: entries, isLoading, error } = useAuditLog(500);
  const { data: tenants } = useTenants();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const tenantNameById = useMemo(() => {
    const map = new Map<string, string>();
    tenants?.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const tenant = e.practice_id ? tenantNameById.get(e.practice_id) ?? "" : "";
      return (
        tenant.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.performed_by_email ?? "").toLowerCase().includes(q) ||
        (e.context ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, search, tenantNameById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generic + clinical changes across all practices. Append-only.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search practice, entity, actor…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="pl-9"
        />
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

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          No audit entries match.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
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
                    <tr key={`${e.kind}-${e.id}`} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(e.performed_at), "d MMM HH:mm:ss")}
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
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="px-3 py-1 border rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                className="px-3 py-1 border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
