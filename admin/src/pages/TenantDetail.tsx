import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  UserPlus,
  Pause,
  Play,
  CreditCard,
  Megaphone,
  CalendarPlus,
  Rocket,
  Activity,
  Users2,
  Calendar,
  AlertOctagon,
  Globe,
  Info,
  UserCircle2,
  Library,
  LineChart,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  useTenant,
  usePracticeMembers,
  useUpdatePractice,
  useExtendTrial,
  useConvertToActive,
  type Practice,
  type PracticeMember,
} from "@/hooks/useTenants";
import { useTenantActivity, useTenantUsage } from "@/hooks/useTenantActivity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DnsSetupGuide } from "@/components/DnsSetupGuide";
import { TenantProfileForm } from "@/components/TenantProfileForm";
import { EditMemberSheet } from "@/components/EditMemberSheet";
import { InviteMemberSheet } from "@/components/InviteMemberSheet";
import { TrialExpiryBanner } from "@/components/TrialExpiryBanner";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { PaymentHistoryList } from "@/components/PaymentHistoryList";
import { PracticeDocumentsPanel } from "@/components/documents/PracticeDocumentsPanel";
import { TenantInsightsPanel } from "@/components/insights/TenantInsightsPanel";
import { cn } from "@/lib/utils";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: practice, isLoading } = useTenant(id);
  const update = useUpdatePractice();
  const extendTrial = useExtendTrial();
  const convertToActive = useConvertToActive();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<PracticeMember | null>(null);
  const [confirmStatusChange, setConfirmStatusChange] = useState<null | "suspend" | "reactivate">(null);
  const [confirmConvert, setConfirmConvert] = useState(false);

  const { data: members, refetch: refetchMembers } = usePracticeMembers(id);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!practice) return <div className="p-6 text-sm text-destructive">Practice not found.</div>;

  async function applyStatusChange(newStatus: "ACTIVE" | "SUSPENDED") {
    if (!practice) return;
    try {
      await update.mutateAsync({ id: practice.id, patch: { status: newStatus } });
      toast.success(
        `${practice.name} ${newStatus === "SUSPENDED" ? "suspended" : "reactivated"}.`,
      );
      setConfirmStatusChange(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function applyConvert() {
    if (!practice) return;
    try {
      await convertToActive.mutateAsync({ id: practice.id });
      toast.success(`${practice.name} converted to ACTIVE`);
      setConfirmConvert(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function applyExtendTrial(days: number) {
    if (!practice) return;
    try {
      await extendTrial.mutateAsync({
        id: practice.id,
        days,
        currentEnd: practice.trial_ends_at,
      });
      toast.success(`Trial extended by ${days} day${days === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        All tenants
      </Link>

      {/* Sticky header — name + status badge stays visible while scrolling
          long member / payment / activity sections. */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{practice.name}</h1>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">{practice.slug}</div>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">{practice.status}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {practice.status === "TRIAL" && (
              <Button size="sm" onClick={() => setConfirmConvert(true)} disabled={convertToActive.isPending}>
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Convert to ACTIVE
              </Button>
            )}
            {practice.status !== "OFFBOARDED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmStatusChange(practice.status === "SUSPENDED" ? "reactivate" : "suspend")}
                disabled={update.isPending}
              >
                {practice.status === "SUSPENDED" ? (
                  <><Play className="h-3.5 w-3.5 mr-1.5" />Reactivate</>
                ) : (
                  <><Pause className="h-3.5 w-3.5 mr-1.5" />Suspend</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <TrialExpiryBanner practice={practice} />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5">
            <Users2 className="h-3.5 w-3.5" />Members
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />Billing
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <Library className="h-3.5 w-3.5" />Documents
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <LineChart className="h-3.5 w-3.5" />Insights
          </TabsTrigger>
          <TabsTrigger value="domain" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />Domain &amp; apps
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5" />Profile
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-2">
          <UsageStatsStrip practiceId={practice.id} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Contact">
              <Field label="Email" value={practice.primary_email ?? "—"} />
              <Field label="Phone" value={practice.primary_phone ?? "—"} />
              <Field label="City" value={practice.city ?? "—"} />
              <Field label="Postcode" value={practice.postcode ?? "—"} />
              <Field label="Country" value={practice.country} />
              <Field label="Timezone" value={practice.timezone} />
            </Section>

            <Section title="NHS / CQC">
              <Field label="NHS contract #" value={practice.nhs_contract_number ?? "—"} />
              <Field label="CQC provider ID" value={practice.cqc_provider_id ?? "—"} />
            </Section>

            <Section title="Lifecycle">
              <Field label="Created" value={format(new Date(practice.created_at), "d MMM yyyy HH:mm")} />
              <Field label="Updated" value={format(new Date(practice.updated_at), "d MMM yyyy HH:mm")} />
            </Section>
          </div>

          <TenantActivityCard practiceId={practice.id} />
        </TabsContent>

        <TabsContent value="members" className="space-y-2 mt-2">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-medium">Members</h2>
              <SeatUsage
                activeCount={(members ?? []).filter((m) => m.deleted_at === null).length}
                limit={practice.staff_seat_limit}
              />
            </div>
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              disabled={isAtSeatLimit(practice.staff_seat_limit, members)}
              title={
                isAtSeatLimit(practice.staff_seat_limit, members)
                  ? `Seat limit (${practice.staff_seat_limit}) reached`
                  : undefined
              }
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />Invite member
            </Button>
          </div>
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Name</th>
                    <th className="text-left font-medium px-4 py-2.5">Email</th>
                    <th className="text-left font-medium px-4 py-2.5">Role</th>
                    <th className="text-left font-medium px-4 py-2.5">Status</th>
                    <th className="text-left font-medium px-4 py-2.5">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {(members ?? []).map((m) => (
                    <tr
                      key={m.id}
                      className="border-t hover:bg-secondary/30 cursor-pointer"
                      onClick={() => setMemberToEdit(m)}
                    >
                      <td className="px-4 py-2.5">{m.full_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.email}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs">{m.role}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {m.is_active ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">active</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600">inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {format(new Date(m.created_at), "d MMM yyyy")}
                      </td>
                    </tr>
                  ))}
                  {(!members || members.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                        No members yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4 mt-2">
          <SubscriptionSection
            practice={practice}
            onExtend={applyExtendTrial}
            extending={extendTrial.isPending}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-medium">Payments</h2>
              <Button size="sm" onClick={() => setPaymentOpen(true)}>
                <CreditCard className="h-3.5 w-3.5 mr-1.5" />Record payment
              </Button>
            </div>
            <PaymentHistoryList practiceId={practice.id} />
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-2">
          <PracticeDocumentsPanel practiceId={practice.id} practiceName={practice.name} />
        </TabsContent>

        <TabsContent value="insights" className="mt-2">
          <TenantInsightsPanel practiceId={practice.id} practiceName={practice.name} />
        </TabsContent>

        <TabsContent value="domain" className="space-y-4 mt-2">
          <DnsSetupGuide practice={practice} />

          <PlanAndAppsCard
            practice={practice}
            onToggleMarketing={async (next) => {
              try {
                await update.mutateAsync({
                  id: practice.id,
                  patch: { marketing_site_enabled: next },
                });
                toast.success(
                  next ? "Marketing site published." : "Marketing site unpublished.",
                );
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
            onToggleBooking={async (next) => {
              try {
                await update.mutateAsync({
                  id: practice.id,
                  patch: { booking_app_enabled: next },
                });
                toast.success(
                  next
                    ? "Booking app enabled."
                    : "Booking app disabled. Existing sessions will hit a wall page.",
                );
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
            saving={update.isPending}
          />
        </TabsContent>

        <TabsContent value="profile" className="mt-2">
          <div className="border rounded-lg bg-card p-4 sm:p-6 max-w-2xl">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">
              Practice profile
            </div>
            <TenantProfileForm tenant={practice} />
          </div>
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        practiceId={practice.id}
        practiceName={practice.name}
      />
      <InviteMemberSheet
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) refetchMembers();
        }}
        practiceId={practice.id}
        practiceName={practice.name}
      />
      <EditMemberSheet
        open={memberToEdit !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToEdit(null);
            refetchMembers();
          }
        }}
        member={memberToEdit}
        practiceHostname={practice.custom_hostname}
      />

      <ConfirmDialog
        open={confirmStatusChange === "suspend"}
        onOpenChange={(o) => !o && setConfirmStatusChange(null)}
        title={`Suspend ${practice.name}?`}
        description="Suspended practices can't sign in to the booking app. Existing data is kept; you can reactivate later."
        confirmLabel="Suspend"
        variant="destructive"
        onConfirm={() => applyStatusChange("SUSPENDED")}
      />
      <ConfirmDialog
        open={confirmStatusChange === "reactivate"}
        onOpenChange={(o) => !o && setConfirmStatusChange(null)}
        title={`Reactivate ${practice.name}?`}
        description="Members will be able to sign in to the booking app again."
        confirmLabel="Reactivate"
        onConfirm={() => applyStatusChange("ACTIVE")}
      />
      <ConfirmDialog
        open={confirmConvert}
        onOpenChange={setConfirmConvert}
        title={`Convert ${practice.name} to ACTIVE?`}
        description="Status will move from TRIAL to ACTIVE and the trial countdown will be cleared. Use this when their first payment has been received."
        confirmLabel="Convert to ACTIVE"
        onConfirm={applyConvert}
      />
    </div>
  );
}

// Subscription panel with inline trial-extension actions. The "+14d" / "+30d"
// buttons handle the most common operator request without the operator
// having to manually edit the trial_ends_at field.
function SubscriptionSection({
  practice,
  onExtend,
  extending,
}: {
  practice: Practice;
  onExtend: (days: number) => void;
  extending: boolean;
}) {
  const isTrial = practice.status === "TRIAL";
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
        Subscription
      </div>
      <div className="space-y-2">
        <Field label="Plan" value={practice.plan} />
        <Field
          label="Trial started"
          value={practice.trial_started_at ? format(new Date(practice.trial_started_at), "d MMM yyyy") : "—"}
        />
        <Field
          label="Trial ends"
          value={practice.trial_ends_at ? format(new Date(practice.trial_ends_at), "d MMM yyyy") : "—"}
        />
      </div>
      {isTrial && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <CalendarPlus className="h-3 w-3" />
            Extend trial
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => onExtend(7)} disabled={extending} className="h-7 text-xs">+7d</Button>
            <Button size="sm" variant="outline" onClick={() => onExtend(14)} disabled={extending} className="h-7 text-xs">+14d</Button>
            <Button size="sm" variant="outline" onClick={() => onExtend(30)} disabled={extending} className="h-7 text-xs">+30d</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={extending}>More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onExtend(60)}>+60 days</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExtend(90)}>+90 days</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick-glance per-tenant counts. Mirrors the global Overview's stats but
// scoped to this practice so operators can answer "how big are they?" in
// one look.
function UsageStatsStrip({ practiceId }: { practiceId: string }) {
  const { data, isLoading } = useTenantUsage(practiceId);
  const tiles: Array<{ icon: typeof Users2; label: string; value: number | undefined; warn?: boolean }> = [
    { icon: Users2, label: "Patients", value: data?.patients },
    { icon: Calendar, label: "Appts (30d)", value: data?.appointments_30d },
    { icon: AlertOctagon, label: "Open incidents", value: data?.open_incidents, warn: (data?.open_incidents ?? 0) > 0 },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map(({ icon: Icon, label, value, warn }) => (
        <div
          key={label}
          className={cn(
            "rounded-lg border bg-card p-3",
            warn && "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</span>
            <Icon className={cn("h-3.5 w-3.5", warn ? "text-amber-600" : "text-muted-foreground/60")} />
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {isLoading ? <Skeleton className="h-6 w-10" /> : (value ?? 0).toLocaleString("en-GB")}
          </div>
        </div>
      ))}
    </div>
  );
}

// Last 20 audit entries scoped to this practice. Same row format as the
// Overview activity feed.
function TenantActivityCard({ practiceId }: { practiceId: string }) {
  const { data: entries, isLoading } = useTenantActivity(practiceId, 20);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>
        <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground">
          All audit →
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : !entries || entries.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No activity yet for this practice.</div>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                  e.action === "INSERT" && "bg-blue-100 text-blue-700",
                  e.action === "UPDATE" && "bg-slate-100 text-slate-700",
                  e.action === "DELETE" && "bg-red-100 text-red-700",
                )}
              >
                {e.action}
              </span>
              <span className="font-mono text-xs text-muted-foreground shrink-0">{e.entity_type}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{e.performed_by_email ?? "system"}</span>
              <span
                className="text-xs text-muted-foreground shrink-0 tabular-nums"
                title={format(new Date(e.performed_at), "d MMM yyyy HH:mm:ss")}
              >
                {formatDistanceToNow(new Date(e.performed_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Plan-control card — two toggles describe what the practice has bought:
//   marketing site + booking app = full package
//   marketing site only          = website-only plan
//   booking app only             = internal scheduling, no public site
//
// Marketing site toggle requires a custom_hostname (renders disabled until
// one is set above). Booking app toggle has no prerequisites — it gates
// the web/ app for practice members and what form the marketing site''s
// /book page renders. Operator-controlled so admins can flip plans without
// touching the DB.
function PlanAndAppsCard({
  practice,
  onToggleMarketing,
  onToggleBooking,
  saving,
}: {
  practice: Practice;
  onToggleMarketing: (next: boolean) => void;
  onToggleBooking: (next: boolean) => void;
  saving: boolean;
}) {
  const marketingEnabled = practice.marketing_site_enabled;
  const bookingEnabled = practice.booking_app_enabled;
  const hostname = practice.custom_hostname;
  const canEnableMarketing = !!hostname;
  // Marketing lives at the bare practice domain; booking app at app.<that>.
  // The strip-prefix lookup (migration 0041) routes both to the same
  // practice. If someone stored an `app.`-prefixed hostname, normalise
  // here for display so the URLs are correct either way.
  const bareHostname = hostname?.replace(/^app\./i, "") ?? null;
  const bookingHostname = bareHostname ? `app.${bareHostname}` : null;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
        Plan & apps
      </div>

      <ToggleRow
        icon={<Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />}
        title="Marketing site"
        statusBadge={
          marketingEnabled ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded">
              Live
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              Off
            </span>
          )
        }
        description={
          marketingEnabled
            ? bareHostname ? (
                <>Public website is published at <a href={`https://${bareHostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{bareHostname}</a>.</>
              ) : (
                "Toggled on, but no domain assigned. Visitors will see nothing."
              )
            : canEnableMarketing
              ? "Visitors to the practice domain will see a 'coming soon' page until you toggle this on."
              : "Set a practice domain above first — the marketing site lives at the bare hostname."
        }
        switchProps={{
          checked: marketingEnabled,
          disabled: saving || !canEnableMarketing,
          onCheckedChange: onToggleMarketing,
          "aria-label": "Marketing site enabled",
        }}
      />

      <div className="border-t my-2" />

      <ToggleRow
        icon={<Calendar className="h-4 w-4 text-muted-foreground shrink-0" />}
        title="Booking app"
        statusBadge={
          bookingEnabled ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded">
              Active
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              Off
            </span>
          )
        }
        description={
          bookingEnabled
            ? bookingHostname ? (
                <>Practice members sign in at <a href={`https://${bookingHostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{bookingHostname}</a>. Marketing site /book page shows the full booking wizard.</>
              ) : (
                "Practice members can sign in. Marketing site /book page shows the full booking wizard."
              )
            : "Practice members hit a wall page after sign-in. Marketing site /book shows a simple enquiry form."
        }
        switchProps={{
          checked: bookingEnabled,
          disabled: saving,
          onCheckedChange: onToggleBooking,
          "aria-label": "Booking app enabled",
        }}
      />
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  statusBadge,
  description,
  switchProps,
}: {
  icon: React.ReactNode;
  title: string;
  statusBadge: React.ReactNode;
  description: React.ReactNode;
  switchProps: React.ComponentProps<typeof Switch>;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
          {statusBadge}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Switch {...switchProps} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function SeatUsage({ activeCount, limit }: { activeCount: number; limit: number | null }) {
  if (limit === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {activeCount} active · unlimited
      </span>
    );
  }
  const atLimit = activeCount >= limit;
  return (
    <span
      className={cn(
        "text-xs",
        atLimit ? "text-amber-700 font-medium" : "text-muted-foreground",
      )}
    >
      {activeCount} / {limit} seats used
    </span>
  );
}

function isAtSeatLimit(limit: number | null, members: PracticeMember[] | undefined): boolean {
  if (limit === null) return false;
  const active = (members ?? []).filter((m) => m.deleted_at === null).length;
  return active >= limit;
}
