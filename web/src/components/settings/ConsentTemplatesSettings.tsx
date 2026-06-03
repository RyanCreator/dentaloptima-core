import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServices } from "@/hooks/useServices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Plus,
  FileSignature,
  Edit3,
  ArrowUpFromLine,
  BookOpen,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { CONSENT_TEMPLATE_STARTERS } from "@/lib/consentTemplateStarters";
import {
  CONSENT_CATEGORIES,
  STARTER_CATEGORY_DEFAULTS,
  categoryMeta,
} from "@/lib/consentCategories";
import { ConsentMarkdown } from "@/components/ConsentMarkdown";

// Consent template library. Practice manages the library once; the
// service-mapping decides which templates auto-appear on each
// appointment's pending-consent list. Bumping a version creates a NEW
// row (active=true) and flips the old one to inactive — historical
// consent_record rows still resolve to the version they were signed
// against (template_version snapshot on the record).

interface Template {
  id: string;
  code: string;
  title: string;
  body: string;
  version: string;
  category: string;
  is_active: boolean;
  supersedes_id: string | null;
  created_at: string;
  /** Service ids this template is required for. */
  service_ids: string[];
}

interface ConsentTemplateRow {
  id: string;
  code: string;
  title: string;
  body: string;
  version: string;
  category: string;
  is_active: boolean;
  supersedes_id: string | null;
  created_at: string;
}

const NEW_TEMPLATE_DRAFT: TemplateDraft = {
  code: "",
  title: "",
  body: "",
  version: "v1",
  category: "OTHER",
  is_active: true,
  service_ids: [],
};

interface TemplateDraft {
  code: string;
  title: string;
  body: string;
  version: string;
  category: string;
  is_active: boolean;
  service_ids: string[];
}

