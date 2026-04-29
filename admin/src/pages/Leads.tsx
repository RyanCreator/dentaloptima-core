import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  Inbox,
  Mail,
  ExternalLink,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
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
import { ErrorState } from "@/components/ErrorState";
import { useLeads, useUpdateLead, type Lead, type LeadStatus } from "@/hooks/useLeads";
import { useTenants } from "@/hooks/useTenants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | LeadStatus;

const STATUS_META: Record<
  LeadStatus,
  { label: string; badge: string }
> = {
  NEW: {
    label: "New",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  CONTACTED: {
    label: "Contacted",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  CONVERTED: {
    label: "Converted",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  ARCHIVED: {
    label: "Archived",
    badge: "bg-muted text-muted-foreground",
  },
};

const VALID_FILTERS: StatusFilter[] = [
  "all",
  "NEW",
  "CONTACTED",
  "CONVERTED",
  "ARCHIVED",
];

export default function Leads() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: leads, isLoading, error, refetch } = useLeads();

  const rawFilter = searchParams.get("status") as StatusFilter | null;
  const statusFilter: StatusFilter =
    rawFilter && VALID_FILTERS.includes(rawFilter) ? rawFilter : "all";

  function setStatusFilter(next: StatusFilter) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") nextParams.delete("status");
    else nextParams.set("status", next);
    setSearchParams(nextParams, { replace: true });
  }

  const counts = useMemo(() => {
    const acc: Record<LeadStatus, number> = {
      NEW: 0,
      CONTACTED: 0,
      CONVERTED: 0,
      ARCHIVED: 0,
    };
    for (const l of leads ?? []) acc[l.status]++;
    return acc;
  }, [leads]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (statusFilter === "all") return leads;
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  // Detail sheet driven by /leads/:id so ops emails can link straight to it
  const selected = useMemo(
    () => (routeId ? leads?.find((l) => l.id === routeId) ?? null : null),
    [routeId, leads]
  );

  function closeDetail() {
    navigate({ pathname: "/leads", search: searchParams.toString() });
  }

  const total = leads?.length ?? 0;

  return (
    <Layout
      title="Leads"
      description={
        total > 0
          ? `${counts.NEW} new · ${total} total`
          : "No enquiries yet"
      }
    >
      {error ? (
        <ErrorState
          title="Failed to load leads"
          error={error}
          onRetry={() => refetch()}
        />
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
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {(["all", "NEW", "CONTACTED", "CONVERTED", "ARCHIVED"] as StatusFilter[]).map(
              (s) => {
                const isActive = statusFilter === s;
                const label =
                  s === "all" ? "All" : STATUS_META[s as LeadStatus].label;
                const count =
                  s === "all" ? total : counts[s as LeadStatus];
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card hover:bg-muted/60 text-muted-foreground"
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "text-[10px] rounded px-1",
                        isActive
                          ? "bg-background/20 text-background"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              }
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              No leads match the "
              {statusFilter === "all" ? "all" : STATUS_META[statusFilter as LeadStatus].label}
              " filter.
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="border-b bg-muted/30">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-medium px-4 sm:px-5 py-3">
                        Name
                      </th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">
                        Email
                      </th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">
                        Status
                      </th>
                      <th className="text-left font-medium px-4 sm:px-5 py-3">
                        Received
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((l) => {
                      const hasMessage = Boolean(l.message?.trim());
                      return (
                        <tr
                          key={l.id}
                          onClick={() => navigate(`/leads/${l.id}`)}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 sm:px-5 py-3.5 font-medium">
                            <div className="flex items-center gap-2">
                              {l.name}
                              {hasMessage && (
                                <MessageSquare
                                  className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                                  aria-label="Has message"
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate max-w-[240px]">
                                {l.email}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                STATUS_META[l.status].badge
                              )}
                            >
                              {STATUS_META[l.status].label}
                            </span>
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(l.created_at), {
                              addSuffix: true,
                            })}
                          </td>
                        </tr>
                      );
                    })}
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

  // Reset local state whenever a different lead is selected so we don't show
  // stale edits from the previous one.
  useEffect(() => {
    if (lead) {
      setStatus(lead.status);
      setNotes(lead.notes ?? "");
      setConvertedTo(lead.converted_to_tenant_id ?? null);
    }
  }, [lead]);

  const convertedTenant = useMemo(
    () => (convertedTo ? tenants?.find((t) => t.id === convertedTo) ?? null : null),
    [convertedTo, tenants]
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
      <SheetContent className="sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lead.name}</SheetTitle>
          <SheetDescription>
            Received{" "}
            {format(new Date(lead.created_at), "d MMM yyyy, HH:mm")} from{" "}
            {lead.email}
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

          {/* Primary conversion action — jumps to the new-tenant form with
              name + email prefilled. After registration, the lead is
              automatically marked CONVERTED and linked. */}
          {lead.status !== "CONVERTED" && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-2.5">
                <UserPlus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Ready to convert?</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">
                    Opens the new-tenant form with practice name + email prefilled.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams({
                        fromLead: lead.id,
                        name: lead.name,
                        email: lead.email,
                      });
                      navigate(`/tenants/new?${params.toString()}`);
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

          {/* Link to tenant (only if CONVERTED) */}
          {status === "CONVERTED" && (
            <div className="space-y-1.5">
              <Label htmlFor="converted-tenant" className="text-xs text-muted-foreground">
                Linked tenant
              </Label>
              <Select
                value={convertedTo ?? "__none"}
                onValueChange={(v) => setConvertedTo(v === "__none" ? null : v)}
              >
                <SelectTrigger id="converted-tenant">
                  <SelectValue placeholder="Choose a tenant…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(Not linked yet)</SelectItem>
                  {tenants?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.practice_name} — {t.hostname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1"
          >
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className="flex-1"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
