import { useMemo, useState } from "react";
import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import type { PlatformAnnouncement } from "@/lib/tenantLoader";

// Dismissed announcement IDs are stored in sessionStorage — they stay hidden
// for the browser tab's lifetime but re-appear on next visit, so users don't
// miss important info. Critical announcements ignore the dismissed state.
const DISMISSED_KEY = "platform_announcements_dismissed";

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // sessionStorage unavailable — fine, just don't persist
  }
}

const VARIANTS: Record<PlatformAnnouncement["severity"], { bg: string; text: string; icon: typeof Info }> = {
  info: {
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
    text: "text-blue-900 dark:text-blue-200",
    icon: Info,
  },
  warning: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
    text: "text-amber-900 dark:text-amber-200",
    icon: AlertTriangle,
  },
  critical: {
    bg: "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-900",
    text: "text-red-900 dark:text-red-200",
    icon: AlertOctagon,
  },
};

export function PlatformAnnouncementBanner() {
  const tenant = useTenant();
  const [dismissed, setDismissed] = useState(readDismissed);

  const visible = useMemo(() => {
    const all = tenant.announcements ?? [];
    return all.filter((a) => a.severity === "critical" || !dismissed.has(a.id));
  }, [tenant.announcements, dismissed]);

  if (visible.length === 0) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="space-y-1 px-3 pt-3">
      {visible.map((a) => {
        const v = VARIANTS[a.severity];
        const Icon = v.icon;
        const isCritical = a.severity === "critical";
        return (
          <div
            key={a.id}
            role={isCritical ? "alert" : "status"}
            className={cn(
              "rounded-md border px-3 py-2.5 flex items-start gap-2.5 text-sm",
              v.bg,
              v.text
            )}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{a.title}</div>
              {a.body && <div className="mt-0.5 text-xs opacity-90 whitespace-pre-wrap">{a.body}</div>}
            </div>
            {!isCritical && (
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss announcement"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
