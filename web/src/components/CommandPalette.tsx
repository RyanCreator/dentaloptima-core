import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  LayoutDashboard, Calendar, Users, Inbox, ListChecks, RotateCcw, XCircle,
  Receipt, UserCog, ShieldCheck, Settings as SettingsIcon, FileText,
  AlertTriangle, MessageSquareWarning, FileBadge, Stethoscope, Search,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

// Cmd/Ctrl-K command palette. Opens from anywhere in the authenticated app.
// Three job-shapes the user mostly wants from it:
//   1. Quick navigation — "take me to the calendar / staff / governance"
//   2. Find a record — "open John Smith's profile / open enquiry from Jane"
//   3. Jump to something I just did — last-used patients (future enhancement)
//
// Static nav items show with no query typed; once 2+ chars are typed we run
// parallel searches across patients, appointments, enquiries, incidents,
// complaints, policies, services, and staff.

interface SearchItem {
  id: string;          // unique key per item, prefixed by category
  label: string;       // main line
  sub?: string;        // secondary line (e.g. patient email)
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  onSelect: () => void;
}

const NAV_ITEMS: Array<{ label: string; href: string; icon: SearchItem["icon"] }> = [
  { label: "Dashboard",     href: "/",              icon: LayoutDashboard },
  { label: "Calendar",      href: "/calendar",      icon: Calendar },
  { label: "Patients",      href: "/patients",      icon: Users },
  { label: "Enquiries",     href: "/enquiries",     icon: Inbox },
  { label: "Waiting list",  href: "/waiting-list",  icon: ListChecks },
  { label: "Recalls",       href: "/recalls",       icon: RotateCcw },
  { label: "Cancellations", href: "/cancellations", icon: XCircle },
  { label: "NHS claims",    href: "/claims",        icon: Receipt },
  { label: "Staff",         href: "/staff",         icon: UserCog },
  { label: "Governance",    href: "/governance",    icon: ShieldCheck },
  { label: "Settings",      href: "/settings",      icon: SettingsIcon },
  { label: "Glossary",      href: "/glossary",      icon: BookOpen },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Reset query when closing so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced multi-source search. We keep each source small (limit 5)
  // because the palette is for *finding* something, not browsing — a tight
  // result count is faster to scan.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearching(true);
      const isAdmin = auth.member?.role === "OWNER" || auth.member?.role === "ADMIN";
      const like = `%${q}%`;

      // Each source is a discriminated promise so failures in one don't
      // poison the rest of the result set.
      const [patientsRes, enquiriesRes, incidentsRes, complaintsRes, policiesRes, servicesRes, staffRes] =
        await Promise.allSettled([
          supabase.from("patient")
            .select("id, full_name, email, patient_number")
            .or(`full_name.ilike.${like},email.ilike.${like}`)
            .is("deleted_at", null)
            .limit(5),
          supabase.from("booking_request")
            .select("id, first_name, last_name, email, status, created_at")
            .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase.from("incident_report")
            .select("id, summary, severity, status, occurred_at")
            .ilike("summary", like)
            .is("deleted_at", null)
            .order("occurred_at", { ascending: false })
            .limit(5),
          supabase.from("complaint")
            .select("id, summary, complainant_name, status, received_at")
            .or(`summary.ilike.${like},complainant_name.ilike.${like}`)
            .is("deleted_at", null)
            .order("received_at", { ascending: false })
            .limit(5),
          supabase.from("policy")
            .select("id, title, category, version")
            .ilike("title", like)
            .is("deleted_at", null)
            .limit(5),
          supabase.from("service")
            .select("id, name, duration_minutes, is_nhs")
            .ilike("name", like)
            .eq("is_active", true)
            .is("deleted_at", null)
            .limit(5),
          supabase.from("practice_member")
            .select("id, full_name, role, email")
            .or(`full_name.ilike.${like},email.ilike.${like}`)
            .eq("is_active", true)
            .limit(5),
        ]);

      const collected: SearchItem[] = [];

      addRows(patientsRes, "patient", (r: any) => ({
        id: `patient-${r.id}`,
        label: r.full_name ?? "Unnamed",
        sub: [r.patient_number != null ? `#${r.patient_number}` : null, r.email].filter(Boolean).join(" · "),
        icon: Users,
        group: "Patients",
        onSelect: () => goTo(`/patients/${r.id}`),
      }), collected);

      addRows(enquiriesRes, "enquiry", (r: any) => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed";
        return {
          id: `enquiry-${r.id}`,
          label: name,
          sub: `Enquiry · ${r.status?.toLowerCase() ?? "new"}${r.email ? ` · ${r.email}` : ""}`,
          icon: Inbox,
          group: "Enquiries",
          onSelect: () => goTo(`/enquiries/${r.id}`),
        };
      }, collected);

      addRows(incidentsRes, "incident", (r: any) => ({
        id: `incident-${r.id}`,
        label: r.summary ?? "Incident",
        sub: `Incident · ${r.severity?.toLowerCase()} · ${r.status?.replace(/_/g, " ").toLowerCase()}`,
        icon: AlertTriangle,
        group: "Governance",
        onSelect: () => goTo(`/governance/incidents/${r.id}`),
      }), collected);

      addRows(complaintsRes, "complaint", (r: any) => ({
        id: `complaint-${r.id}`,
        label: r.summary ?? "Complaint",
        sub: `Complaint from ${r.complainant_name ?? "—"} · ${r.status?.replace(/_/g, " ").toLowerCase()}`,
        icon: MessageSquareWarning,
        group: "Governance",
        onSelect: () => goTo(`/governance/complaints/${r.id}`),
      }), collected);

      addRows(policiesRes, "policy", (r: any) => ({
        id: `policy-${r.id}`,
        label: r.title,
        sub: `Policy · v${r.version} · ${r.category?.replace(/_/g, " ").toLowerCase()}`,
        icon: FileBadge,
        group: "Governance",
        onSelect: () => goTo(`/governance/policies/${r.id}`),
      }), collected);

      addRows(servicesRes, "service", (r: any) => ({
        id: `service-${r.id}`,
        label: r.name,
        sub: `Service · ${r.duration_minutes}min${r.is_nhs ? " · NHS" : ""}`,
        icon: FileText,
        group: "Services",
        onSelect: () => goTo(`/settings/services/${r.id}`),
      }), collected);

      addRows(staffRes, "staff", (r: any) => ({
        id: `staff-${r.id}`,
        label: r.full_name ?? r.email,
        sub: `Staff · ${r.role?.toLowerCase()}`,
        icon: UserCog,
        group: "Staff",
        // Non-admins can only view their own staff profile usefully. Send
        // them to the directory and let RLS filter.
        onSelect: () => goTo(isAdmin ? `/staff/${r.id}` : "/staff"),
      }), collected);

      setResults(collected);
      setSearching(false);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const goTo = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter={false} // we filter server-side
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] bg-black/40"
    >
      <div className="w-full max-w-xl mx-4 rounded-lg border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to or search patients, enquiries, incidents…"
            className="flex-1 h-12 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-1">
          {/* Empty-query state — show static nav so the palette doubles as
              an app-wide jump menu. */}
          {query.trim().length < 2 ? (
            <Command.Group heading="Go to" className="px-2 py-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-1">
                Navigate
              </p>
              {NAV_ITEMS.map((n) => (
                <PaletteItem
                  key={n.href}
                  icon={n.icon}
                  label={n.label}
                  onSelect={() => goTo(n.href)}
                />
              ))}
            </Command.Group>
          ) : searching ? (
            <Command.Loading>
              <p className="text-xs text-muted-foreground p-4 text-center">Searching…</p>
            </Command.Loading>
          ) : results.length === 0 ? (
            <Command.Empty>
              <p className="text-xs text-muted-foreground p-6 text-center">
                Nothing matches "{query}".
              </p>
            </Command.Empty>
          ) : (
            <GroupedResults items={results} />
          )}
        </Command.List>

        <div className="border-t px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30">
          <span>Search across patients, enquiries, governance, services, staff</span>
          <span className="flex items-center gap-1">
            <kbd className="border rounded px-1">↑↓</kbd>
            <kbd className="border rounded px-1">↵</kbd>
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}

