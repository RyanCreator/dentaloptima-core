import { useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Bell, X, Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UK_TIMEZONE } from "@/lib/constants";
import { useNotificationQueue } from "@/hooks/useNotificationQueue";

// "Notifications to send" tray in the calendar header. Lists every
// appointment whose reschedule/cancellation hasn't been communicated to
// the patient yet, so reception can shuffle the day freely and then
// fire the emails when the schedule is settled.

export function NotificationTray() {
  const { items, loading, sendingId, send, dismiss } = useNotificationQueue();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative shrink-0"
          aria-label={`Notifications to send (${items.length})`}
        >
          <Bell className="h-4 w-4" />
          {items.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {items.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notifications to send</SheetTitle>
          <SheetDescription>
            Patients haven&apos;t been told about these changes yet. Send when the
            schedule is settled, or dismiss to skip without notifying.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {loading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing pending. Reschedules and cancellations will appear here
              ready for you to send.
            </p>
          ) : (
            items.map((item) => (
              <NotificationRow
                key={item.appointment_id}
                item={item}
                sending={sendingId === item.appointment_id}
                onSend={() => send(item)}
                onDismiss={() => dismiss(item)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationRow({
  item,
  sending,
  onSend,
  onDismiss,
}: {
  item: ReturnType<typeof useNotificationQueue>["items"][number];
  sending: boolean;
  onSend: () => void;
  onDismiss: () => void;
}) {
  const isReschedule = item.kind === "RESCHEDULED";
  const isCancel = item.kind === "CANCELLED";
  const currZoned = toZonedTime(new Date(item.current_starts_at), UK_TIMEZONE);
  const prevZoned = item.prev_starts_at
    ? toZonedTime(new Date(item.prev_starts_at), UK_TIMEZONE)
    : null;

  return (
    <div className="rounded-md border p-3 bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{item.patient_name}</div>
          {item.staff_name && (
            <div className="text-xs text-muted-foreground truncate">
              with {item.staff_name}
            </div>
          )}
        </div>
        <span
          className={
            isCancel
              ? "text-[10px] font-medium uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 rounded px-1.5 py-0.5 shrink-0"
              : "text-[10px] font-medium uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 rounded px-1.5 py-0.5 shrink-0"
          }
        >
          {isReschedule ? "Reschedule" : isCancel ? "Cancellation" : item.kind}
        </span>
      </div>

      {isReschedule && prevZoned && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground line-through">
            {format(prevZoned, "EEE d MMM, HH:mm")}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{format(currZoned, "EEE d MMM, HH:mm")}</span>
        </div>
      )}
      {isReschedule && !prevZoned && (
        <div className="text-xs">
          Now <span className="font-medium">{format(currZoned, "EEE d MMM, HH:mm")}</span>
        </div>
      )}
      {isCancel && (
        <div className="text-xs">
          Was <span className="font-medium">{format(currZoned, "EEE d MMM, HH:mm")}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={onSend}
          disabled={sending}
          className="h-7 text-xs flex-1"
        >
          <Send className="h-3 w-3 mr-1" />
          {sending ? "Sending…" : "Send"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          disabled={sending}
          className="h-7 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
