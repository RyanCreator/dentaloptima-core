import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Plus, Pencil, X, BadgeCheck, Calendar as CalendarIcon, Clock, Send } from "lucide-react";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageLoading } from "@/components/PageLoading";
import {
  useLatestRequestForStaff,
  createNhsPerformerRequest,
} from "@/hooks/useNhsPerformerRequests";

// NHS performer registration management for a single staff member.
// Surfaces the `nhs_performer` table from migration 0010 — required on
// every FP17 claim. Kept under "Staff details" because the data is
// per-clinician, not practice-wide; the unique-by-(staff, number, from)
// constraint at the DB level lets the same staff member have multiple
// historical records when their performer number changes.
//
// What "currently active" means: the row's is_active flag is true AND its
// effective_to is either null (open-ended) or in the future. We use that
// as the primary surface; older / superseded records collapse into a
// history list underneath.

interface PerformerRow {
  id: string;
  practice_id: string;
  staff_id: string;
  performer_number: string;
  provider_number: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface NHSPerformerSectionProps {
  staffId: string;
  // True when the viewer is OWNER/ADMIN of this practice. Drives whether
  // the add/edit/end controls show — RLS already blocks non-admins, but we
  // hide the buttons so they don't see UI that would just toast an error.
  isAdmin: boolean;
  // True when the staffId being viewed matches the viewer's own
  // practice_member id. When non-admin + own profile + no active reg,
  // we show a "Request setup" button instead.
  isOwnProfile: boolean;
}

export function NHSPerformerSection({ staffId, isAdmin, isOwnProfile }: NHSPerformerSectionProps) {
  const tenant = usePractice();
  const auth = useAuth();
  const practiceId = tenant.practice.id;

  const [rows, setRows] = useState<PerformerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing] = useState<PerformerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nhs_performer")
      .select(
        "id, practice_id, staff_id, performer_number, provider_number, effective_from, effective_to, is_active, notes, created_at",
      )
      .eq("staff_id", staffId)
      .order("effective_from", { ascending: false });

    if (error) {
      logger.error("Failed to load NHS performers", error);
      toast.error("Failed to load NHS performers");
    } else {
      setRows((data ?? []) as PerformerRow[]);
    }
    setLoading(false);
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = format(new Date(), "yyyy-MM-dd");

  const { active, history } = useMemo(() => {
    const a: PerformerRow[] = [];
    const h: PerformerRow[] = [];
    for (const row of rows) {
      const isCurrent =
        row.is_active && (!row.effective_to || row.effective_to >= today);
      if (isCurrent) a.push(row);
      else h.push(row);
    }
    return { active: a, history: h };
  }, [rows, today]);

  const openCreate = () => {
    setEditing(null);
    setShowSheet(true);
  };
  const openEdit = (row: PerformerRow) => {
    setEditing(row);
    setShowSheet(true);
  };