function addRows<T>(
  settled: PromiseSettledResult<{ data: T[] | null; error: unknown }>,
  source: string,
  shape: (row: T) => SearchItem,
  out: SearchItem[],
) {
  if (settled.status === "rejected") {
    logger.error(`palette ${source} search failed`, settled.reason);
    return;
  }
  if (settled.value.error) {
    logger.error(`palette ${source} search failed`, settled.value.error);
    return;
  }
  (settled.value.data ?? []).forEach((row) => out.push(shape(row)));
}

function GroupedResults({ items }: { items: SearchItem[] }) {
  // Group by `group` field so users see "Patients" / "Enquiries" /
  // "Governance" separately rather than a single jumbled list.
  const groups = new Map<string, SearchItem[]>();
  items.forEach((i) => {
    const g = groups.get(i.group) ?? [];
    g.push(i);
    groups.set(i.group, g);
  });

  return (
    <>
      {Array.from(groups.entries()).map(([groupName, rows]) => (
        <Command.Group key={groupName} className="px-2 py-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-1">
            {groupName}
          </p>
          {rows.map((r) => (
            <PaletteItem
              key={r.id}
              icon={r.icon}
              label={r.label}
              sub={r.sub}
              onSelect={r.onSelect}
            />
          ))}
        </Command.Group>
      ))}
    </>
  );
}

interface PaletteItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  onSelect: () => void;
}

function PaletteItem({ icon: Icon, label, sub, onSelect }: PaletteItemProps) {
  return (
    <Command.Item
      value={`${label} ${sub ?? ""}`}
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-2.5 px-2 py-2 rounded text-sm cursor-pointer",
        "aria-selected:bg-accent aria-selected:text-accent-foreground",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="truncate">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </Command.Item>
  );
}
