import { useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UK_TIMEZONE } from "@/lib/constants";
import { useBlockedTime, type BlockedTimeEntry } from "@/hooks/useBlockedTime";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BlockedTimeChipProps {
  block: BlockedTimeEntry;
  /** Absolute positioning passed in by the parent layout. */
  style: React.CSSProperties;
  /** Sizing variant — "timeline" matches the single-day view's chip size,
   *  "multistaff" is the denser per-column variant. */
  variant?: "timeline" | "multistaff";
}

// Click-to-unblock chip. Renders the block visually and opens a confirm
// dialog when clicked — the hook's deleteBlockedTime mutation handles
// the DB write + cache invalidation so the chip disappears on confirm.

export function BlockedTimeChip({ block, style, variant = "timeline" }: BlockedTimeChipProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteBlockedTime, isDeleting } = useBlockedTime();
  const blockStart = toZonedTime(new Date(block.starts_at), UK_TIMEZONE);
  const blockEnd = toZonedTime(new Date(block.ends_at), UK_TIMEZONE);

  const isTimeline = variant === "timeline";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        className={cn(
          "group absolute rounded text-left overflow-hidden border-l-4 transition-shadow hover:shadow-md z-10",
          "bg-gray-200 border-gray-500 dark:bg-gray-800/70",
          isTimeline ? "left-2 right-2 p-2 text-xs border-l-4" : "left-1 right-1 px-1.5 py-1 text-[10px] border-l-2",
        )}
        style={style}
        title="Click to unblock"
      >
        <div className={cn("font-medium truncate flex items-center gap-1", !isTimeline && "text-[10px] gap-0.5")}>
          <Ban className={cn(isTimeline ? "h-3 w-3" : "h-2.5 w-2.5")} />
          {isTimeline
            ? `${format(blockStart, "HH:mm")} - ${format(blockEnd, "HH:mm")}`
            : format(blockStart, "HH:mm")}
        </div>
        <div className={cn("truncate text-muted-foreground font-semibold", isTimeline ? "text-xs" : "text-[9px]")}>
          BLOCKED
        </div>
        {block.title && (
          <div className={cn("truncate text-muted-foreground", isTimeline ? "text-[10px]" : "text-[8px]")}>
            {block.title}
          </div>
        )}
        {/* Hover affordance — appears only at timeline size so the dense
            multistaff variant doesn't get visually noisy. */}
        {isTimeline && (
          <Trash2 className="h-3 w-3 absolute top-1 right-1 opacity-0 group-hover:opacity-70 text-muted-foreground" />
        )}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock this time?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the block from {format(blockStart, "EEE d MMM, HH:mm")} – {format(blockEnd, "HH:mm")}
              {block.title ? ` (${block.title})` : ""}. The slot becomes bookable again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                deleteBlockedTime(block.id);
                setConfirmOpen(false);
              }}
            >
              {isDeleting ? "Removing…" : "Unblock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
