import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Building2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenants, type Practice, type PracticeStatus } from "@/hooks/useTenants";
import { NewTenantSheet } from "@/components/NewTenantSheet";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<PracticeStatus, string> = {
  TRIAL: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  ACTIVE: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  SUSPENDED: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  OFFBOARDED: "bg-stone-100 text-stone-700 hover:bg-stone-100",
};

type StatusFilter = "all" | PracticeStatus;
type SortKey = "name" | "status" | "trial_ends" | "created";
type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: Record<SortKey, string> = {
  name: "Practice",
  status: "Status",
  trial_ends: "Trial ends",
  created: "Created",
};

export default function Tenants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: practices, isLoading, error } = useTenants();
  const [newOpen, setNewOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Pre-fill state for the sheet — populated from URL params when the
  // operator arrives via "Convert" on a lead. Kept in state so we don't
  // lose it when the URL params get cleared.
  const [prefill, setPrefill] = useState<{
    practiceName?: string;
    ownerFullName?: string;
    ownerEmail?: string;
    fromLeadId?: string;
  } | null>(null);

  // Sidebar deep-links to /tenants?new=1 to open the create sheet directly.
  // Lead-conversion deep-links to /tenants/new?fromLead=…&name=…&email=…
  // (the route /tenants/new doesn't exist — it falls through to /tenants
  // and we treat the params as "open the sheet pre-filled").
  useEffect(() => {
    const fromLead = searchParams.get("fromLead");
    const wantsNew = searchParams.get("new") === "1" || fromLead;
    if (!wantsNew) return;

    if (fromLead) {
      setPrefill({
        fromLeadId: fromLead,
        practiceName: searchParams.get("name") ?? undefined,
        // The lead's "name" is the contact's full name — use it as both
        // the practice name (operator can override) and owner full name.
        ownerFullName: searchParams.get("name") ?? undefined,
        ownerEmail: searchParams.get("email") ?? undefined,
      });
    } else {
      setPrefill(null);
    }
    setNewOpen(true);
    setSearchParams(
      (p) => {
        p.delete("new");
        p.delete("fromLead");
        p.delete("name");
        p.delete("email");
        return p;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const counts = useMemo(() => {
    const acc: Record<PracticeStatus, number> = {
      TRIAL: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
      OFFBOARDED: 0,
    };
    for (const p of practices ?? []) acc[p.status]++;
    return acc;
  }, [practices]);

  const total = practices?.length ?? 0;

  const visible = useMemo(() => {
    if (!practices) return [];
    let rows: Practice[] = practices;

    if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.primary_email ?? "").toLowerCase().includes(q),
      );
    }

    const sorted = [...rows].sort((a, b) => {
      let c = 0;
      switch (sortBy) {
        case "name":
          c = a.name.localeCompare(b.name);
          break;
        case "status":
          c = a.status.localeCompare(b.status);
          break;
        case "trial_ends":
          // Nulls land at the end of asc, beginning of desc — keeps non-trial
          // rows out of the way when sorting by trial expiry.
          c = (a.trial_ends_at ?? "").localeCompare(b.trial_ends_at ?? "");
          break;
        case "created":
        default:
          c = a.created_at.localeCompare(b.created_at);
      }
      return sortDir === "asc" ? c : -c;
    });
    return sorted;
  }, [practices, statusFilter, search, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      // Sensible default direction per column — most operators want newest
      // first for created, A-Z for name, soonest first for trial_ends.
      setSortDir(key === "name" ? "asc" : key === "trial_ends" ? "asc" : "desc");
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total === 0
              ? "Every dental practice on dentaloptima-core."
              : `${total} total · ${counts.ACTIVE} active · ${counts.TRIAL} trial${
                  counts.SUSPENDED ? ` · ${counts.SUSPENDED} suspended` : ""
                }${counts.OFFBOARDED ? ` · ${counts.OFFBOARDED} offboarded` : ""}`}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New tenant
        </Button>
      </div>

      {/* Toolbar */}
      {practices && practices.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, slug, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="TRIAL">Trial ({counts.TRIAL})</SelectItem>
              <SelectItem value="ACTIVE">Active ({counts.ACTIVE})</SelectItem>
              <SelectItem value="SUSPENDED">Suspended ({counts.SUSPENDED})</SelectItem>
              <SelectItem value="OFFBOARDED">Offboarded ({counts.OFFBOARDED})</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground tabular-nums">
            {visible.length} {visible.length === 1 ? "match" : "matches"}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading practices…</div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {!isLoading && practices && practices.length === 0 && (
        <div className="border rounded-lg p-12 text-center bg-card">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-base font-medium">No practices yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first practice to get started.
          </p>
          <Button onClick={() => setNewOpen(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            New tenant
          </Button>
        </div>
      )}

      {practices && practices.length > 0 && visible.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No tenants match the current search/filter.
        </div>
      )}

      {visible.length > 0 && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <SortableHeader
                    label={SORTABLE_COLUMNS.name}
                    active={sortBy === "name"}
                    dir={sortDir}
                    onClick={() => toggleSort("name")}
                  />
                  <th className="text-left font-medium px-4 py-3">Slug</th>
                  <th className="text-left font-medium px-4 py-3">Hostname</th>
                  <SortableHeader
                    label={SORTABLE_COLUMNS.status}
                    active={sortBy === "status"}
                    dir={sortDir}
                    onClick={() => toggleSort("status")}
                  />
                  <th className="text-left font-medium px-4 py-3">Plan</th>
                  <SortableHeader
                    label={SORTABLE_COLUMNS.trial_ends}
                    active={sortBy === "trial_ends"}
                    dir={sortDir}
                    onClick={() => toggleSort("trial_ends")}
                  />
                  <SortableHeader
                    label={SORTABLE_COLUMNS.created}
                    active={sortBy === "created"}
                    dir={sortDir}
                    onClick={() => toggleSort("created")}
                  />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/tenants/${p.id}`)}
                    className="border-t hover:bg-secondary/30 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.primary_email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[260px]" title={p.primary_email}>
                          {p.primary_email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.slug}</td>
                    <td className="px-4 py-3">
                      {p.custom_hostname ? (
                        <span className="font-mono text-xs text-muted-foreground" title={p.custom_hostname}>
                          {p.custom_hostname}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                          unset
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLES[p.status]} variant="secondary">
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.plan}</td>
                    <td className="px-4 py-3">
                      <TrialEndsCell trialEndsAt={p.trial_ends_at} status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {format(new Date(p.created_at), "d MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewTenantSheet
        open={newOpen}
        onOpenChange={(open) => {
          setNewOpen(open);
          // Clear the prefill once the sheet closes so the next manual
          // "New tenant" click starts blank.
          if (!open) setPrefill(null);
        }}
        onCreated={(id) => navigate(`/tenants/${id}`)}
        initialPracticeName={prefill?.practiceName}
        initialOwnerEmail={prefill?.ownerEmail}
        initialOwnerFullName={prefill?.ownerFullName}
        fromLeadId={prefill?.fromLeadId}
      />
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="text-left font-medium px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded hover:bg-secondary/60 transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
}

// Renders the trial expiry cell with an inline urgency cue:
//   - non-trial → em dash
//   - trial with no end date → just em dash
//   - trial expiring soon → amber pill ("in 3d")
//   - trial already past → red pill ("3d ago")
//   - trial > 7d out → grey relative
function TrialEndsCell({
  trialEndsAt,
  status,
}: {
  trialEndsAt: string | null;
  status: PracticeStatus;
}) {
  if (status !== "TRIAL" || !trialEndsAt) {
    return <span className="text-muted-foreground">—</span>;
  }
  const date = new Date(trialEndsAt);
  const days = differenceInDays(date, new Date());
  const expired = days < 0;
  const urgent = !expired && days <= 7;
  const label = expired
    ? `${Math.abs(days)}d ago`
    : days === 0
    ? "today"
    : `in ${days}d`;
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-muted-foreground tabular-nums">{format(date, "d MMM yyyy")}</span>
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
          expired && "bg-red-100 text-red-700",
          urgent && !expired && "bg-amber-100 text-amber-700",
          !expired && !urgent && "bg-muted text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}