export function ConsentTemplatesSettings() {
  const { services } = useServices();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  // mode = "edit" → straight update; "bump" → write a NEW row that
  // supersedes the current one (preserves the audit trail).
  const [editMode, setEditMode] = useState<"create" | "edit" | "bump">("create");
  const [draft, setDraft] = useState<TemplateDraft>(NEW_TEMPLATE_DRAFT);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showStartersDialog, setShowStartersDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  // Search box at the top of the list — filters by title, code, and
  // category label, then collapses any group with no matches.
  const [searchTerm, setSearchTerm] = useState("");
  // Markdown preview toggle in the editor sheet — author can flip
  // between editing the source and seeing the rendered output that the
  // patient will see on the kiosk.
  const [previewMode, setPreviewMode] = useState(false);
  // Deactivate-with-linked-services confirmation. Holds the saved draft
  // + service count until the user confirms.
  const [deactivateConfirm, setDeactivateConfirm] = useState<null | {
    serviceCount: number;
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Pull active templates and the service ids each one is required for
    // in a single round trip via the embed.
    const { data, error } = await supabase
      .from("consent_template")
      .select(
        `id, code, title, body, version, category, is_active, supersedes_id, created_at,
         services:consent_template_service(service_id)`,
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("title");

    if (error) {
      logger.error("Failed to load consent templates", error);
      toast.error("Couldn't load consent templates");
      setLoading(false);
      return;
    }
    const mapped: Template[] = (data ?? []).map((row: any) => ({
      ...(row as ConsentTemplateRow),
      service_ids: (row.services ?? []).map((s: any) => s.service_id),
    }));
    setTemplates(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditMode("create");
    setEditing(null);
    setDraft({ ...NEW_TEMPLATE_DRAFT });
    setPreviewMode(false);
    setSheetOpen(true);
  }

  function openEdit(t: Template) {
    setEditMode("edit");
    setEditing(t);
    setDraft({
      code: t.code,
      title: t.title,
      body: t.body,
      version: t.version,
      category: t.category,
      is_active: t.is_active,
      service_ids: [...t.service_ids],
    });
    setPreviewMode(false);
    setSheetOpen(true);
  }

  function openBump(t: Template) {
    setEditMode("bump");
    setEditing(t);
    setDraft({
      code: t.code,
      title: t.title,
      body: t.body,
      version: nextVersion(t.version),
      category: t.category,
      is_active: true,
      service_ids: [...t.service_ids],
    });
    setPreviewMode(false);
    setSheetOpen(true);
  }

  async function save(opts?: { confirmedDeactivation?: boolean }) {
    if (!draft.code.trim() || !draft.title.trim() || !draft.body.trim()) {
      toast.error("Code, title, and body are required");
      return;
    }

    // Guard: if the user is flipping is_active from true→false on a
    // template that has services linked, intercept and ask for explicit
    // confirmation. Otherwise the deactivation silently makes those
    // services stop requiring this consent.
    if (
      editMode === "edit" &&
      editing &&
      editing.is_active &&
      !draft.is_active &&
      draft.service_ids.length > 0 &&
      !opts?.confirmedDeactivation
    ) {
      setDeactivateConfirm({ serviceCount: draft.service_ids.length });
      return;
    }

    setSaving(true);
    try {
      // Practice id lands automatically via the audit trigger reading
      // app_private.current_practice_id() — we never set it from the UI.
      const { data: practiceRow } = await supabase
        .from("practice_member")
        .select("practice_id")
        .limit(1)
        .maybeSingle();
      const practiceId = practiceRow?.practice_id;
      if (!practiceId) {
        toast.error("Couldn't resolve practice");
        return;
      }

      let templateId: string;

      if (editMode === "edit" && editing) {
        const { error } = await supabase
          .from("consent_template")
          .update({
            title: draft.title,
            body: draft.body,
            category: draft.category,
            // Version + code stay locked in plain edit mode — bumping the
            // version requires the explicit "New version" flow so the
            // audit chain stays clean.
            is_active: draft.is_active,
          })
          .eq("id", editing.id);
        if (error) throw error;
        templateId = editing.id;
      } else {
        // Create or bump — for bump, deactivate the previous version
        // FIRST so the partial unique index uq_consent_template_active_code
        // (one active row per (practice, code)) doesn't fire when we
        // insert the new active row. If the insert later fails, we
        // re-activate the previous row to leave the library in a sane
        // state rather than with no active template for that code.
        if (editMode === "bump" && editing) {
          const { error: deactErr } = await supabase
            .from("consent_template")
            .update({ is_active: false })
            .eq("id", editing.id);
          if (deactErr) throw deactErr;
        }

        const { data: inserted, error } = await supabase
          .from("consent_template")
          .insert({
            practice_id: practiceId,
            code: draft.code,
            title: draft.title,
            body: draft.body,
            version: draft.version,
            category: draft.category,
            is_active: true,
            supersedes_id: editMode === "bump" && editing ? editing.id : null,
          })
          .select("id")
          .single();
        if (error) {
          // Roll back the deactivation so the practice doesn't end up
          // with no active version of this code.
          if (editMode === "bump" && editing) {
            await supabase
              .from("consent_template")
              .update({ is_active: true })
              .eq("id", editing.id);
          }
          throw error;
        }
        templateId = inserted.id;
      }

      // Refresh service mapping — easier to wipe and re-insert than to
      // diff. The N here is tiny (a handful of services per template at
      // most), so the round-trip cost is negligible.
      await supabase
        .from("consent_template_service")
        .delete()
        .eq("template_id", templateId);
      if (draft.service_ids.length > 0) {
        const rows = draft.service_ids.map((sid) => ({
          practice_id: practiceId,
          template_id: templateId,
          service_id: sid,
        }));
        await supabase.from("consent_template_service").insert(rows);
      }

      toast.success(
        editMode === "bump"
          ? `Saved as ${draft.version}`
          : editMode === "create"
            ? "Template created"
            : "Template updated",
      );
      setSheetOpen(false);
      await load();
    } catch (err) {
      logger.error("Save consent template failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't save template");
    } finally {
      setSaving(false);
    }
  }

  async function importStarters() {
    setImporting(true);
    try {
      const { data: practiceRow } = await supabase
        .from("practice_member")
        .select("practice_id")
        .limit(1)
        .maybeSingle();
      const practiceId = practiceRow?.practice_id;
      if (!practiceId) {
        toast.error("Couldn't resolve practice");
        return;
      }

      // Only insert codes the practice doesn't already have — by ANY
      // version (active or superseded). This lets the import button be
      // safe to run again after we ship new starters: the practice gets
      // the new ones without disturbing the customised copies of the
      // old ones. We check across all rows (deleted or not) so a
      // soft-deleted starter doesn't get re-inserted and trip the
      // active-code unique index.
      const { data: existingRows } = await supabase
        .from("consent_template")
        .select("code");
      const existingCodes = new Set((existingRows ?? []).map((r) => r.code));

      const missing = CONSENT_TEMPLATE_STARTERS.filter(
        (s) => !existingCodes.has(s.code),
      );

      // Insert any missing starters. Active = true so they're immediately
      // usable, but with no service links — they won't appear on any
      // appointment until the practice ticks the services in each
      // template's editor. That forces a review pass without blocking
      // the practice from getting started.
      let insertedCount = 0;
      if (missing.length > 0) {
        const rows = missing.map((s) => ({
          practice_id: practiceId,
          code: s.code,
          title: s.title,
          body: s.body,
          version: s.version,
          category: STARTER_CATEGORY_DEFAULTS[s.code] ?? "OTHER",
          is_active: true,
        }));
        const { error } = await supabase.from("consent_template").insert(rows);
        if (error) throw error;
        insertedCount = rows.length;
      }

      // Re-categorise pass: any existing starter-coded template that's
      // still on the default 'OTHER' gets bumped to its sensible
      // category. Conditional on category='OTHER' so we never overwrite
      // a manual category the practice has set. One UPDATE per
      // category (8 categories max) keeps it bounded.
      const byCategory = new Map<string, string[]>();
      for (const [code, cat] of Object.entries(STARTER_CATEGORY_DEFAULTS)) {
        const arr = byCategory.get(cat) ?? [];
        arr.push(code);
        byCategory.set(cat, arr);
      }
      let recategorised = 0;
      for (const [cat, codes] of byCategory) {
        const { data, error } = await supabase
          .from("consent_template")
          .update({ category: cat })
          .eq("category", "OTHER")
          .in("code", codes)
          .select("id");
        if (!error && data) recategorised += data.length;
      }

      // Compose a single toast that explains all three outcomes so the
      // operator knows exactly what changed and what didn't.
      const parts: string[] = [];
      if (insertedCount > 0) {
        parts.push(`Imported ${insertedCount} new starter${insertedCount === 1 ? "" : "s"}`);
      }
      if (recategorised > 0) {
        parts.push(`re-categorised ${recategorised} existing`);
      }
      const skipped = CONSENT_TEMPLATE_STARTERS.length - missing.length;
      if (parts.length === 0 && skipped > 0) {
        parts.push("You already have all the starter templates");
      }
      toast.success(parts.join(" · ") + ".");

      setShowStartersDialog(false);
      await load();
    } catch (err) {
      logger.error("Import starters failed", err);
      toast.error(err instanceof Error ? err.message : "Couldn't import starter templates");
    } finally {
      setImporting(false);
    }
  }

  function toggleService(serviceId: string) {
    setDraft((d) => ({
      ...d,
      service_ids: d.service_ids.includes(serviceId)
        ? d.service_ids.filter((id) => id !== serviceId)
        : [...d.service_ids, serviceId],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Consent Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build the library once. Link each template to the services that need it —
            the appointment will then prompt for the right signatures automatically.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* Always visible — re-running the import is safe (only missing
              codes get inserted) so practices can pick up any new starters
              we ship without losing their customisations. */}
          <Button onClick={() => setShowStartersDialog(true)} size="sm" variant="outline">
            <BookOpen className="h-4 w-4 mr-1" /> Add starter library
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center space-y-3">
          <FileSignature className="h-6 w-6 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-medium">No templates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add one for each treatment that needs written consent — e.g.
              extraction, x-ray, sedation, photography.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowStartersDialog(true)}>
              <BookOpen className="h-4 w-4 mr-1" />
              Use starter library ({CONSENT_TEMPLATE_STARTERS.length})
            </Button>
            <span className="text-[10px] text-muted-foreground">or</span>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Build your own
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, code, or category"
              className="pl-8"
            />
          </div>

          <TemplateGroupList
            templates={templates}
            services={services}
            searchTerm={searchTerm}
            onEdit={openEdit}
            onBump={openBump}
          />
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editMode === "create"
                ? "New consent template"
                : editMode === "bump"
                  ? `New version (${draft.version})`
                  : "Edit template"}
            </SheetTitle>
            <SheetDescription>
              {editMode === "bump"
                ? "Saving will mark the current version as inactive and make this one active. Patients signing from now on will see the new wording; historical signatures still reference the version they actually saw."
                : "Templates show on the appointment detail when their linked services are booked. The patient signs on the in-practice kiosk."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-1">
                <Label>Code</Label>
                <Input
                  value={draft.code}
                  onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase().replace(/\s+/g, "_") }))}
                  placeholder="EXTRACTION_CONSENT"
                  disabled={editMode === "edit" || editMode === "bump"}
                />
                <p className="text-[10px] text-muted-foreground">
                  Stable identifier. Locked when bumping versions.
                </p>
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label>Version</Label>
                <Input
                  value={draft.version}
                  onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))}
                  disabled={editMode === "edit"}
                />
              </div>
              <div className="space-y-1 sm:col-span-1 flex items-end">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ct-active"
                    checked={draft.is_active}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                    disabled={editMode === "bump"}
                  />
                  <Label htmlFor="ct-active">Active</Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Consent for tooth extraction"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-sm", c.badge)} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Body (Markdown)</Label>
                {/* Preview toggle — author flips between source and the
                    rendered output the patient sees on the kiosk. Same
                    component renders both surfaces, so what you see in
                    preview matches what the patient sees byte-for-byte. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPreviewMode((p) => !p)}
                >
                  {previewMode ? (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" /> Edit source
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 mr-1" /> Preview
                    </>
                  )}
                </Button>
              </div>
              {previewMode ? (
                <div className="rounded-md border bg-muted/10 p-4 min-h-[330px] max-h-[60vh] overflow-y-auto">
                  {draft.body.trim() ? (
                    <ConsentMarkdown body={draft.body} />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Nothing to preview yet — write something in the source view first.
                    </p>
                  )}
                </div>
              ) : (
                <Textarea
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  rows={14}
                  placeholder="I confirm that the procedure has been explained to me, including..."
                  className="font-mono text-xs"
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                What the patient reads on the kiosk before signing. Markdown
                supported — **bold**, lists, headings, &gt; quote blocks.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Required for which services?</Label>
              <p className="text-xs text-muted-foreground">
                Tick every service that needs this consent. When any of these
                appears on an appointment, the patient will be prompted to sign.
              </p>
              {services.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No services configured yet — add them under Services Management first.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 max-h-64 overflow-y-auto border rounded-md p-2">
                  {services.map((svc) => {
                    const checked = draft.service_ids.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => toggleService(svc.id)}
                        className={cn(
                          "text-left text-xs px-2 py-1.5 rounded border transition-colors",
                          checked
                            ? "bg-primary/10 border-primary/40"
                            : "border-muted hover:bg-muted/40",
                        )}
                      >
                        <span className="font-medium">{svc.name}</span>
                        {svc.is_nhs && (
                          <span className="ml-1.5 text-[9px] uppercase tracking-wider bg-blue-100 text-blue-700 rounded px-1">NHS</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={() => save()} disabled={saving} className="flex-1">
                {saving ? "Saving…" : editMode === "bump" ? "Save new version" : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => setSheetOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showStartersDialog} onOpenChange={setShowStartersDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add starter templates to your library?</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;ll add any of the {CONSENT_TEMPLATE_STARTERS.length} starter templates
              you don&apos;t already have — covering examination &amp; treatment, X-rays, local
              anaesthetic, extractions, root canal, crowns, dentures, implants, orthodontics,
              whitening, veneers, periodontal, paediatric, photography, sedation, marketing,
              data sharing, and NHS terms.
              <br />
              <br />
              Templates you&apos;ve already customised (by code) are left untouched — safe to
              re-run when we ship new starters. Existing starter templates still in the
              default &ldquo;Other&rdquo; category will also be re-categorised (your manual
              category picks are left alone).
              <br />
              <br />
              <strong>Please review each before linking it to your services.</strong> The
              wording is a starting point based on GDC and CQC guidance — you should adjust
              it for your practice&apos;s specific procedures and have it checked by your
              principal dentist or defence union.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={importStarters} disabled={importing}>
              {importing ? "Importing…" : "Import & review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deactivateConfirm !== null}
        onOpenChange={(open) => !open && setDeactivateConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateConfirm?.serviceCount ?? 0} service
              {deactivateConfirm?.serviceCount === 1 ? "" : "s"} currently
              {deactivateConfirm?.serviceCount === 1 ? " is" : " are"} linked to
              this template. Deactivating it means
              {deactivateConfirm?.serviceCount === 1
                ? " that service "
                : " those services "}
              will no longer prompt patients to sign this consent. Historical
              signatures stay on the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                setDeactivateConfirm(null);
                void save({ confirmedDeactivation: true });
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateRow({
  template,
  services,
  onEdit,
  onBump,
}: {
  template: Template;
  services: Array<{ id: string; name: string }>;
  onEdit: () => void;
  onBump: () => void;
}) {
  const linkedServices = services.filter((s) => template.service_ids.includes(s.id));
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{template.title}</span>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5",
                categoryMeta(template.category).badge,
              )}
            >
              {categoryMeta(template.category).label}
            </span>
            <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {template.version}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {template.code}
            </span>
          </div>
          {linkedServices.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Not linked to any services yet — won&apos;t appear on any appointment.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {linkedServices.length} service{linkedServices.length === 1 ? "" : "s"} ·{" "}
              {linkedServices
                .slice(0, 3)
                .map((s) => s.name)
                .join(", ")}
              {linkedServices.length > 3 ? `, +${linkedServices.length - 3} more` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs">
            <Edit3 className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onBump} className="h-7 text-xs">
            <ArrowUpFromLine className="h-3 w-3 mr-1" /> New version
          </Button>
        </div>
      </div>
    </div>
  );
}

// Groups templates by category, applies the search filter, and renders
// a collapsible header per group with a coloured swatch + count. Groups
// with no matches for the current search hide entirely. Categories are
// rendered in the order declared in CONSENT_CATEGORIES so the visual
// hierarchy is consistent (routine first, then surgical, etc).
function TemplateGroupList({
  templates,
  services,
  searchTerm,
  onEdit,
  onBump,
}: {
  templates: Template[];
  services: Array<{ id: string; name: string }>;
  searchTerm: string;
  onEdit: (t: Template) => void;
  onBump: (t: Template) => void;
}) {
  // Track which categories the user has EXPANDED. Default empty so every
  // group starts collapsed — for a practice with 7+ categories of
  // templates, that's much tidier than a wall of rows. When the user
  // types in the search box we override the set and force every group
  // open, otherwise typing into a collapsed list would leave matches
  // hidden behind a count.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searching = searchTerm.trim().length > 0;

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const cat = categoryMeta(t.category).label.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        cat.includes(q)
      );
    });
  }, [templates, searchTerm]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, Template[]>();
    for (const t of filtered) {
      const arr = byCategory.get(t.category) ?? [];
      arr.push(t);
      byCategory.set(t.category, arr);
    }
    // Iterate in the canonical order so all practices see the same
    // section order, even for codes they haven't categorised yet.
    return CONSENT_CATEGORIES.flatMap((c) => {
      const list = byCategory.get(c.value);
      if (!list || list.length === 0) return [];
      list.sort((a, b) => a.title.localeCompare(b.title));
      return [{ category: c, templates: list }];
    });
  }, [filtered]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No templates match &ldquo;{searchTerm}&rdquo;.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ category, templates: list }) => {
        // Force-expand while searching so the user can see matches without
        // a click. Otherwise honour their explicit expand state.
        const isExpanded = searching || expanded.has(category.value);
        return (
          <div key={category.value} className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(category.value)) next.delete(category.value);
                  else next.add(category.value);
                  return next;
                });
              }}
              className="w-full flex items-center gap-2 text-left"
            >
              <span className={cn("h-2.5 w-2.5 rounded-sm", category.badge)} />
              <span className={cn("text-xs font-semibold uppercase tracking-wider", category.accent)}>
                {category.label}
              </span>
              <span className="text-[10px] text-muted-foreground">({list.length})</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {isExpanded ? "Hide" : "Show"}
              </span>
            </button>
            {isExpanded && (
              <div className="space-y-2">
                {list.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    services={services}
                    onEdit={() => onEdit(t)}
                    onBump={() => onBump(t)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "v3" → "v4", "1.2" → "1.3", anything else → append " (new)" rather than guessing. */
function nextVersion(current: string): string {
  const m = /^(v?)(\d+)(.*)$/i.exec(current.trim());
  if (m) {
    return `${m[1]}${parseInt(m[2], 10) + 1}${m[3]}`;
  }
  const dotted = /^(\d+)\.(\d+)$/.exec(current.trim());
  if (dotted) {
    return `${dotted[1]}.${parseInt(dotted[2], 10) + 1}`;
  }
  return `${current} (new)`;
}
