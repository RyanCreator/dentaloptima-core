import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { CalendarIcon, Plus, Trash2, Clock, Ban, Flag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageLoading } from "@/components/PageLoading";
import { cn } from "@/lib/utils";
import { useUkBankHolidays, type BankHolidayRegion } from "@/hooks/useUkBankHolidays";

// Practice-level "when are we open?" management. Two concerns, one screen:
//
//   1. Weekly operating hours (`practice_hours`)
//      - One row per weekday holds the current open_time / close_time.
//        NULL open_time means closed that day.
//      - The schema also versions hours via effective_from/effective_to —
//        the row currently in force has effective_to IS NULL. We treat
//        that as the canonical row and update it in place; future versioning
//        (e.g. summer hours) is out of scope for this page.
//
//   2. One-off closures (`practice_closure`)
//      - Bank holidays, training days, partial early-closes.
//      - is_full_day defaults to true; the optional starts_time/ends_time
//        let admins close for part of a day.
//
// RLS: anyone on the practice can read; only OWNER/ADMIN can write. Failed
// writes show a friendly toast rather than swallowing the error.

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
];

interface PracticeHoursRow {
  id: string;
  practice_id: string;
  weekday: Weekday;
  open_time: string | null;
  close_time: string | null;
}

interface PracticeClosureRow {
  id: string;
  practice_id: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  is_full_day: boolean;
  starts_time: string | null;
  ends_time: string | null;
}

// Per-day editor state — separate from PracticeHoursRow because we let
// admins toggle closed without deleting the underlying row, and because the
// time inputs need empty-string fallbacks for unmounted Inputs.
interface DayState {
  weekday: Weekday;
  rowId: string | null; // null = no row for this weekday yet, INSERT on save
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  dirty: boolean;
}

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";

