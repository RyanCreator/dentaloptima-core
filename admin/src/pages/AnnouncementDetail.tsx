import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Megaphone,
  AlertTriangle,
  AlertOctagon,
  Info,
  Search,
  Check,
  Calendar as CalendarIcon,
  Users2,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  type AnnouncementDraft,
  type AnnouncementSeverity,
  type AnnouncementAudienceKind,
} from "@/hooks/useAnnouncements";
import { useTenants, type PracticeStatus } from "@/hooks/useTenants";
import { cn } from "@/lib/utils";

// Full-page create/edit screen for platform announcements. Replaces the
// cramped sheet from Announcements.tsx — services moved off sheets first
// (see web/src/pages/ServiceDetail.tsx) and announcements follow the same
// pattern for the same reason: too many fields once audience targeting
// landed (migration tenant-registry/0002).
//
// Routes:
//   /announcements/new
//   /announcements/:announcementId
//
// Tabs split the form into Content (title/body/severity), Schedule
// (starts/ends/active) and Audience (ALL / STATUS / TENANTS). Live preview
// sits below tabs so it updates regardless of which tab the operator is on.

const SEVERITY_META: Record<
  AnnouncementSeverity,
  { icon: typeof Info; label: string; badge: string; previewBg: string; previewBorder: string; iconColour: string }
> = {
  info: {
    icon: Info,
    label: "Info",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    previewBg: "bg-blue-50 dark:bg-blue-950/40",
    previewBorder: "border-blue-200 dark:border-blue-900/60",
    iconColour: "text-blue-700 dark:text-blue-300",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    previewBg: "bg-amber-50 dark:bg-amber-950/40",
    previewBorder: "border-amber-200 dark:border-amber-900/60",
    iconColour: "text-amber-700 dark:text-amber-300",
  },
  critical: {
    icon: AlertOctagon,
    label: "Critical",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    previewBg: "bg-red-50 dark:bg-red-950/40",
    previewBorder: "border-red-200 dark:border-red-900/60",
    iconColour: "text-red-700 dark:text-red-300",
  },
};

const ALL_STATUSES: PracticeStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED", "OFFBOARDED"];

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

export default function AnnouncementDetail() {
  const { announcementId } = useParams<{ announcementId?: string }>();
  const navigate = useNavigate();
  const isCreate = !announcementId || announcementId === "new";

  const { data: announcements, isLoading: listLoading } = useAnnouncements();
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();

  const editing = useMemo(
    () => (isCreate ? null : announcements?.find((a) => a.id === announcementId) ?? null),
    [announcements, announcementId, isCreate],
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [audienceKind, setAudienceKind] = useState<AnnouncementAudienceKind>("ALL");
  const [audienceStatus, setAudienceStatus] = useState<string[]>([]);
  const [audienceTenantIds, setAudienceTenantIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(isCreate);

  // Hydrate edit-mode form once when the row appears. Same pattern as
  // ServiceDetail — keying on id only so re-renders of the list don't
  // overwrite in-progress typing.
  useEffect(() => {
    if (isCreate) {
      setTitle("");
      setBody("");
      setSeverity("info");
      setActive(true);
      setStartsAt(toDateTimeLocal(new Date()));
      setEndsAt("");
      setAudienceKind("ALL");
      setAudienceStatus([]);
      setAudienceTenantIds([]);
      setHydrated(true);
      return;
    }
    if (!editing) return;
    setTitle(editing.title);
    setBody(editing.body ?? "");
    setSeverity(editing.severity);
    setActive(editing.active);
    setStartsAt(editing.starts_at.slice(0, 16));
    setEndsAt(editing.ends_at ? editing.ends_at.slice(0, 16) : "");
    setAudienceKind(editing.audience_kind);
    setAudienceStatus(editing.audience_status);
    setAudienceTenantIds(editing.audience_tenant_ids);
    setHydrated(true);
  }, [isCreate, editing?.id]);

  const busy = create.isPending || update.isPending;
  const meta = SEVERITY_META[severity];
  const PreviewIcon = meta.icon;

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const startsAtIso = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    const endsAtIso = endsAt ? new Date(endsAt).toISOString() : null;
    if (endsAtIso && endsAtIso <= startsAtIso) {
      toast.error("End time must be after start time");
      return;
    }
    if (audienceKind === "STATUS" && audienceStatus.length === 0) {
      toast.error("Pick at least one tenant status, or change audience to All tenants.");
      return;
    }
    if (audienceKind === "TENANTS" && audienceTenantIds.length === 0) {
      toast.error("Pick at least one tenant, or change audience to All tenants.");
      return;
    }

    const draft: AnnouncementDraft = {
      title: title.trim(),
      body: body.trim() || null,
      severity,
      active,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      audience_kind: audienceKind,
      // Only send the array that matches the kind — keeps the row tidy.
      audience_status: audienceKind === "STATUS" ? audienceStatus : [],
      audience_tenant_ids: audienceKind === "TENANTS" ? audienceTenantIds : [],
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: draft });
        toast.success("Announcement updated");
      } else {
        await create.mutateAsync(draft);
        toast.success("Announcement created");
      }
      navigate("/announcements");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!hydrated || (!isCreate && listLoading)) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Link to="/announcements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Announcements
        </Link>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isCreate && !editing) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Link to="/announcements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Announcements
        </Link>
        <div className="bg-card rounded-lg border p-6 text-sm text-muted-foreground">
          Couldn't find that announcement. It may have been deleted.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <Link to="/announcements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Announcements
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isCreate ? "New announcement" : "Edit announcement"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shown as a banner in targeted tenants' booking apps.
          </p>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5" />
            Content
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="audience" className="gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Audience
          </TabsTrigger>
        </TabsList>

        {/* Content ===================================================== */}
        <TabsContent value="content" className="mt-4 space-y-4">
          <div className="bg-card rounded-lg border p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Title *</Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
                placeholder="Scheduled maintenance this Sunday"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Optional longer explanation shown below the title."
              />
              <p className="text-xs text-muted-foreground tabular-nums">{body.length}/1000</p>
            </div>

            <div className="space-y-1.5 sm:max-w-sm">
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
          </div>
        </TabsContent>

        {/* Schedule ==================================================== */}
        <TabsContent value="schedule" className="mt-4 space-y-4">
          <div className="bg-card rounded-lg border p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ann-starts-at">Show from</Label>
                <Input
                  id="ann-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Set a future time to schedule in advance. Defaults to now.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-ends-at">Auto-hide at (optional)</Label>
                <Input
                  id="ann-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep showing until manually disabled.
                </p>
              </div>
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
          </div>
        </TabsContent>

        {/* Audience ==================================================== */}
        <TabsContent value="audience" className="mt-4 space-y-4">
          <div className="bg-card rounded-lg border p-5 space-y-2">
            <AudienceOption
              value="ALL"
              current={audienceKind}
              onSelect={setAudienceKind}
              title="All tenants"
              description="Broadcast to every active practice."
            />
            <AudienceOption
              value="STATUS"
              current={audienceKind}
              onSelect={setAudienceKind}
              title="By status"
              description="Practices whose lifecycle status matches your selection."
            />
            <AudienceOption
              value="TENANTS"
              current={audienceKind}
              onSelect={setAudienceKind}
              title="Specific tenants"
              description="A hand-picked list of practices."
            />
          </div>

          {audienceKind === "STATUS" && (
            <StatusPickerCard selected={audienceStatus} onChange={setAudienceStatus} />
          )}
          {audienceKind === "TENANTS" && (
            <TenantPickerCard selected={audienceTenantIds} onChange={setAudienceTenantIds} />
          )}
        </TabsContent>
      </Tabs>

      {/* Live preview — visible regardless of tab so the operator can keep
          tabbing back and forth without losing the visual reference. */}
      <div className="bg-card rounded-lg border p-5 space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Preview
        </div>
        <div
          className={cn(
            "rounded-md border p-3 flex items-start gap-3",
            meta.previewBg,
            meta.previewBorder,
          )}
        >
          <PreviewIcon className={cn("h-4 w-4 shrink-0 mt-0.5", meta.iconColour)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words">
              {title.trim() || <span className="opacity-50">Title appears here</span>}
            </p>
            {body.trim() && (
              <p className="text-xs mt-1 whitespace-pre-wrap break-words opacity-80">{body}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/announcements")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={busy || !title.trim()}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create announcement"}
        </Button>
      </div>
    </div>
  );
}

