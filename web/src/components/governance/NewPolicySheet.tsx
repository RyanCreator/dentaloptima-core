import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { FileText, Download, Upload, X as XIcon, Sparkles } from "lucide-react";
import { POLICY_TEMPLATES } from "@/lib/policyTemplates";
import { downloadPolicyTemplateAsWord } from "@/lib/downloadPolicyTemplate";

interface NewPolicySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "INFECTION_CONTROL",      label: "Infection control" },
  { value: "SAFEGUARDING",           label: "Safeguarding" },
  { value: "COMPLAINTS",             label: "Complaints" },
  { value: "INFORMATION_GOVERNANCE", label: "Information governance" },
  { value: "EQUALITY_DIVERSITY",     label: "Equality & diversity" },
  { value: "HEALTH_SAFETY",          label: "Health & safety" },
  { value: "CLINICAL_GOVERNANCE",    label: "Clinical governance" },
  { value: "WHISTLEBLOWING",         label: "Whistleblowing" },
  { value: "CONSENT",                label: "Consent" },
  { value: "BUSINESS_CONTINUITY",    label: "Business continuity" },
  { value: "OTHER",                  label: "Other" },
];

const MAX_PDF_BYTES = 50 * 1024 * 1024; // matches the patient-files bucket cap

export function NewPolicySheet({ open, onOpenChange, onCreated }: NewPolicySheetProps) {
  const auth = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [content, setContent] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [nextReviewDate, setNextReviewDate] = useState<string>("");

  // PDF attachment — optional. Practices with consultant-prepared policies
  // can upload the PDF instead of (or alongside) the in-app text body.
  // The text body stays required so the policy is searchable + readable
  // without downloading the PDF.
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Reset on open. Pre-fill next-review-date to 1 year from today since
  // that's the CQC default expectation for most policies.
  useEffect(() => {
    if (!open) return;
    setCategory("");
    setTitle("");
    setVersion("1.0");
    setContent("");
    setPdfFile(null);
    const today = new Date();
    setEffectiveFrom(format(today, "yyyy-MM-dd"));
    const inAYear = new Date(today);
    inAYear.setFullYear(inAYear.getFullYear() + 1);
    setNextReviewDate(format(inAYear, "yyyy-MM-dd"));
  }, [open]);

  const template = category ? POLICY_TEMPLATES[category] : null;
  const hasUserEditedContent = content.trim().length > 0;

  // Apply the template body + title to the form. Only run when the user
  // explicitly clicks — auto-applying on category pick would clobber edits.
  const applyTemplate = () => {
    if (!template) return;
    setContent(template.body);
    // Only set the title if the user hasn't typed something themselves.
    if (!title.trim()) setTitle(template.title);
    toast.success("Template loaded — edit the [bracketed] placeholders to match your practice");
  };

  const onPickPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted here");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("PDF exceeds 50MB limit");
      e.target.value = "";
      return;
    }
    setPdfFile(file);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!auth.member) { toast.error("Not signed in"); return; }
    if (!category)            { toast.error("Pick a category"); return; }
    if (!title.trim())        { toast.error("Title is required"); return; }
    if (!version.trim())      { toast.error("Version is required"); return; }
    if (!content.trim())      { toast.error("Content is required"); return; }
    if (!effectiveFrom)       { toast.error("Effective date is required"); return; }

    setSubmitting(true);
    try {
      // 1. Upload PDF first if one is attached. We do this before the
      //    policy insert so a failed upload doesn't leave an orphan policy
      //    row pointing at a missing document.
      let documentId: string | null = null;
      let pdfPath: string | null = null;
      if (pdfFile) {
        const practiceId = auth.member.practice_id;
        const safeName = pdfFile.name.replace(/[^a-z0-9._-]+/gi, "_");
        // Policies aren't patient-scoped, so we drop them under a synthetic
        // "policies" path within the patient-files bucket. RLS scopes to
        // practice_id — `policies` is just a folder convention.
        pdfPath = `${practiceId}/policies/${Date.now()}-${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from("patient-files")
          .upload(pdfPath, pdfFile, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadErr) throw uploadErr;

        const { data: doc, error: docErr } = await supabase
          .from("document")
          .insert({
            practice_id: practiceId,
            // document.patient_id is nullable in 0004 — policies aren't
            // patient docs.
            patient_id: null,
            document_type: "OTHER",
            title: `${title.trim()} (v${version.trim()})`,
            description: "Policy PDF",
            mime_type: "application/pdf",
            file_size_bytes: pdfFile.size,
            storage_bucket: "patient-files",
            storage_path: pdfPath,
          })
          .select("id")
          .single();
        if (docErr || !doc) {
          await supabase.storage.from("patient-files").remove([pdfPath]);
          throw docErr ?? new Error("Document insert failed");
        }
        documentId = doc.id;
      }

      // 2. Insert the policy. If this fails after the PDF was uploaded
      //    we clean up the storage object so we don't leak.
      const { error } = await supabase
        .from("policy")
        .insert({
          practice_id: auth.member.practice_id,
          category,
          title: title.trim(),
          version: version.trim(),
          content: content.trim(),
          effective_from: effectiveFrom,
          next_review_date: nextReviewDate || null,
          is_active: true,
          document_id: documentId,
        });
      if (error) {
        // Roll back the orphaned document + storage object on failure.
        if (documentId) {
          await supabase.from("document").delete().eq("id", documentId);
        }
        if (pdfPath) {
          await supabase.storage.from("patient-files").remove([pdfPath]);
        }
        // 23505 = unique violation. The schema has UNIQUE(practice_id,
        // category, version), so this fires when an existing policy has
        // the same category + version — almost always means the admin
        // forgot to bump the version number on an update.
        if (error.code === "23505") {
          toast.error("A policy with this category + version already exists. Bump the version number.");
        } else {
          throw error;
        }
      } else {
        toast.success("Policy published");
        toast.message("All staff will see it in their acknowledgement queue.");
        onOpenChange(false);
        onCreated?.();
      }
    } catch (err) {
      logger.error("policy create failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to publish policy");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Publish a policy</SheetTitle>
          <SheetDescription>
            All staff will be asked to read and acknowledge. Version numbers
            let you track changes over time — bump the version when you
            update an existing policy.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Version *</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.0, 2.1, 2024.1"
              />
            </div>
          </div>

          {/* Template card — only shows when a category with a template is
              picked. Lets the practice either prefill the form OR download
              a Word doc to edit offline + bring back later. */}
          {template && (
            <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">CQC-aligned template available</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A serious starting point with the sections inspectors look
                    for. Bracketed [placeholders] flag the bits you must
                    customise for your practice.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={applyTemplate}
                  disabled={submitting}
                  className="h-8 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  {hasUserEditedContent ? "Replace with template" : "Use this template"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPolicyTemplateAsWord(template)}
                  disabled={submitting}
                  className="h-8 text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Download as Word
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Patient consent policy, Infection prevention &amp; control"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Effective from *</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Next review date</Label>
              <Input
                type="date"
                value={nextReviewDate}
                onChange={(e) => setNextReviewDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                CQC expects most policies reviewed annually.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Policy content *</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The full policy text. Markdown-style headings (## Section) render as bold on the detail page."
              rows={14}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              You can paste from a Word document — plain text works best.
              Use the template above for a CQC-aligned starting point.
            </p>
          </div>

          {/* Optional PDF attachment. Practice keeps the searchable text
              version up there, attaches the formal Word/PDF document
              version here. */}
          <div className="space-y-2">
            <Label>Attach PDF (optional)</Label>
            {pdfFile ? (
              <div className="flex items-center gap-2 rounded border bg-muted/30 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{pdfFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(pdfFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (pdfInputRef.current) pdfInputRef.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Remove PDF"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pdfInputRef.current?.click()}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4 mr-1" /> Choose PDF
              </Button>
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              onChange={onPickPdf}
              className="hidden"
            />
            <p className="text-[11px] text-muted-foreground">
              For consultant-prepared documents. The text content above stays the
              searchable + readable version inside the app; the PDF is the formal
              record staff can download.
            </p>
          </div>

          <SheetFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Publishing…" : "Publish policy"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
