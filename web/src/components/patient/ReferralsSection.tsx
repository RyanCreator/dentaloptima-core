import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { Plus, Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Referral {
  id: string;
  patient_id: string;
  referring_staff_id: string | null;
  specialist_name: string;
  specialist_practice: string | null;
  specialist_contact: string | null;
  reason: string;
  notes: string | null;
  sent_at: string | null;
  status: string;
  response_received_at: string | null;
  response_summary: string | null;
  created_at: string;
  staff?: { full_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

interface ReferralsSectionProps {
  patientId: string;
}

export function ReferralsSection({ patientId }: ReferralsSectionProps) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    specialist_name: "",
    specialist_practice: "",
    specialist_contact: "",
    reason: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referral")
      .select("*, staff:referring_staff_id(full_name)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) logger.error("Error loading referrals", error);
    else setReferrals(data || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.specialist_name.trim() || !form.reason.trim()) return;
    setSaving(true);

    const { data: staffData } = await supabase
      .from("app_staff")
      .select("id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { error } = await supabase.from("referral").insert({
      patient_id: patientId,
      referring_staff_id: staffData?.id || null,
      specialist_name: form.specialist_name.trim(),
      specialist_practice: form.specialist_practice.trim() || null,
      specialist_contact: form.specialist_contact.trim() || null,
      reason: form.reason.trim(),
      notes: form.notes.trim() || null,
    });

    if (error) {
      toast.error("Failed to create referral");
    } else {
      toast.success("Referral created");
      setShowCreate(false);
      setForm({ specialist_name: "", specialist_practice: "", specialist_contact: "", reason: "", notes: "" });
      await load();
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, any> = { status };
    if (status === "SENT") updates.sent_at = new Date().toISOString();
    if (status === "ACCEPTED" || status === "DECLINED") updates.response_received_at = new Date().toISOString();

    const { error } = await supabase.from("referral").update(updates).eq("id", id);
    if (error) toast.error("Failed to update referral");
    else await load();
  };

  return (
    <div className="bg-card rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Referrals</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No referrals</p>
      ) : (
        <div className="space-y-2">
          {referrals.map((ref) => (
            <div key={ref.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{ref.specialist_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[ref.status] || ""}`}>
                      {ref.status}
                    </span>
                  </div>
                  {ref.specialist_practice && (
                    <p className="text-xs text-muted-foreground">{ref.specialist_practice}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(ref.created_at), "d MMM yy")}
                </span>
              </div>

              <p className="text-xs">{ref.reason}</p>

              {ref.notes && <p className="text-xs text-muted-foreground">{ref.notes}</p>}

              {ref.response_summary && (
                <div className="text-xs bg-muted/50 rounded p-2">
                  <span className="font-medium">Response: </span>{ref.response_summary}
                </div>
              )}

              <div className="flex items-center gap-1.5 pt-1">
                {ref.status === "DRAFT" && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(ref.id, "SENT")} className="h-6 text-[10px] px-2">
                    <Send className="h-3 w-3 mr-1" /> Mark Sent
                  </Button>
                )}
                {ref.status === "SENT" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => updateStatus(ref.id, "ACCEPTED")} className="h-6 text-[10px] px-2 text-green-700">
                      Accepted
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => updateStatus(ref.id, "DECLINED")} className="h-6 text-[10px] px-2 text-red-700">
                      Declined
                    </Button>
                  </>
                )}
                {(ref.status === "ACCEPTED") && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(ref.id, "COMPLETED")} className="h-6 text-[10px] px-2 text-emerald-700">
                    Complete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create referral sheet */}
      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Referral</SheetTitle>
            <SheetDescription className="sr-only">Create a specialist referral for this patient</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>Specialist name *</Label>
              <Input value={form.specialist_name} onChange={(e) => setForm((f) => ({ ...f, specialist_name: e.target.value }))} placeholder="e.g. Dr Sarah Mitchell" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Practice</Label>
                <Input value={form.specialist_practice} onChange={(e) => setForm((f) => ({ ...f, specialist_practice: e.target.value }))} placeholder="Practice name" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={form.specialist_contact} onChange={(e) => setForm((f) => ({ ...f, specialist_contact: e.target.value }))} placeholder="Phone or email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for referral *</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Clinical reason for the referral..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." />
            </div>
            <Button onClick={handleCreate} disabled={saving || !form.specialist_name.trim() || !form.reason.trim()} className="w-full">
              {saving ? "Creating..." : "Create Referral"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
