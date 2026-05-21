import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServiceManagement } from "@/hooks/useServiceManagement";
import {
  buildTemplateCsv,
  parseServicesCsv,
  CSV_COLUMNS,
  type ParsedRow,
} from "@/lib/serviceCsv";
import { cn } from "@/lib/utils";

// Bulk-import services from a CSV. Sheet flow:
//   1. Show explainer + "Download template" button
//   2. File picker
//   3. After upload: parse + validate, show preview with row-level errors
//   4. "Import N services" button — only valid rows are written
//
// Insert-only. Eligible-staff assignment is done afterwards via the
// existing Staff tab on each service or the bulk view on each clinician.

interface ImportServicesSheetProps {
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
    };

export function ImportServicesSheet({ open, onOpenChange, onImported }: ImportServicesSheetProps) {
  const { createService } = useServiceManagement();
  const [status, setStatus] = useState<ParseStatus>({ kind: "idle" });
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setStatus({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDownloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "services-starter-uk.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setStatus({ kind: "loading" });
    try {
      const text = await file.text();
      const result = parseServicesCsv(text);
      setStatus({
        kind: "parsed",
        fileName: file.name,
        fileError: result.fileError,
        headerWarnings: result.headerWarnings,
        rows: result.rows,
      });
    } catch (err) {
      toast.error("Couldn't read that file");
      // eslint-disable-next-line no-console
      console.error("CSV read failed", err);
      setStatus({ kind: "idle" });
    }
  }

  async function handleImport() {
    if (status.kind !== "parsed") return;
    const validRows = status.rows.filter((r) => r.draft && r.errors.length === 0);
    if (validRows.length === 0) return;
    setImporting(true);
    let ok = 0;
    let failed = 0;
    for (const row of validRows) {
      // requireStaff=false skips the "must assign at least one staff"
      // guard. Eligible staff are added afterwards from each service or
      // from a clinician's profile.
      const success = await createService(row.draft!, [], { requireStaff: false });
      if (success) ok++;
      else failed++;
    }
    setImporting(false);
    if (ok > 0) {
      toast.success(
        `Imported ${ok} service${ok === 1 ? "" : "s"}.${
          failed > 0 ? ` ${failed} failed — see console.` : ""
        }`,
      );
      onImported?.();
      onOpenChange(false);
      reset();
    } else {
      toast.error(`No services imported — ${failed} row${failed === 1 ? "" : "s"} failed.`);
    }
  }

  const parsed = status.kind === "parsed" ? status : null;
  const validCount = parsed?.rows.filter((r) => r.errors.length === 0).length ?? 0;
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
          <SheetTitle>Import services from CSV</SheetTitle>
          <SheetDescription>
            Upload a spreadsheet of services to add them all at once.
            Eligible staff are assigned afterwards from each service or
            from a clinician's profile.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* 1. Template download */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold">Step 1 — start from the template</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comes pre-filled with 10 common UK dental services to get
                  you going — edit prices, change colours, delete what you
                  don't offer. Open in Excel or Google Sheets, save as CSV,
                  then upload.
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
              <ul className="mt-2 space-y-1 pl-1">
                {CSV_COLUMNS.map((c) => (
                  <li key={c.key}>
                    <span className="font-medium text-foreground">{c.header}</span>
                    {c.required && (
                      <span className="ml-1 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* 2. File picker */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <Upload className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold">Step 2 — upload your CSV</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll parse it, show you a preview, and only commit the
                  rows that pass validation.
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
              className="block text-xs"
            />
          </div>

          {/* 3. Preview */}
          {status.kind === "loading" && (
            <p className="text-sm text-muted-foreground">Parsing…</p>
          )}

          {parsed && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">
                    Step 3 — review &amp; import
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    From <span className="font-mono">{parsed.fileName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {validCount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" />
                      {validCount} ok
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
                          <th className="px-2 py-1.5 text-left">Service name</th>
                          <th className="px-2 py-1.5 text-left">Duration</th>
                          <th className="px-2 py-1.5 text-left">Price</th>
                          <th className="px-2 py-1.5 text-left">NHS</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((row) => {
                          const hasError = row.errors.length > 0;
                          return (
                            <tr
                              key={row.rowNumber}
                              className={cn(
                                "border-t",
                                hasError
                                  ? "bg-red-50/50 dark:bg-red-950/10"
                                  : "hover:bg-muted/30",
                              )}
                            >
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                                {row.rowNumber}
                              </td>
                              <td className="px-2 py-1.5 truncate max-w-[200px]">
                                {row.raw["Service name"] || (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.raw["Duration (minutes)"] || "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.raw["Price (£)"] ? `£${row.raw["Price (£)"]}` : "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                {row.raw["NHS service"] || "—"}
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
                  <Button
                    variant="outline"
                    onClick={reset}
                    disabled={importing}
                  >
                    Pick another file
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing || validCount === 0}
                  >
                    {importing
                      ? "Importing…"
                      : `Import ${validCount} service${validCount === 1 ? "" : "s"}`}
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