  // Request-flow state for non-admin clinicians viewing their own profile.
  const { latest: latestRequest } = useLatestRequestForStaff(
    !isAdmin && isOwnProfile ? staffId : null,
  );
  const [requesting, setRequesting] = useState(false);
  const handleRequest = async () => {
    if (!auth.member) {
      toast.error("Couldn't identify your practice member record. Try refreshing.");
      return;
    }
    setRequesting(true);
    try {
      await createNhsPerformerRequest(practiceId, staffId, auth.member.id);
      toast.success("Request sent — your practice admin has been notified.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  const endRecord = async (row: PerformerRow) => {
    if (
      !confirm(
        `End performer registration ${row.performer_number}? This sets today as the last effective date — historical FP17 claims keep the link.`,
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("nhs_performer")
      .update({
        is_active: false,
        effective_to: today,
      })
      .eq("id", row.id);

    if (error) {
      toast.error(
        error.message?.includes("permission")
          ? "Only practice owners and admins can change NHS performers"
          : "Failed to end registration",
      );
    } else {
      toast.success("Registration ended");
      await load();
    }
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">NHS <GlossaryTerm term="Performer">performer</GlossaryTerm></h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            <GlossaryTerm term="NHSBSA" /> performer registration. Required on every{" "}
            <GlossaryTerm term="FP17" /> claim — set this before submitting any NHS
            work for this clinician.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add registration
          </Button>
        )}
      </div>

      {loading ? (
        <PageLoading variant="inline" label="Loading registrations..." />
      ) : (
        <div className="space-y-4">
          {active.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                No active NHS performer registration. {isAdmin
                  ? "Add one to enable FP17 claim creation for this clinician."
                  : "Your practice admin needs to set this up before you can submit FP17 claims."}
              </p>

              {/* Non-admin viewing their own profile gets a Request button.
                  We disable it when there's already a PENDING request — the
                  unique partial index would reject a duplicate anyway, but
                  showing the pending state is friendlier than a toast. */}
              {!isAdmin && isOwnProfile && (
                latestRequest?.status === "PENDING" ? (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50/60 dark:bg-amber-950/20 dark:text-amber-200 border border-amber-300/60 rounded-md px-3 py-2">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Request sent {formatDistanceToNow(parseISO(latestRequest.created_at), { addSuffix: true })} —
                      awaiting practice admin.
                    </span>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleRequest} disabled={requesting}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {requesting ? "Sending request…" : "Request NHS performer setup"}
                  </Button>
                )
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((row) => (
                <PerformerCard
                  key={row.id}
                  row={row}
                  isCurrent
                  canEdit={isAdmin}
                  onEdit={() => openEdit(row)}
                  onEnd={() => endRecord(row)}
                />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <details className="rounded-md border bg-muted/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none">
                Past registrations ({history.length})
              </summary>
              <div className="border-t divide-y">
                {history.map((row) => (
                  <PerformerCard
                    key={row.id}
                    row={row}
                    isCurrent={false}
                    canEdit={isAdmin}
                    onEdit={() => openEdit(row)}
                    onEnd={() => {}}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <PerformerFormSheet
        open={showSheet}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
          setShowSheet(o);
        }}
        practiceId={practiceId}
        staffId={staffId}
        editing={editing}
        onSaved={async () => {
          setShowSheet(false);
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}

function PerformerCard({
  row,
  isCurrent,
  canEdit,
  onEdit,
  onEnd,
}: {
  row: PerformerRow;
  isCurrent: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3",
        isCurrent ? "bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-200/60" : "bg-card",
      )}
    >
      <div className="h-9 w-9 rounded-md bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
        <BadgeCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm">{row.performer_number}</span>
          {isCurrent && (
            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-1.5 py-0.5 rounded">
              Active
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Provider {row.provider_number} · Effective from{" "}
          {format(parseISO(row.effective_from), "d MMM yyyy")}
          {row.effective_to && (
            <> to {format(parseISO(row.effective_to), "d MMM yyyy")}</>
          )}
        </div>
        {row.notes && (
          <div className="text-xs text-muted-foreground italic mt-1">{row.notes}</div>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 w-7 p-0" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {isCurrent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEnd}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="End registration"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PerformerFormSheet({
  open,
  onOpenChange,
  practiceId,
  staffId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
  staffId: string;
  editing: PerformerRow | null;
  onSaved: () => void | Promise<void>;
}) {
  const [performerNumber, setPerformerNumber] = useState("");
  const [providerNumber, setProviderNumber] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [effectiveTo, setEffectiveTo] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill from `editing` whenever the sheet opens / mode flips.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPerformerNumber(editing.performer_number);
      setProviderNumber(editing.provider_number);
      setEffectiveFrom(parseISO(editing.effective_from));
      setEffectiveTo(editing.effective_to ? parseISO(editing.effective_to) : undefined);
      setNotes(editing.notes ?? "");
    } else {
      setPerformerNumber("");
      setProviderNumber("");
      setEffectiveFrom(new Date());
      setEffectiveTo(undefined);
      setNotes("");
    }
  }, [open, editing]);

  const submit = async () => {
    if (!performerNumber.trim() || !providerNumber.trim()) {
      toast.error("Performer and provider numbers are both required");
      return;
    }
    if (!effectiveFrom) {
      toast.error("Pick the effective-from date");
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      toast.error("End date must be on or after the start date");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        practice_id: practiceId,
        staff_id: staffId,
        performer_number: performerNumber.trim(),
        provider_number: providerNumber.trim(),
        effective_from: format(effectiveFrom, "yyyy-MM-dd"),
        effective_to: effectiveTo ? format(effectiveTo, "yyyy-MM-dd") : null,
        notes: notes.trim() || null,
        is_active: true,
      };

      const { error } = editing
        ? await supabase.from("nhs_performer").update(payload).eq("id", editing.id)
        : await supabase.from("nhs_performer").insert(payload);

      if (error) {
        if (error.code === "23505") {
          toast.error(
            "This performer number is already registered for this staff member starting on that date.",
          );
        } else if (error.message?.includes("permission")) {
          toast.error("Only practice owners and admins can change NHS performers");
        } else {
          toast.error(`Failed to save: ${error.message}`);
        }
        return;
      }

      toast.success(editing ? "Registration updated" : "Registration added");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit NHS Registration" : "Add NHS Registration"}</SheetTitle>
          <SheetDescription className="sr-only">
            Set the staff member's NHSBSA performer number and the practice's
            provider number. Required on every FP17 claim.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Performer number *</Label>
            <Input
              value={performerNumber}
              onChange={(e) => setPerformerNumber(e.target.value.trim())}
              placeholder="e.g. 123456"
              inputMode="numeric"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              The clinician's 6-digit NHSBSA performer number.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Provider number *</Label>
            <Input
              value={providerNumber}
              onChange={(e) => setProviderNumber(e.target.value.trim())}
              placeholder="e.g. 12345"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Your practice's NHSBSA provider number — same on every staff
              member's registration. Stored per-row so historical claims keep
              the right linkage if the practice's number ever changes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Effective from *</Label>
              <DatePickerButton value={effectiveFrom} onChange={setEffectiveFrom} />
            </div>
            <div className="space-y-1.5">
              <Label>Effective to</Label>
              <DatePickerButton
                value={effectiveTo}
                onChange={setEffectiveTo}
                placeholder="Open-ended"
                disabledBefore={effectiveFrom}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes — not submitted to NHSBSA"
            />
          </div>

          <Button onClick={submit} disabled={saving} className="w-full">
            {saving
              ? "Saving..."
              : editing
              ? "Save changes"
              : "Add registration"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DatePickerButton({
  value,
  onChange,
  placeholder,
  disabledBefore,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder?: string;
  disabledBefore?: Date;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : placeholder ?? "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={disabledBefore ? (date) => date < disabledBefore : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
