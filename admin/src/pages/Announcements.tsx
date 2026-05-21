import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Megaphone,
  AlertTriangle,
  AlertOctagon,
  Info,
  Plus,
  Trash2,
  Edit,
  Target,
} from "lucide-react";
import { ErrorState } from "@/components/ErrorState";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useAnnouncements,
  useDeleteAnnouncement,
  isAnnouncementLive,
  audienceLabel,
  type Announcement,
  type AnnouncementSeverity,
} from "@/hooks/useAnnouncements";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SEVERITY_META: Record<AnnouncementSeverity, { icon: typeof Info; label: string; badge: string; previewBg: string; previewBorder: string }> = {
  info: {
    icon: Info,
    label: "Info",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    previewBg: "bg-blue-50 dark:bg-blue-950/40",
    previewBorder: "border-blue-200 dark:border-blue-900/60",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    previewBg: "bg-amber-50 dark:bg-amber-950/40",
    previewBorder: "border-amber-200 dark:border-amber-900/60",
  },
  critical: {
    icon: AlertOctagon,
    label: "Critical",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    previewBg: "bg-red-50 dark:bg-red-950/40",
    previewBorder: "border-red-200 dark:border-red-900/60",
  },
};

type FilterKey = "all" | "live" | "scheduled" | "expired" | "disabled";

function statusOf(a: Announcement): Exclude<FilterKey, "all"> {
  if (!a.active) return "disabled";
  const now = new Date();
  if (new Date(a.starts_at) > now) return "scheduled";
  if (a.ends_at && new Date(a.ends_at) <= now) return "expired";
  return "live";
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "expired", label: "Expired" },
  { key: "disabled", label: "Disabled" },
];

export default function Announcements() {
  const { data: announcements, isLoading, error, refetch } = useAnnouncements();
  const remove = useDeleteAnnouncement();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const counts = useMemo(() => {
    const acc: Record<Exclude<FilterKey, "all">, number> = {
      live: 0,
      scheduled: 0,
      expired: 0,
      disabled: 0,
    };
    for (const a of announcements ?? []) acc[statusOf(a)]++;
    return acc;
  }, [announcements]);

  // Sort: live first, then scheduled (soonest start first), then expired
  // (most recently expired first), then disabled (newest first). Operators
  // scan top-down for "what's live right now?" so live always wins.
  const sorted = useMemo(() => {
    if (!announcements) return [];
    const STATUS_RANK: Record<Exclude<FilterKey, "all">, number> = {
      live: 0,
      scheduled: 1,
      expired: 2,
      disabled: 3,
    };
    return [...announcements].sort((a, b) => {
      const aStatus = statusOf(a);
      const bStatus = statusOf(b);
      const rankDiff = STATUS_RANK[aStatus] - STATUS_RANK[bStatus];
      if (rankDiff !== 0) return rankDiff;
      // Within group: scheduled wants soonest start first; everything else
      // wants newest first.
      if (aStatus === "scheduled") {
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      }
      if (aStatus === "expired") {
        const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : 0;
        const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : 0;
        return bEnd - aEnd;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [announcements]);

  const filtered = useMemo(() => {
    if (filter === "all") return sorted;
    return sorted.filter((a) => statusOf(a) === filter);
  }, [sorted, filter]);

  const total = announcements?.length ?? 0;
  const live = counts.live;

  return (
    <Layout
      title="Announcements"
      description={
        announcements
          ? `${live} live now · ${total} total`
          : undefined
      }
      actions={
        <Button onClick={() => navigate("/announcements/new")} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New announcement
        </Button>
      }
    >
      {/* Filter pills with counts — same pattern as Support and Leads. */}
      {announcements && announcements.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const n = f.key === "all" ? total : counts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                  isActive
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card hover:bg-muted/60 text-muted-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "text-[10px] rounded px-1 tabular-nums",
                    isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <ErrorState
          title="Failed to load announcements"
          error={error}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Loading announcements…
        </div>
      ) : !announcements || announcements.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Megaphone className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No announcements yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Broadcast platform-wide messages that show as a banner in every tenant's booking app.
          </p>
          <Button onClick={() => navigate("/announcements/new")} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New announcement
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          No announcements match the "{FILTERS.find((f) => f.key === filter)?.label}" filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AnnouncementRow
              key={a.id}
              announcement={a}
              onEdit={() => navigate(`/announcements/${a.id}`)}
              onDelete={() => setDeleting(a)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete announcement?"
        description={
          <>
            "{deleting?.title}" will be hidden from the list. The audit trail
            (who created it and when) is kept in the database — we soft-delete
            so historical broadcasts can still be reviewed.
            <p className="mt-2 text-xs">
              For most cases consider toggling the announcement <strong>inactive</strong> instead, so it can be re-enabled later.
            </p>
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success("Announcement deleted");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Delete failed");
          } finally {
            setDeleting(null);
          }
        }}
      />
    </Layout>
  );
}

// A single announcement row. Long bodies clamp to two lines; clicking the
// "Show more" affordance reveals the full text. Clamp is detected via
// scrollHeight vs clientHeight after layout — works for any font size.
function AnnouncementRow({
  announcement: a,
  onEdit,
  onDelete,
}: {
  announcement: Announcement;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = SEVERITY_META[a.severity];
  const Icon = meta.icon;
  const isLive = isAnnouncementLive(a);

  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // scrollHeight > clientHeight when line-clamp is actively cutting text.
    // Re-check on resize (responsive width changes the wrap point).
    const check = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [a.body]);

  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div
        className={cn(
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
          meta.badge,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-2">
          <div className="font-medium">{a.title}</div>
          <span className={cn("text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium", meta.badge)}>
            {meta.label}
          </span>
          {isLive ? (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">
              Live
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              {!a.active ? "Disabled" : new Date(a.starts_at) > new Date() ? "Scheduled" : "Expired"}
            </span>
          )}
        </div>
        {a.body && (
          <>
            <p
              ref={bodyRef}
              className={cn(
                "text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words",
                !expanded && "line-clamp-2",
              )}
            >
              {a.body}
            </p>
            {(isClamped || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-primary hover:underline mt-1 font-medium"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        )}
        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/80 text-[10px] font-medium uppercase tracking-wide normal-case">
            <Target className="h-3 w-3" />
            {audienceLabel(a)}
          </span>
          <span>
            {format(new Date(a.starts_at), "d MMM yyyy, HH:mm")}
            {a.ends_at ? ` → ${format(new Date(a.ends_at), "d MMM yyyy, HH:mm")}` : " → no end"}
          </span>
          {a.created_by_email && (
            <>
              <span>·</span>
              <span>by {a.created_by_email}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit announcement">
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          aria-label="Delete announcement"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

