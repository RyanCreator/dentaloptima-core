import { Plus, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Centered dialog that opens when the user clicks an empty calendar slot.
// Replaces the previous side-anchored popover, which (a) crammed against
// the right edge on narrow screens and (b) felt visually disconnected from
// the action it triggered. The dialog stays small enough to feel like a
// quick chooser rather than a modal step, but large enough to fit the two
// option cards comfortably on mobile.
//
// The dialog itself only picks the *intent* (book vs. block). The actual
// data entry — who's coming in, what service, etc., or the title of a
// blocked window — happens in the existing NewAppointment + BlockTime
// sheets that the parent already knows how to open.

interface SlotActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Time string in "HH:MM" form for the slot the user clicked. */
  time: string;
  /** Optional staff name — shown in the description for multi-staff view. */
  staffName?: string | null;
  onBook: () => void;
  onBlock: () => void;
}

export function SlotActionDialog({
  open,
  onOpenChange,
  time,
  staffName,
  onBook,
  onBlock,
}: SlotActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>What's at {time}?</DialogTitle>
          <DialogDescription>
            {staffName
              ? `Book an appointment with ${staffName} or block this time off the calendar.`
              : "Book an appointment or block this time off the calendar."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 pt-2">
          <button
            type="button"
            onClick={onBook}
            className="flex items-start gap-3 p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/40 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Book an appointment</div>
              <div className="text-xs text-muted-foreground">
                Pick a patient, service, and duration
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onBlock}
            className="flex items-start gap-3 p-3 rounded-lg border hover:border-muted-foreground/50 hover:bg-muted/40 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Block time</div>
              <div className="text-xs text-muted-foreground">
                Mark this slot unavailable (lunch, training, meeting…)
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
