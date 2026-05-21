import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import {
  Plus,
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  Loader2,
  List,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

// Adapted to dentaloptima-core's `document` table + `patient-files` storage
// bucket. Path convention enforced by storage RLS in 0013:
//   {practice_id}/{patient_id}/{document_type}/{filename}
// The first folder is parsed back out by the policy and matched against
// app_private.current_practice_id().
//
// MIME types: bucket allows JPEG/PNG/HEIC/HEIF/TIFF, PDF, and DICOM — see
// migration 0013. File size cap is 50MB (enforced bucket-side).
//
// Optional links (added in migration 0030):
//   - appointment_id → the visit the file was captured at
//   - treatment_plan_item_id → the planned treatment it supports

const DOCUMENT_TYPES = [
  { value: "X_RAY", label: "X-Ray" },
  { value: "INTRA_ORAL_PHOTO", label: "Intra-oral photo" },
  { value: "CONSENT_FORM", label: "Consent form" },
  { value: "REFERRAL_LETTER", label: "Referral letter" },
  { value: "ID_DOCUMENT", label: "ID document" },
  { value: "INSURANCE_DOCUMENT", label: "Insurance" },
  { value: "MEDICAL_REPORT", label: "Medical report" },
  { value: "TREATMENT_PLAN_PDF", label: "Treatment plan" },
  { value: "OTHER", label: "Other" },
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

const IMAGING_TYPES: DocumentType[] = ["X_RAY", "INTRA_ORAL_PHOTO"];

const ACCEPT_MIME =
  "image/jpeg,image/jpg,image/png,image/heic,image/heif,image/tiff,application/dicom,application/pdf";

const MAX_BYTES = 50 * 1024 * 1024;

interface AppointmentOption {
  id: string;
  starts_at: string;
  status: string;
  service_label: string;
}

interface TreatmentPlanItemOption {
  id: string;
  label: string;
  tooth_numbers: number[] | null;
  plan_title: string | null;
}

interface DocumentRow {
  id: string;
  patient_id: string;
  document_type: DocumentType;
  title: string;
  description: string | null;
  mime_type: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string | null;
  appointment_id: string | null;
  treatment_plan_item_id: string | null;
  uploader: { full_name: string | null } | null;
  appointment: { starts_at: string; status: string } | null;
  plan_item: {
    notes: string | null;
    tooth_numbers: number[] | null;
    service: { name: string } | null;
    plan: { title: string | null } | null;
  } | null;
}

function getDocIcon(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

function isPreviewableImage(mime: string): boolean {
  // HEIC/HEIF won't render in most browsers; show the doc icon instead.
  return /^image\/(jpeg|jpg|png|gif|webp)$/i.test(mime);
}

function isPreviewablePdf(mime: string): boolean {
  return mime === "application/pdf";
}

function isPreviewable(mime: string): boolean {
  return isPreviewableImage(mime) || isPreviewablePdf(mime);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Conservative filename sanitiser. Preserves ASCII letters/digits/dot/dash/
// underscore; replaces everything else with underscore. Storage tolerates
// a wider charset but we want the path to round-trip cleanly.
function sanitiseFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

interface DocumentsSectionProps {
  patientId: string;
}

export function DocumentsSection({ patientId }: DocumentsSectionProps) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [planItems, setPlanItems] = useState<TreatmentPlanItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "gallery">("list");
  const [lightboxDoc, setLightboxDoc] = useState<DocumentRow | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Cached signed URLs for previewable docs (images for thumbnails + lightbox,
  // PDFs for lightbox iframe). 5-minute lifespan; regenerated on every load
  // so the URL is fresh for an active browse session.
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const [form, setForm] = useState<{
    document_type: DocumentType;
    title: string;
    description: string;
    appointment_id: string;
    treatment_plan_item_id: string;
  }>({
    document_type: "OTHER",
    title: "",
    description: "",
    appointment_id: "",
    treatment_plan_item_id: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("document")
      .select(
        `id, patient_id, document_type, title, description, mime_type,
         file_size_bytes, storage_bucket, storage_path, uploaded_at, uploaded_by,
         appointment_id, treatment_plan_item_id,
         uploader:uploaded_by (full_name),
         appointment:appointment_id (starts_at, status),
         plan_item:treatment_plan_item_id (
           notes, tooth_numbers,
           service:service_id (name),
           plan:treatment_plan_id (title)
         )`,
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });

    if (error) {
      logger.error("Error loading documents", error);
      toast.error("Failed to load documents");
      setLoading(false);
      return;
    }

    const docs = (data as unknown as DocumentRow[]) ?? [];
    setDocuments(docs);
    setLoading(false);

    // Batch-create signed URLs for everything previewable (images + PDFs)
    // in one round-trip per bucket. createSignedUrls accepts an array of
    // paths and returns one signed URL per path — much cheaper than N
    // sequential createSignedUrl calls.
    const previewable = docs.filter((d) => isPreviewable(d.mime_type));
    if (previewable.length === 0) return;

    const byBucket = new Map<string, DocumentRow[]>();
    for (const d of previewable) {
      const list = byBucket.get(d.storage_bucket) ?? [];
      list.push(d);
      byBucket.set(d.storage_bucket, list);
    }

    const urlMap: Record<string, string> = {};
    await Promise.all(
      Array.from(byBucket.entries()).map(async ([bucket, items]) => {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrls(
            items.map((i) => i.storage_path),
            300,
          );
        if (!signed) return;
        signed.forEach((s, idx) => {
          if (s.signedUrl) urlMap[items[idx].id] = s.signedUrl;
        });
      }),
    );
    setPreviewUrls(urlMap);
  }, [patientId]);

  // Patient's recent appointments — used to attach a doc to a visit. Limit
  // 50 most recent so the dropdown stays scrollable on long-tenured
  // patients. Doesn't filter by status: even cancelled visits sometimes
  // need imaging attached (e.g. a cancellation X-ray review).
  const loadAppointments = useCallback(async () => {
    const { data } = await supabase
      .from("appointment")
      .select(
        `id, starts_at, status,
         services:appointment_service (service:service_id (name))`,
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(50);

    if (data) {
      setAppointments(
        (data as unknown as Array<{
          id: string;
          starts_at: string;
          status: string;
          services: Array<{ service: { name: string } | null }>;
        }>).map((a) => ({
          id: a.id,
          starts_at: a.starts_at,
          status: a.status,
          service_label:
            a.services
              .map((s) => s.service?.name)
              .filter(Boolean)
              .join(", ") || "Visit",
        })),
      );
    }
  }, [patientId]);

  // Patient's planned treatments — used to mark a doc as evidence for a
  // specific item (e.g. radiograph that justifies the RCT). Pulls items
  // from non-deleted plans.
  const loadPlanItems = useCallback(async () => {
    const { data } = await supabase
      .from("treatment_plan_item")
      .select(
        `id, notes, tooth_numbers,
         service:service_id (name),
         plan:treatment_plan_id!inner (title, patient_id, deleted_at)`,
      )
      .is("deleted_at", null)
      .eq("plan.patient_id", patientId)
      .is("plan.deleted_at", null)
      .order("created_at", { ascending: false });

    if (data) {
      setPlanItems(
        (data as unknown as Array<{
          id: string;
          notes: string | null;
          tooth_numbers: number[] | null;
          service: { name: string } | null;
          plan: { title: string | null };
        }>).map((i) => ({
          id: i.id,
          label: i.service?.name ?? i.notes ?? "Treatment item",
          tooth_numbers: i.tooth_numbers,
          plan_title: i.plan?.title ?? null,
        })),
      );
    }
  }, [patientId]);

  useEffect(() => {
    load();
    loadAppointments();
    loadPlanItems();
  }, [load, loadAppointments, loadPlanItems]);

  const previewableImages = useMemo(
    () => documents.filter((d) => isPreviewableImage(d.mime_type)),
    [documents],
  );

  const onFilePick = (file: File | null) => {
    setSelectedFile(file);
    if (file && !form.title) {
      // Suggest the title from the filename, minus extension
      const stripped = file.name.replace(/\.[^.]+$/, "");
      setForm((f) => ({ ...f, title: stripped }));
    }
    // Auto-pick X-ray / Intra-oral type from MIME if user hasn't set one.
    if (file && form.document_type === "OTHER") {
      if (file.type === "application/dicom") {
        setForm((f) => ({ ...f, document_type: "X_RAY" }));
      } else if (file.type.startsWith("image/")) {
        setForm((f) => ({ ...f, document_type: "INTRA_ORAL_PHOTO" }));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Pick a file first");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Add a title");
      return;
    }
    if (selectedFile.size > MAX_BYTES) {
      toast.error("File exceeds 50MB limit");
      return;
    }

    setUploading(true);
    try {
      // Path: {practice_id}/{patient_id}/{type}/{timestamp}-{filename}
      // The timestamp prefix avoids storage-path collisions when the same
      // filename is uploaded twice.
      const safeName = sanitiseFileName(selectedFile.name);
      const storagePath = `${practiceId}/${patientId}/${form.document_type}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("patient-files")
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const { error: insertError } = await supabase.from("document").insert({
        practice_id: practiceId,
        patient_id: patientId,
        document_type: form.document_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        mime_type: selectedFile.type || "application/octet-stream",
        file_size_bytes: selectedFile.size,
        storage_bucket: "patient-files",
        storage_path: storagePath,
        appointment_id: form.appointment_id || null,
        treatment_plan_item_id: form.treatment_plan_item_id || null,
      });

      if (insertError) {
        // Roll back the upload to avoid orphan storage objects.
        await supabase.storage.from("patient-files").remove([storagePath]);
        toast.error("Failed to save document record");
        setUploading(false);
        return;
      }

      toast.success("Document uploaded");
      setShowUpload(false);
      setSelectedFile(null);
      setForm({
        document_type: "OTHER",
        title: "",
        description: "",
        appointment_id: "",
        treatment_plan_item_id: "",
      });
      await load();
    } catch (err) {
      logger.error("Document upload failed", err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRow) => {
    setDownloadingId(doc.id);
    try {
      // 60-second signed URL — long enough to open the file, short enough
      // that a leaked URL is low-risk.
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);

      if (error || !data?.signedUrl) {
        toast.error("Couldn't generate download link");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSoftDelete = async (doc: DocumentRow) => {
    if (!confirm(`Delete "${doc.title}"? This can be restored by an admin.`)) return;

    // Soft delete by setting deleted_at on the document row. The storage
    // object stays in place; admins can hard-delete via the dashboard.
    const { error } = await supabase
      .from("document")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", doc.id);

    if (error) {
      toast.error("Failed to delete document");
    } else {
      toast.success("Document deleted");
      await load();
    }
  };

  const openLightbox = async (doc: DocumentRow) => {
    setLightboxDoc(doc);
    setLightboxUrl(null);
    const cached = previewUrls[doc.id];
    if (cached) {
      setLightboxUrl(cached);
      return;
    }
    // Fallback when batch-fetched URL has expired or wasn't fetched (rare).
    const { data } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) setLightboxUrl(data.signedUrl);
  };

  const imagingDocs = useMemo(
    () => documents.filter((d) => IMAGING_TYPES.includes(d.document_type)),
    [documents],
  );

  return (
    <div className="bg-card rounded-lg border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          Documents
          {imagingDocs.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {imagingDocs.length} imaging
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {previewableImages.length > 0 && (
            <div className="flex items-center rounded-md border bg-background mr-1">
              <button
                onClick={() => setView("list")}
                className={`p-1.5 rounded-l-md ${
                  view === "list" ? "bg-muted" : "hover:bg-muted/50"
                }`}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView("gallery")}
                className={`p-1.5 rounded-r-md ${
                  view === "gallery" ? "bg-muted" : "hover:bg-muted/50"
                }`}
                title="Gallery view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4 mr-1" /> Upload
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No documents uploaded yet
        </p>
      ) : view === "gallery" ? (
        <GalleryView
          docs={previewableImages}
          urls={previewUrls}
          onOpen={openLightbox}
        />
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <DocumentRowItem
              key={doc.id}
              doc={doc}
              thumbnailUrl={
                isPreviewableImage(doc.mime_type) ? previewUrls[doc.id] : undefined
              }
              isDownloading={downloadingId === doc.id}
              onDownload={() => handleDownload(doc)}
              onDelete={() => handleSoftDelete(doc)}
              onPreview={isPreviewable(doc.mime_type) ? () => openLightbox(doc) : undefined}
            />
          ))}
        </div>
      )}

      {/* Upload sheet */}
      <Sheet open={showUpload} onOpenChange={setShowUpload}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Upload document</SheetTitle>
            <SheetDescription className="sr-only">
              Upload a document for this patient. Max 50MB. Accepted formats: image, PDF, DICOM.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input
                type="file"
                accept={ACCEPT_MIME}
                onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name} &middot; {formatFileSize(selectedFile.size)}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Max 50MB. Images, PDF, or DICOM only.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.document_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, document_type: v as DocumentType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Bitewing X-rays, July 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Notes for the file"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Linked appointment (optional)</Label>
              <Select
                value={form.appointment_id || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, appointment_id: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {appointments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {format(new Date(a.starts_at), "d MMM yyyy")} —{" "}
                      {a.service_label}
                      {a.status !== "SCHEDULED" && a.status !== "COMPLETED" && (
                        <span className="text-muted-foreground ml-1">
                          ({a.status.toLowerCase()})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Threads this file back to a specific visit (useful for X-rays).
              </p>
            </div>

            {planItems.length > 0 && (
              <div className="space-y-1.5">
                <Label>Linked treatment item (optional)</Label>
                <Select
                  value={form.treatment_plan_item_id || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      treatment_plan_item_id: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {planItems.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.tooth_numbers && i.tooth_numbers.length > 0
                          ? `${i.tooth_numbers.join(", ")} — `
                          : ""}
                        {i.label}
                        {i.plan_title && (
                          <span className="text-muted-foreground ml-1">
                            ({i.plan_title})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Marks this file as supporting evidence for a planned treatment.
                </p>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !form.title.trim()}
              className="w-full"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Lightbox */}
      <Dialog
        open={!!lightboxDoc}
        onOpenChange={(o) => {
          if (!o) {
            setLightboxDoc(null);
            setLightboxUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl p-0 bg-black border-0">
          {lightboxDoc && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between p-3 bg-black/80">
                <div className="text-white">
                  <p className="text-sm font-medium">{lightboxDoc.title}</p>
                  <p className="text-xs text-white/60">
                    {format(new Date(lightboxDoc.uploaded_at), "d MMM yyyy")}
                    {lightboxDoc.appointment &&
                      ` · Visit ${format(
                        new Date(lightboxDoc.appointment.starts_at),
                        "d MMM yyyy",
                      )}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(lightboxDoc)}
                  className="text-white hover:bg-white/10"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-center min-h-[60vh] h-[80vh] bg-black">
                {!lightboxUrl ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                ) : isPreviewablePdf(lightboxDoc.mime_type) ? (
                  // Native browser PDF viewer — every modern browser supports
                  // this. #toolbar=0 hides Chrome's controls so the dialog
                  // owns the chrome.
                  <iframe
                    src={`${lightboxUrl}#toolbar=0`}
                    title={lightboxDoc.title}
                    className="w-full h-full bg-white"
                  />
                ) : (
                  <img
                    src={lightboxUrl}
                    alt={lightboxDoc.title}
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRowItem({
  doc,
  thumbnailUrl,
  isDownloading,
  onDownload,
  onDelete,
  onPreview,
}: {
  doc: DocumentRow;
  thumbnailUrl?: string;
  isDownloading: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onPreview?: () => void;
}) {
  const Icon = getDocIcon(doc.mime_type);
  const typeLabel =
    DOCUMENT_TYPES.find((t) => t.value === doc.document_type)?.label ?? doc.document_type;

  // Whole-row click triggers preview when something can be previewed.
  // Action buttons stop propagation so they aren't swallowed by the row.
  const rowClickable = !!onPreview;

  return (
    <div
      onClick={rowClickable ? onPreview : undefined}
      className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors ${
        rowClickable ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/20"
      }`}
    >
      <div className="shrink-0 h-10 w-10 rounded-md bg-muted overflow-hidden flex items-center justify-center border">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={doc.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{doc.title}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {typeLabel}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {formatFileSize(doc.file_size_bytes)} &middot;{" "}
          {format(new Date(doc.uploaded_at), "d MMM yyyy")}
          {doc.uploader?.full_name && <> &middot; {doc.uploader.full_name}</>}
        </div>
        {(doc.appointment || doc.plan_item) && (
          <div className="text-[10px] text-muted-foreground/90 mt-0.5 flex flex-wrap gap-x-2">
            {doc.appointment && (
              <span>
                Visit · {format(new Date(doc.appointment.starts_at), "d MMM yyyy")}
              </span>
            )}
            {doc.plan_item && (
              <span>
                Plan ·{" "}
                {doc.plan_item.tooth_numbers && doc.plan_item.tooth_numbers.length > 0
                  ? `${doc.plan_item.tooth_numbers.join(", ")} `
                  : ""}
                {doc.plan_item.service?.name ?? doc.plan_item.notes ?? "Item"}
              </span>
            )}
          </div>
        )}
        {doc.description && (
          <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">
            {doc.description}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        disabled={isDownloading}
        className="h-7 w-7 p-0"
        title="Download"
      >
        {isDownloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function GalleryView({
  docs,
  urls,
  onOpen,
}: {
  docs: DocumentRow[];
  urls: Record<string, string>;
  onOpen: (doc: DocumentRow) => void;
}) {
  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No previewable images yet. Upload an X-ray or intra-oral photo to see it here.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {docs.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onOpen(doc)}
          className="relative aspect-square rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all group"
          title={doc.title}
        >
          {urls[doc.id] ? (
            <img
              src={urls[doc.id]}
              alt={doc.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
            <p className="text-[10px] text-white truncate text-left">{doc.title}</p>
            <p className="text-[9px] text-white/70 text-left">
              {format(new Date(doc.uploaded_at), "d MMM yyyy")}
            </p>
          </div>
          {doc.document_type === "X_RAY" && (
            <span className="absolute top-1 right-1 text-[9px] font-semibold bg-blue-500 text-white px-1 py-0.5 rounded">
              X-RAY
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
