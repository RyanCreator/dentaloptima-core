import { useState } from "react";
import { format } from "date-fns";
import {
  Megaphone,
  AlertTriangle,
  AlertOctagon,
  Info,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import { ErrorState } from "@/components/ErrorState";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  isAnnouncementLive,
  type Announcement,
  type AnnouncementDraft,
  type AnnouncementSeverity,
} from "@/hooks/useAnnouncements";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SEVERITY_META: Record<AnnouncementSeverity, { icon: typeof Info; label: string; badge: string }> = {
  info: { icon: Info, label: "Info", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  warning: { icon: AlertTriangle, label: "Warning", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  critical: { icon: AlertOctagon, label: "Critical", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

export default function Announcements() {
  const { data: announcements, isLoading, error, refetch } = useAnnouncements();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const live = announcements?.filter(isAnnouncementLive).length ?? 0;

  return (
    <Layout
      title="Announcements"
      description={
        announcements
          ? `${live} live now · ${announcements.length} total`
          : undefined
      }
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New announcement
        </Button>
      }
    >
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
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            New announcement
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const meta = SEVERITY_META[a.severity];
            const Icon = meta.icon;
            const isLive = isAnnouncementLive(a);
            return (
              <div
                key={a.id}
                className="rounded-lg border bg-card p-4 flex items-start gap-3"
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                    meta.badge
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
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    {format(new Date(a.starts_at), "d MMM yyyy, HH:mm")}
                    {a.ends_at ? ` → ${format(new Date(a.ends_at), "d MMM yyyy, HH:mm")}` : " → no end"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(a);
                      setDialogOpen(true);
                    }}
                    aria-label="Edit announcement"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(a)}
                    aria-label="Delete announcement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title}" will be permanently removed. For most cases you should set it
              inactive instead so you keep an audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DeleteConfirmAction announcement={deleting} onDone={() => setDeleting(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function DeleteConfirmAction({
  announcement,
  onDone,
}: {
  announcement: Announcement | null;
  onDone: () => void;
}) {
  const remove = useDeleteAnnouncement();
  return (
    <AlertDialogAction
      disabled={!announcement || remove.isPending}
      onClick={async () => {
        if (!announcement) return;
        try {
          await remove.mutateAsync(announcement.id);
          toast.success("Announcement deleted");
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
    >
      Delete
    </AlertDialogAction>
  );
}

function AnnouncementDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Announcement | null;
}) {
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();

  // Local form state mirrors the announcement when editing
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Reset form when the dialog opens
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setTitle(editing?.title ?? "");
    setBody(editing?.body ?? "");
    setSeverity(editing?.severity ?? "info");
    setActive(editing?.active ?? true);
    // Default new announcements to "now" so they're live immediately. Editing
    // preserves whatever starts_at was saved.
    setStartsAt(
      editing?.starts_at
        ? editing.starts_at.slice(0, 16)
        : toDateTimeLocal(new Date())
    );
    setEndsAt(editing?.ends_at ? editing.ends_at.slice(0, 16) : "");
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const startsAtIso = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
    if (endsAtIso && endsAtIso <= startsAtIso) {
      toast.error("End time must be after start time");
      return;
    }

    const draft: AnnouncementDraft = {
      title: title.trim(),
      body: body.trim() || null,
      severity,
      active,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: draft });
        toast.success("Announcement updated");
      } else {
        await create.mutateAsync(draft);
        toast.success("Announcement created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function toDateTimeLocal(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      d.getFullYear() +
      "-" + pad(d.getMonth() + 1) +
      "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) +
      ":" + pad(d.getMinutes())
    );
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription>
            Shown as a banner on every tenant's booking app. Critical announcements can't be
            dismissed by users.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title *</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Scheduled maintenance this Sunday"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Body</Label>
            <textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Optional longer explanation shown below the title."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-severity">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as AnnouncementSeverity)}>
                <SelectTrigger id="ann-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical (non-dismissible)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-ends-at">Auto-hide at (optional)</Label>
              <Input
                id="ann-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-starts-at">Show from</Label>
            <Input
              id="ann-starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Set a future time to schedule the announcement in advance. Defaults to now.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ann-active" className="text-sm cursor-pointer">
                Active
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inactive announcements are stored but not shown.
              </p>
            </div>
            <Switch id="ann-active" checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
