import { useEffect, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePractice } from "@/contexts/PracticeContext";
import { logger } from "@/lib/logger";
import {
  buildTemplateCsv,
  parsePatientsCsv,
  findDuplicateRowNumbers,
  CSV_COLUMNS,
  type ParsedRow,
  type ExistingPatientLite,
  type PatientDraft,
} from "@/lib/patientCsv";
import { cn } from "@/lib/utils";

// Bulk patient import. Stricter than the services importer because
// patient records are PII / clinical:
//   - Required fields enforced before commit (first + last name)
//   - Duplicate detection by (name + phone) OR (name + email) against
//     existing active patients in this practice — duplicates are SKIPPED
//     (not overwritten) and reported in the preview
//   - Per-row validation surfaces errors inline; bad rows don't commit
//   - Insert is chunked to keep PostgREST happy with large files

interface ImportPatientsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

type ParseStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "parsed";
      fileName: string;
      fileError: string | null;
      headerWarnings: string[];
      rows: ParsedRow[];
      duplicates: Map<number, ExistingPatientLite>;
    };

const INSERT_CHUNK = 100;

export function ImportPatientsSheet({ open, onOpenChange, onImported }: ImportPatientsSheetProps) {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const [status, setStatus] = useState<ParseStatus>({ kind: "idle" });
  const [importing, setImporting] = useState(false);
  const [existingPatients, setExistingPatients] = useState<ExistingPatientLite[] | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load the slim existing-patient list when the sheet opens. We only
  // pull (id, name, phone, email) — even at 20k patients this is small.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingExisting(true);
    void (async () => {
      const { data, error } = await supabase
        .from("patient")
        .select("id, first_name, last_name, phone, email")
        .is("deleted_at", null);
      if (cancelled) return;
      if (error) {
        logger.error("Failed to load existing patients for dupe check", error);
        toast.error("Couldn't load existing patient list — duplicate detection disabled.");
        setExistingPatients([]);
      } else {
        setExistingPatients((data ?? []) as ExistingPatientLite[]);
      }
      setLoadingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setStatus({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDownloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patients-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setStatus({ kind: "loading" });
    try {
      const text = await file.text();
      const result = parsePatientsCsv(text);
      const duplicates = findDuplicateRowNumbers(result.rows, existingPatients ?? []);
      setStatus({
        kind: "parsed",
        fileName: file.name,
        fileError: result.fileError,
        headerWarnings: result.headerWarnings,
        rows: result.rows,
        duplicates,
      });
    } catch (err) {
      toast.error("Couldn't read that file");
      logger.error("Patient CSV read failed", err);
      setStatus({ kind: "idle" });
    }
  }

  async function handleImport() {
    if (status.kind !== "parsed") return;

    // Importable = no validation errors AND not flagged as a duplicate.
    const importable = status.rows.filter(
      (r) => r.draft && r.errors.length === 0 && !status.duplicates.has(r.rowNumber),
    );
    if (importable.length === 0) return;

    setImporting(true);
    let ok = 0;
    let failed = 0;
    try {
      // Chunked inserts keep payloads + URL lengths sane on big migrations.
      for (let i = 0; i < importable.length; i += INSERT_CHUNK) {
        const chunk = importable.slice(i, i + INSERT_CHUNK);
        const rows = chunk
          .map((r) => r.draft as PatientDraft)
          .map((d) => ({
            practice_id: practiceId,
            ...d,
          }));
        const { error } = await supabase.from("patient").insert(rows);
        if (error) {
          logger.error("Patient bulk insert chunk failed", error);
          failed += chunk.length;
        } else {
          ok += chunk.length;
        }
      }
    } finally {
      setImporting(false);
    }

    const skipped = status.duplicates.size;
    const errored = status.rows.length - importable.length - skipped;

    if (ok > 0) {
      toast.success(
        `Imported ${ok} patient${ok === 1 ? "" : "s"}.${
          skipped > 0 ? ` ${skipped} skipped as duplicates.` : ""
        }${failed > 0 ? ` ${failed} failed — see console.` : ""}${
          errored > 0 ? ` ${errored} had errors.` : ""
        }`,
      );
      onImported?.();
      onOpenChange(false);
      reset();
    } else if (skipped > 0 && failed === 0) {
      toast.info(`No new patients imported — all ${skipped} rows already exist.`);
    } else {
      toast.error(`No patients imported — ${failed} row${failed === 1 ? "" : "s"} failed.`);
    }
  }

  const parsed = status.kind === "parsed" ? status : null;
  const importableCount =
    parsed?.rows.filter(
      (r) => r.errors.length === 0 && !parsed.duplicates.has(r.rowNumber),
    ).length ?? 0;
  const duplicateCount = parsed?.duplicates.size ?? 0;
  const errorCount = parsed?.rows.filter((r) => r.errors.length > 0).length ?? 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import patients from CSV</SheetTitle>
          <SheetDescription>
            Bulk-add patients from a spreadsheet — handy for migrating from
            another practice management system. Existing patients (matched
            by name + phone or name + email) are skipped automatically.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* 1. Template */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold">Step 1 — start from the template</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Header-only file with the expected columns — no sample
                  data included. Open in Excel or Google Sheets, paste your
                  patient list under the headers, save as CSV, then upload.
                  Format hints for each column are below.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Show column reference
              </summary>
              <ul className="mt-2 space-y-1.5 pl-1">
                {CSV_COLUMNS.map((c) => (
                  <li key={c.key} className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{c.header}</span>
                    {c.required && (
                      <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                    {c.hint && (
                      <span className="text-muted-foreground">— {c.hint}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* 2. Upload */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <Upload className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold">Step 2 — upload your CSV</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll show you a preview, flag duplicates against your
                  existing patient list, and only commit the rows that pass.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              disabled={loadingExisting}
              className="block text-xs"
            />
            {loadingExisting && (
              <p className="text-xs text-muted-foreground">
                Loading existing patient list for duplicate detection…
              </p>
            )}
          </div>

          {/* 3. Preview */}
          {status.kind === "loading" && (
            <p className="text-sm text-muted-foreground">Parsing…</p>
          )}

          {parsed && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">Step 3 — review &amp; import</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    From <span className="font-mono">{parsed.fileName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {importableCount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" />
                      {importableCount} ready
                    </span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200 px-1.5 py-0.5 rounded">
                      <Copy className="h-3 w-3" />
                      {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" />
                      {errorCount} with errors
                    </span>
                  )}
                </div>
              </div>

              {parsed.fileError && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/60 p-3 text-xs text-red-900 dark:text-red-100 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-700 dark:text-red-300" />
                  <span>{parsed.fileError}</span>
                </div>
              )}

              {parsed.headerWarnings.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {parsed.headerWarnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              {!parsed.fileError && parsed.rows.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left w-10">#</th>
                          <th className="px-2 py-1.5 text-left">Name</th>
                          <th className="px-2 py-1.5 text-left">DOB</th>
                          <th className="px-2 py-1.5 text-left">Phone / Email</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((row) => {
                          const hasError = row.errors.length > 0;
                          const isDuplicate = parsed.duplicates.has(row.rowNumber);
                          const tone = hasError
                            ? "bg-red-50/50 dark:bg-red-950/10"
                            : isDuplicate
                              ? "bg-blue-50/40 dark:bg-blue-950/10"
                              : "hover:bg-muted/30";
                          return (
                            <tr key={row.rowNumber} className={cn("border-t", tone)}>
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                                {row.rowNumber}
                              </td>
                              <td className="px-2 py-1.5 truncate max-w-[200px]">
                                {[row.raw["First name"], row.raw["Last name"]]
                                  .filter(Boolean)
                                  .join(" ") || (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                                {row.raw["Date of birth"] || "—"}
                              </td>
                              <td className="px-2 py-1.5 truncate max-w-[200px] text-muted-foreground">
                                {row.raw["Phone"] || row.raw["Email"] || "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                {hasError ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200"
                                    title={row.errors.join("\n")}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {row.errors.length === 1
                                      ? row.errors[0]
                                      : `${row.errors.length} errors`}
                                  </span>
                                ) : isDuplicate ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300"
                                    title="Existing patient with same name + phone or name + email"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Already exists — skip
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Ready
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!parsed.fileError && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={reset} disabled={importing}>
                    Pick another file
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing || importableCount === 0}
                  >
                    {importing
                      ? "Importing…"
                      : `Import ${importableCount} patient${importableCount === 1 ? "" : "s"}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