// Click-card "radio" — Radix's radio-group isn't installed in admin, and
// this gives us nicer styling control anyway. Selection state pulls from
// the parent, so a few of these together behave as a mutually-exclusive
// group.
function AudienceOption({
  value,
  current,
  onSelect,
  title,
  description,
}: {
  value: AnnouncementAudienceKind;
  current: AnnouncementAudienceKind;
  onSelect: (v: AnnouncementAudienceKind) => void;
  title: string;
  description: string;
}) {
  const checked = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={checked}
      className={cn(
        "w-full text-left flex items-start gap-3 rounded-md border p-3 transition-colors",
        checked ? "bg-primary/5 border-primary/50" : "hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
          checked ? "border-primary" : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
      </span>
    </button>
  );
}

// Status multi-select — a small set so we render all four as chips.
function StatusPickerCard({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (s: string) => {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  };
  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div>
        <div className="text-sm font-medium">Tenant statuses</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pick one or more lifecycle statuses. The announcement applies to
          every practice currently in any of these states at view time.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_STATUSES.map((s) => {
          const checked = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                checked
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted/60 text-muted-foreground",
              )}
            >
              {checked && <Check className="h-3 w-3" />}
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tenant multi-select with type-to-filter — same shape as the Support
// page's TenantPicker for consistency.
function TenantPickerCard({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: practices } = useTenants();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const list = practices ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [practices, query]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectedNames = useMemo(() => {
    if (!practices) return [];
    return selected
      .map((id) => practices.find((p) => p.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  }, [selected, practices]);

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" />
            Selected tenants
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selected.length === 0
              ? "Pick the practices that should see this announcement."
              : `${selected.length} tenant${selected.length === 1 ? "" : "s"} selected`}
          </p>
        </div>
        {selected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            className="text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className="inline-flex items-center gap-1 rounded-full border bg-primary/5 border-primary/30 px-2.5 py-1 text-xs font-medium hover:bg-primary/10"
              title="Click to remove"
            >
              {p.name}
              <span className="text-muted-foreground">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-md border bg-background">
        <div className="relative border-b">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search practices…"
            className="pl-9 border-0 focus-visible:ring-0 rounded-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">No matches.</div>
          ) : (
            filtered.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
                    checked && "bg-accent/60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.slug} · {p.status}
                    </div>
                  </div>
                  {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
