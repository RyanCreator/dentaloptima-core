import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Pencil, UserPlus, Pause, Play, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, useUpdatePractice } from "@/hooks/useTenants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditTenantSheet } from "@/components/EditTenantSheet";
import { InviteMemberSheet } from "@/components/InviteMemberSheet";
import { TrialExpiryBanner } from "@/components/TrialExpiryBanner";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { PaymentHistoryList } from "@/components/PaymentHistoryList";
import { format } from "date-fns";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: practice, isLoading } = useTenant(id);
  const update = useUpdatePractice();
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ["practice-members", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_member")
        .select("id, role, full_name, email, is_active, created_at")
        .eq("practice_id", id!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!practice) return <div className="p-6 text-sm text-destructive">Practice not found.</div>;

  async function toggleStatus() {
    if (!practice) return;
    const newStatus = practice.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const verb = newStatus === "SUSPENDED" ? "Suspend" : "Reactivate";
    if (!confirm(`${verb} ${practice.name}?`)) return;
    try {
      await update.mutateAsync({ id: practice.id, patch: { status: newStatus } });
      toast.success(`${practice.name} ${newStatus === "SUSPENDED" ? "suspended" : "reactivated"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        All tenants
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{practice.name}</h1>
          <div className="text-sm text-muted-foreground font-mono mt-1">{practice.slug}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">{practice.status}</Badge>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
          {practice.status !== "OFFBOARDED" && (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleStatus}
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

      <TrialExpiryBanner practice={practice} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Subscription">
          <Field label="Plan" value={practice.plan} />
          <Field label="Trial started" value={practice.trial_started_at ? format(new Date(practice.trial_started_at), "d MMM yyyy") : "—"} />
          <Field label="Trial ends" value={practice.trial_ends_at ? format(new Date(practice.trial_ends_at), "d MMM yyyy") : "—"} />
        </Section>

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

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-medium">Members</h2>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />Invite member
          </Button>
        </div>
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Email</th>
                <th className="text-left font-medium px-4 py-2.5">Role</th>
                <th className="text-left font-medium px-4 py-2.5">Active</th>
                <th className="text-left font-medium px-4 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2.5">{m.full_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-xs">{m.role}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.is_active ? "Yes" : "No"}</td>
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-medium">Payments</h2>
          <Button size="sm" onClick={() => setPaymentOpen(true)}>
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />Record payment
          </Button>
        </div>
        <PaymentHistoryList practiceId={practice.id} />
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        practiceId={practice.id}
        practiceName={practice.name}
      />
      <EditTenantSheet open={editOpen} onOpenChange={setEditOpen} tenant={practice} />
      <InviteMemberSheet
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) refetchMembers();
        }}
        practiceId={practice.id}
        practiceName={practice.name}
      />
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
      <div className="font-medium">{value}</div>
    </div>
  );
}
