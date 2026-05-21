import { useEffect, useState } from "react";
import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";
import {
  usePlatformAnnouncements,
  type PlatformAnnouncement,
  type PlatformSeverity,
} from "@/hooks/usePlatformAnnouncements";
import { cn } from "@/lib/utils";

// Banner stack rendered at the top of every authed booking-app page.
// Pulls from the tenant-registry RPC (audience-filtered server-side) and
// stacks each active announcement vertically with severity styling.
//
// Dismissal:
//   - info / warning are dismissible per-user (localStorage by id)
//   - critical can't be dismissed — the operator wants the practice to
//     keep seeing it (e.g. "outage in progress")
//   - dismissals never expire client-side; if the operator re-publishes
//     the same announcement they should give it a new id, or toggle
//     active off→on isn't enough. (Live with this for now; if it bites
//     we can hash on starts_at instead of id.)

const STORAGE_KEY = "dismissed-announcements:v1";

const META: Record<
  PlatformSeverity,
  { Icon: typeof Info; bg: string; border: string; iconColour: string; text: string }
> = {
  info: {
    Icon: Info,
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900/60",
    iconColour: "text-blue-700 dark:text-blue-300",
    text: "text-blue-900 dark:text-blue-100",
  },
  warning: {
    Icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900/60",
    iconColour: "text-amber-700 dark:text-amber-300",
    text: "text-amber-900 dark:text-amber-100",
  },
  critical: {
    Icon: AlertOctagon,
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-900/60",
    iconColour: "text-red-700 dark:text-red-300",
    text: "text-red-900 dark:text-red-100",
  },
};

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Quota / private mode — fine, just don't remember.
  }
}

export function PlatformAnnouncementBanner() {
  const { items } = usePlatformAnnouncements();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  // Sync dismissals to localStorage whenever they change.
  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  // Filter out items the user dismissed (critical bypasses the filter).
  const visible = items.filter(
    (a) => a.severity === "critical" || !dismissed.has(a.id),
  );

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((a) => (
        <BannerRow
          key={a.id}
          announcement={a}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(a.id))}
        />
      ))}
    </div>
  );
}

function BannerRow({
  announcement,
  onDismiss,
}: {
  announcement: PlatformAnnouncement;
  onDismiss: () => void;
}) {
  const m = META[announcement.severity];
  const dismissible = announcement.severity !== "critical";
  return (
    <div
      className={cn(
        "rounded-md border p-3 flex items-start gap-3",
        m.bg,
        m.border,
        m.text,
      )}
      role={announcement.severity === "critical" ? "alert" : "status"}
    >
      <m.Icon className={cn("h-4 w-4 shrink-0 mt-0.5", m.iconColour)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium break-words">{announcement.title}</p>
        {announcement.body && (
          <p className="text-xs mt-1 whitespace-pre-wrap break-words opacity-90">
            {announcement.body}
          </p>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss announcement"
          className={cn(
            "shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors",
            m.iconColour,
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
