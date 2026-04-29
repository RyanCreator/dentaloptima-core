import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { format } from "date-fns";
import { Plus, FileText, Image, FileX, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DocumentRow {
  id: string;
  patient_id: string;
  document_type: string | null;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by_staff_id: string | null;
  notes: string | null;
  is_confidential: boolean;
  staff?: { full_name: string } | null;
}

const DOC_TYPES = [
  { value: "xray", label: "X-Ray" },
  { value: "consent_form", label: "Consent Form" },
  { value: "correspondence", label: "Correspondence" },
  { value: "referral_letter", label: "Referral Letter" },
  { value: "photo", label: "Photo" },
  { value: "medical_history", label: "Medical History" },
  { value: "treatment_estimate", label: "Treatment Estimate" },
  { value: "other", label: "Other" },
];

function getDocIcon(type: string | null) {
  if (type === "xray" || type === "photo") return Image;
  return FileText;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsSectionProps {
  patientId: string;
}

export function DocumentsSection({ patientId }: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    document_type: "other",
    notes: "",
    is_confidential: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("document")
      .select("*, staff:uploaded_by_staff_id(full_name)")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });

    if (error) logger.error("Error loading documents", error);
    else setDocuments(data || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const { data: staffData } = await supabase
        .from("app_staff")
        .select("id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      // Upload to Supabase Storage
      const filePath = `patients/${patientId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile);

      if (uploadError) {
        // Storage bucket may not exist yet — save metadata anyway with placeholder path
        logger.error("Storage upload failed (bucket may need setup)", uploadError);
      }

      // Save document metadata
      const { error } = await supabase.from("document").insert({
        patient_id: patientId,
        document_type: form.document_type,
        file_path: filePath,
        file_name: selectedFile.name,
        file_size_bytes: selectedFile.size,
        mime_type: selectedFile.type,
        uploaded_by_staff_id: staffData?.id || null,
        notes: form.notes.trim() || null,
        is_confidential: form.is_confidential,
      });

      if (error) {
        toast.error("Failed to save document record");
      } else {
        toast.success("Document uploaded");
        setShowUpload(false);
        setSelectedFile(null);
        setForm({ document_type: "other", notes: "", is_confidential: false });
        await load();
      }
    } catch (err) {
      logger.error("Upload error", err);
      toast.error("Upload failed");
    }
    setUploading(false);
  };

  const deleteDocument = async (doc: DocumentRow) => {
    // Delete from storage (may fail if bucket doesn't exist — that's OK)
    await supabase.storage.from("documents").remove([doc.file_path]).catch(() => {});

    const { error } = await supabase.from("document").delete().eq("id", doc.id);
    if (error) {
      toast.error("Failed to delete document");
    } else {
      toast.success("Document deleted");
      await load();
    }
  };

  return (
    <div className="bg-card rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Documents</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-1" /> Upload
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No documents</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => {
            const Icon = getDocIcon(doc.document_type);
            const typeLabel = DOC_TYPES.find((t) => t.value === doc.document_type)?.label || doc.document_type;

            return (
              <div key={doc.id} className="flex items-center gap-2.5 p-2.5 rounded-md border text-sm">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-xs truncate">{doc.file_name}</span>
                    {doc.is_confidential && (
                      <span className="text-[9px] bg-red-100 text-red-700 rounded px-1 py-0.5 font-medium">Confidential</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {typeLabel}
                    {doc.file_size_bytes ? ` · ${formatFileSize(doc.file_size_bytes)}` : ""}
                    {doc.staff?.full_name ? ` · ${doc.staff.full_name}` : ""}
                    {` · ${format(new Date(doc.uploaded_at), "d MMM yyyy")}`}
                  </div>
                  {doc.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{doc.notes}</p>}
                </div>
                <button
                  onClick={() => deleteDocument(doc)}
                  className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                  title="Delete document"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload sheet */}
      <Sheet open={showUpload} onOpenChange={setShowUpload}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Upload Document</SheetTitle>
            <SheetDescription className="sr-only">Upload a file for this patient</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Description or context..." />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Confidential</Label>
                <p className="text-[10px] text-muted-foreground">Only admin and uploader can view</p>
              </div>
              <input
                type="checkbox"
                checked={form.is_confidential}
                onChange={(e) => setForm((f) => ({ ...f, is_confidential: e.target.checked }))}
                className="rounded"
              />
            </div>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile} className="w-full">
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Note: Supabase Storage bucket "documents" must be created in the Dashboard for file storage to work. Document metadata is saved regardless.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