// time columns in Postgres come back as "HH:mm:ss"; Inputs of type=time want "HH:mm".
function trimSeconds(t: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function HoursAndClosures() {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

  return (
    <Tabs defaultValue="hours">
      <TabsList>
        <TabsTrigger value="hours" className="gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Weekly hours
        </TabsTrigger>
        <TabsTrigger value="closures" className="gap-1.5">
          <Ban className="h-3.5 w-3.5" />
          Closures
        </TabsTrigger>
        <TabsTrigger value="bank-holidays" className="gap-1.5">
          <Flag className="h-3.5 w-3.5" />
          Bank holidays
        </TabsTrigger>
      </TabsList>
      <TabsContent value="hours" className="mt-4">
        <WeeklyHoursEditor practiceId={practiceId} />
      </TabsContent>
      <TabsContent value="closures" className="mt-4">
        <ClosuresManager practiceId={practiceId} />
      </TabsContent>
      <TabsContent value="bank-holidays" className="mt-4">
        <BankHolidaysEditor />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// Bank holidays
// ============================================================================
// Read/write practice_setting columns added in migration 0048.
// `show_bank_holidays` toggles the calendar markers + day-view banner.
// `bank_holidays_region` picks which gov.uk feed to use — Scotland and
// Northern Ireland have different dates from England & Wales (2 Jan,
// St Patrick's Day, Battle of the Boyne, etc.).
//
// We don't store the holiday rows themselves — the calendar fetches
// gov.uk live (cached in localStorage). This screen just configures the
// toggle + preview the next 6 holidays for the chosen region so the
// operator knows what they're opting into.
function BankHolidaysEditor() {
  const [enabled, setEnabled] = useState(true);
  const [region, setRegion] = useState<BankHolidayRegion>("england-and-wales");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_setting")
      .select("show_bank_holidays, bank_holidays_region")
      .single();
    if (error) {
      logger.error("Failed to load bank-holiday settings", error);
    } else if (data) {
      setEnabled(data.show_bank_holidays ?? true);
      setRegion(
        (data.bank_holidays_region as BankHolidayRegion) ?? "england-and-wales",
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: { enabled?: boolean; region?: BankHolidayRegion }) => {
    setSaving(true);
    const nextEnabled = patch.enabled ?? enabled;
    const nextRegion = patch.region ?? region;
    const { error } = await supabase
      .from("practice_setting")
      .update({
        show_bank_holidays: nextEnabled,
        bank_holidays_region: nextRegion,
      });
    setSaving(false);
    if (error) {
      logger.error("Failed to save bank-holiday settings", error);
      toast.error("Couldn't save bank-holiday settings");
      return;
    }
    setEnabled(nextEnabled);
    setRegion(nextRegion);
    toast.success("Saved");
  };

  // Preview the next 6 upcoming holidays for the picked region so the
  // operator sees the impact of their choice without having to scroll
  // the calendar to confirm.
  const { holidays } = useUkBankHolidays(region, true);
  const upcoming = holidays
    .filter((h) => h.date >= format(new Date(), "yyyy-MM-dd"))
    .slice(0, 6);

  if (loading) {
    return <PageLoading variant="inline" label="Loading bank-holiday settings..." />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-base font-semibold">UK bank holidays on the calendar</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Surface UK bank holidays as a quiet marker (a red dot on the
          date in month / week views, a banner in day view). Holidays
          come from{" "}
          <a
            href="https://www.gov.uk/bank-holidays"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2"
          >
            gov.uk
          </a>{" "}
          so they stay accurate year-on-year without any action from you.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => save({ enabled: v })}
          disabled={saving}
          aria-label="Show bank holidays on the calendar"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Show bank holidays on the calendar
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Doesn't auto-close the practice — just shows the date so
            you can decide. Untick to hide entirely.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bh-region" className="text-xs uppercase tracking-wide">
          Region
        </Label>
        <Select
          value={region}
          onValueChange={(v) => save({ region: v as BankHolidayRegion })}
          disabled={!enabled || saving}
        >
          <SelectTrigger id="bh-region" className="w-full sm:w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="england-and-wales">England &amp; Wales</SelectItem>
            <SelectItem value="scotland">Scotland</SelectItem>
            <SelectItem value="northern-ireland">Northern Ireland</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Holidays differ across UK nations — e.g. 2 January is a holiday
          in Scotland but not in England.
        </p>
      </div>

      {enabled && upcoming.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 font-medium">
            Next {upcoming.length} holidays for this region
          </p>
          <ul className="rounded-lg border bg-card divide-y">
            {upcoming.map((h) => (
              <li key={h.date} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="font-medium">{h.title}</span>
                <span className="text-muted-foreground">
                  {format(parseISO(h.date), "EEEE d MMMM yyyy")}
                </span>
                {h.notes && (
                  <span className="text-muted-foreground text-xs">· {h.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Weekly hours
// ============================================================================
function WeeklyHoursEditor({ practiceId }: { practiceId: string }) {
  const [days, setDays] = useState<DayState[]>(() =>
    WEEKDAYS.map((w) => ({
      weekday: w.value,
      rowId: null,
      isOpen: false,
      openTime: DEFAULT_OPEN,
      closeTime: DEFAULT_CLOSE,
      dirty: false,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_hours")
      .select("id, practice_id, weekday, open_time, close_time")
      .is("effective_to", null)
      .order("weekday");

    if (error) {
      logger.error("Failed to load practice hours", error);
      toast.error("Failed to load operating hours");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as PracticeHoursRow[];
    setDays(
      WEEKDAYS.map((w) => {
        const row = rows.find((r) => r.weekday === w.value);
        if (!row) {
          return {
            weekday: w.value,
            rowId: null,
            isOpen: false,
            openTime: DEFAULT_OPEN,
            closeTime: DEFAULT_CLOSE,
            dirty: false,
          };
        }
        const isOpen = !!row.open_time && !!row.close_time;
        return {
          weekday: w.value,
          rowId: row.id,
          isOpen,
          openTime: trimSeconds(row.open_time) || DEFAULT_OPEN,
          closeTime: trimSeconds(row.close_time) || DEFAULT_CLOSE,
          dirty: false,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDay = (weekday: Weekday, patch: Partial<DayState>) => {
    setDays((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch, dirty: true } : d)),
    );
  };

  const anyDirty = days.some((d) => d.dirty);

  const save = async () => {
    // Validate before round-tripping to the DB. Catches the "close before
    // open" case the schema CHECK would also catch, but with a friendly
    // message on the right row.
    for (const day of days) {
      if (day.isOpen && day.openTime >= day.closeTime) {
        toast.error(
          `${labelFor(day.weekday)}: closing time must be after opening time`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const dirty = days.filter((d) => d.dirty);

      // Two parallel batches: rows that exist (UPDATE) vs rows we need to
      // create (INSERT). Saves a round-trip per dirty day.
      const updates = dirty.filter((d) => d.rowId !== null);
      const inserts = dirty.filter((d) => d.rowId === null);

      const updateOps = updates.map((d) =>
        supabase
          .from("practice_hours")
          .update({
            open_time: d.isOpen ? d.openTime : null,
            close_time: d.isOpen ? d.closeTime : null,
          })
          .eq("id", d.rowId as string),
      );

      const insertRows = inserts.map((d) => ({
        practice_id: practiceId,
        weekday: d.weekday,
        open_time: d.isOpen ? d.openTime : null,
        close_time: d.isOpen ? d.closeTime : null,
      }));

      const insertOp =
        insertRows.length > 0
          ? supabase.from("practice_hours").insert(insertRows)
          : null;

      const results = await Promise.all([...updateOps, insertOp].filter(Boolean));

      const firstError = results.find((r: any) => r && r.error)?.error;
      if (firstError) {
        toast.error(
          firstError.message?.includes("permission")
            ? "Only practice owners and admins can change opening hours"
            : `Failed to save hours: ${firstError.message}`,
        );
        return;
      }

      toast.success("Opening hours saved");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Operating hours</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sets the booking window for the public form and the calendar grid.
          Changes take effect immediately.
        </p>
      </div>

      {loading ? (
        <PageLoading variant="inline" label="Loading hours..." />
      ) : (
        <>
          <div className="rounded-lg border bg-card divide-y">
            {days.map((day) => (
              <div
                key={day.weekday}
                className="grid grid-cols-[100px,80px,1fr] sm:grid-cols-[120px,90px,1fr] gap-3 items-center px-4 py-3"
              >
                <div className="text-sm font-medium">{labelFor(day.weekday)}</div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`open-${day.weekday}`}
                    checked={day.isOpen}
                    onCheckedChange={(v) => updateDay(day.weekday, { isOpen: v })}
                  />
                  <Label
                    htmlFor={`open-${day.weekday}`}
                    className="text-xs text-muted-foreground"
                  >
                    {day.isOpen ? "Open" : "Closed"}
                  </Label>
                </div>
                {day.isOpen ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.openTime}
                      onChange={(e) =>
                        updateDay(day.weekday, { openTime: e.target.value })
                      }
                      className="h-8 w-[110px]"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={day.closeTime}
                      onChange={(e) =>
                        updateDay(day.weekday, { closeTime: e.target.value })
                      }
                      className="h-8 w-[110px]"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!anyDirty || saving}>
              {saving ? "Saving..." : "Save hours"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function labelFor(weekday: Weekday): string {
  return WEEKDAYS.find((w) => w.value === weekday)?.label ?? weekday;
}

// ============================================================================
// Closures
// ============================================================================
function ClosuresManager({ practiceId }: { practiceId: string }) {
  const [closures, setClosures] = useState<PracticeClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("practice_closure")
      .select("id, practice_id, starts_on, ends_on, reason, is_full_day, starts_time, ends_time")
      .order("starts_on", { ascending: true });

    if (error) {
      logger.error("Failed to load practice closures", error);
      toast.error("Failed to load closures");
      setLoading(false);
      return;
    }
    setClosures((data ?? []) as PracticeClosureRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (closure: PracticeClosureRow) => {
    if (!confirm(`Delete closure "${closure.reason}"?`)) return;
    const { error } = await supabase
      .from("practice_closure")
      .delete()
      .eq("id", closure.id);

    if (error) {
      toast.error(
        error.message?.includes("permission")
          ? "Only practice owners and admins can delete closures"
          : "Failed to delete closure",
      );
    } else {
      toast.success("Closure deleted");
      await load();
    }
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = closures.filter((c) => c.ends_on >= today);
  const past = closures.filter((c) => c.ends_on < today);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Closures</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bank holidays, training days, early closes. Excluded from booking
            availability while active.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add closure
        </Button>
      </div>

      {loading ? (
        <PageLoading variant="inline" label="Loading closures..." />
      ) : (
        <div className="space-y-4">
          <ClosureList
            title="Upcoming + active"
            closures={upcoming}
            emptyLabel="No upcoming closures"
            onDelete={handleDelete}
          />
          {past.length > 0 && (
            <details className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none">
                Past closures ({past.length})
              </summary>
              <div className="border-t">
                <ClosureList
                  title=""
                  closures={past}
                  emptyLabel=""
                  onDelete={handleDelete}
                  hideTitle
                />
              </div>
            </details>
          )}
        </div>
      )}

      <AddClosureSheet
        open={showAdd}
        onOpenChange={setShowAdd}
        practiceId={practiceId}
        onCreated={async () => {
          setShowAdd(false);
          await load();
        }}
      />
    </div>
  );
}

function ClosureList({
  title,
  closures,
  emptyLabel,
  onDelete,
  hideTitle,
}: {
  title: string;
  closures: PracticeClosureRow[];
  emptyLabel: string;
  onDelete: (closure: PracticeClosureRow) => void;
  hideTitle?: boolean;
}) {
  return (
    <div className="space-y-2">
      {!hideTitle && title && (
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h4>
      )}
      {closures.length === 0 ? (
        emptyLabel ? (
          <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
        ) : null
      ) : (
        <div className={hideTitle ? "divide-y" : "rounded-lg border bg-card divide-y"}>
          {closures.map((c) => {
            const sameDay = c.starts_on === c.ends_on;
            const dateLabel = sameDay
              ? format(parseISO(c.starts_on), "PPP")
              : `${format(parseISO(c.starts_on), "PPP")} – ${format(parseISO(c.ends_on), "PPP")}`;
            const timeLabel =
              !c.is_full_day && c.starts_time && c.ends_time
                ? ` · ${trimSeconds(c.starts_time)}–${trimSeconds(c.ends_time)}`
                : "";

            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateLabel}
                    {timeLabel}
                    {c.is_full_day ? "" : " · partial day"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(c)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Delete closure"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddClosureSheet({
  open,
  onOpenChange,
  practiceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practiceId: string;
  onCreated: () => void | Promise<void>;
}) {
  const [startsOn, setStartsOn] = useState<Date | undefined>();
  const [endsOn, setEndsOn] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startsTime, setStartsTime] = useState("09:00");
  const [endsTime, setEndsTime] = useState("17:00");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStartsOn(undefined);
    setEndsOn(undefined);
    setReason("");
    setIsFullDay(true);
    setStartsTime("09:00");
    setEndsTime("17:00");
  };

  const submit = async () => {
    if (!startsOn) {
      toast.error("Pick a start date");
      return;
    }
    if (!reason.trim()) {
      toast.error("Add a reason");
      return;
    }
    const effectiveEndsOn = endsOn ?? startsOn;
    if (effectiveEndsOn < startsOn) {
      toast.error("End date must be on or after the start date");
      return;
    }
    if (!isFullDay && startsTime >= endsTime) {
      toast.error("End time must be after start time");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("practice_closure").insert({
      practice_id: practiceId,
      starts_on: format(startsOn, "yyyy-MM-dd"),
      ends_on: format(effectiveEndsOn, "yyyy-MM-dd"),
      reason: reason.trim(),
      is_full_day: isFullDay,
      starts_time: isFullDay ? null : startsTime,
      ends_time: isFullDay ? null : endsTime,
    });
    setSaving(false);

    if (error) {
      toast.error(
        error.message?.includes("permission")
          ? "Only practice owners and admins can create closures"
          : `Failed to add closure: ${error.message}`,
      );
      return;
    }

    toast.success("Closure added");
    reset();
    await onCreated();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add closure</SheetTitle>
          <SheetDescription className="sr-only">
            Block one or more dates from booking availability.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bank holiday, Staff training, Premises closure"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <DatePickerButton value={startsOn} onChange={setStartsOn} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <DatePickerButton
                value={endsOn}
                onChange={setEndsOn}
                disabledBefore={startsOn}
                placeholder="Same day"
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="full-day">Full day</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle off to close for part of the day only.
                </p>
              </div>
              <Switch
                id="full-day"
                checked={isFullDay}
                onCheckedChange={setIsFullDay}
              />
            </div>

            {!isFullDay && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label>Closes at</Label>
                  <Input
                    type="time"
                    value={startsTime}
                    onChange={(e) => setStartsTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reopens at</Label>
                  <Input
                    type="time"
                    value={endsTime}
                    onChange={(e) => setEndsTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={submit}
            disabled={saving || !startsOn || !reason.trim()}
            className="w-full"
          >
            {saving ? "Saving..." : "Add closure"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DatePickerButton({
  value,
  onChange,
  disabledBefore,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  disabledBefore?: Date;
  placeholder?: string;
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
          disabled={
            disabledBefore
              ? (date) => date < disabledBefore
              : undefined
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
