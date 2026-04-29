import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Users, Archive, ArchiveRestore, MoreVertical, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  archiveContact,
  bulkImportContacts,
  restoreContact,
  updateContact,
  updateContactStatus,
  useOutreachContactCounts,
  useOutreachContacts,
  type OutreachContact,
  type OutreachContactStatus,
} from "@/hooks/useOutreachContacts";

const TARGET_OPTIONS = ["TARGET", "MAYBE", "LATER", "GROUP", "NO"] as const;

const STATUS_LABEL: Record<OutreachContactStatus | "ALL", string> = {
  ALL: "All",
  ACTIVE: "Active",
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  COMPLAINED: "Spam complaint",
};

const STATUS_TONE: Record<OutreachContactStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  UNSUBSCRIBED: "bg-slate-100 text-slate-700 border-slate-200",
  BOUNCED: "bg-amber-100 text-amber-700 border-amber-200",
  COMPLAINED: "bg-red-100 text-red-700 border-red-200",
};

// Column-name candidates we'll auto-detect when reading the CSV header row.
// Lowercase + collapsed-whitespace match. First match wins.
const FIELD_ALIASES: Record<string, string[]> = {
  email: ["email", "email address", "e-mail", "mail"],
  first_name: ["first_name", "firstname", "first name", "given name", "name"],
  last_name: ["last_name", "lastname", "last name", "surname", "family name"],
  practice_name: ["practice_name", "practice", "practice name", "company", "business", "organisation", "organization", "clinic", "dental practice"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "contact"],
};

function autoMapColumns(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {
    email: null,
    first_name: null,
    last_name: null,
    practice_name: null,
    phone: null,
  };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const normalisedHeaders = headers.map(norm);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalisedHeaders.indexOf(alias);
      if (idx >= 0) {
        map[field] = headers[idx];
        break;
      }
    }
  }
  return map;
}

const PAGE_SIZE = 100;

export default function OutreachContacts() {
  const [status, setStatus] = useState<OutreachContactStatus | "ALL">("ACTIVE");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  // When viewing archived, the status filter no longer makes sense — show
  // all archived regardless of marketing status.
  const effectiveStatus = showArchived ? "ALL" : status;
  // Reset to the first page whenever the filters change — otherwise a user
  // who was on page 4 of "Active" lands on page 4 of "Bounced", which might
  // not exist.
  useEffect(() => {
    setPage(0);
  }, [effectiveStatus, search, showArchived]);
  const { contacts, totalCount, loading, reload } = useOutreachContacts({
    status: effectiveStatus,
    search,
    showArchived,
    page,
    pageSize: PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const { counts, reload: reloadCounts } = useOutreachContactCounts();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<OutreachContact | null>(null);

  const refreshAll = () => {
    reload();
    reloadCounts();
  };

  return (
    <Layout
      title="Contacts"
      description="Your contact list. Upload by CSV, then email via templates and campaigns."
      actions={
        <>
          <Input
            placeholder="Search email, name, practice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px]"
          />
          {!showArchived && (
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as OutreachContactStatus | "ALL")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[200px]">
                <SelectItem value="ACTIVE">Active ({counts.ACTIVE})</SelectItem>
                <SelectItem value="ALL">All ({counts.ALL})</SelectItem>
                <SelectItem value="UNSUBSCRIBED">Unsubscribed ({counts.UNSUBSCRIBED})</SelectItem>
                <SelectItem value="BOUNCED">Bounced ({counts.BOUNCED})</SelectItem>
                <SelectItem value="COMPLAINED">Complaints ({counts.COMPLAINED})</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant={showArchived ? "secondary" : "ghost"}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="h-4 w-4 mr-1.5" />
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} disabled={showArchived}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload CSV
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-3 opacity-60" />
          <p className="font-medium">
            {showArchived
              ? "No archived contacts"
              : counts.ALL === 0
                ? "No contacts yet"
                : "No matches for this filter"}
          </p>
          <p className="text-sm mt-1">
            {showArchived
              ? "Archived contacts will appear here. Restore them to email again."
              : counts.ALL === 0
                ? "Upload a CSV to get started."
                : "Try a different status or clear the search."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            Showing {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            {showArchived
              ? ` archived contact${totalCount === 1 ? "" : "s"}`
              : ` ${STATUS_LABEL[status].toLowerCase()} contact${totalCount === 1 ? "" : "s"}`}
          </p>
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Practice</th>
                  <th className="text-left px-4 py-2.5 font-medium">Area</th>
                  <th className="text-left px-4 py-2.5 font-medium">Target</th>
                  <th className="text-left px-4 py-2.5 font-medium">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last emailed</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <ContactRow key={c.id} contact={c} onChange={refreshAll} onEdit={() => setEditing(c)} />
                ))}
              </tbody>
            </table>
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs">
                <span className="text-muted-foreground">
                  Page {safePage + 1} of {pageCount}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={() => {
          setUploadOpen(false);
          refreshAll();
        }}
      />

      <EditContactSheet
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refreshAll();
        }}
      />
    </Layout>
  );
}

const TARGET_TONE: Record<string, string> = {
  TARGET: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MAYBE: "bg-amber-100 text-amber-700 border-amber-200",
  LATER: "bg-blue-100 text-blue-700 border-blue-200",
  GROUP: "bg-slate-100 text-slate-700 border-slate-200",
  NO: "bg-red-100 text-red-700 border-red-200",
};

function ContactRow({
  contact,
  onChange,
  onEdit,
}: {
  contact: OutreachContact;
  onChange: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const area = contact.custom?.area ?? null;
  const target = (contact.custom?.target_rating ?? "").toString().toUpperCase() || null;

  const handleStatus = async (s: OutreachContactStatus) => {
    setBusy(true);
    try {
      await updateContactStatus(contact.id, s);
      toast.success(`Marked ${STATUS_LABEL[s].toLowerCase()}`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const [confirmArchive, setConfirmArchive] = useState(false);

  const doArchive = async () => {
    setBusy(true);
    try {
      await archiveContact(contact.id);
      toast.success("Archived");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      await restoreContact(contact.id);
      toast.success("Restored");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr
      className="border-t hover:bg-accent/30 transition-colors cursor-pointer"
      onClick={(e) => {
        // Don't trigger edit when clicking the actions menu — that has its own
        // handlers. Walk up to spot the menu region via a data attribute.
        if ((e.target as HTMLElement).closest("[data-row-actions]")) return;
        onEdit();
      }}
    >
      <td className="px-4 py-2.5 font-mono text-xs">{contact.email}</td>
      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[220px]" title={contact.practice_name ?? ""}>
        {contact.practice_name || "—"}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground text-xs">{area || "—"}</td>
      <td className="px-4 py-2.5">
        {target ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${
              TARGET_TONE[target] ?? "bg-muted text-muted-foreground border-transparent"
            }`}
          >
            {target}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{contact.phone || "—"}</td>
      <td className="px-4 py-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${STATUS_TONE[contact.status]}`}>
          {contact.status.toLowerCase()}
        </span>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground text-xs">
        {contact.last_emailed_at ? format(new Date(contact.last_emailed_at), "d MMM yyyy") : "—"}
      </td>
      <td className="px-1 py-2.5" data-row-actions>
        {/* Radix-portaled menu — escapes the table's overflow-hidden which
            would otherwise clip an inline absolutely-positioned popup. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              className="p-1 rounded hover:bg-accent"
              aria-label="Row actions"
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {contact.archived_at ? (
              <DropdownMenuItem onClick={handleRestore}>
                <ArchiveRestore className="h-3 w-3 mr-1.5" />
                Restore
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3 w-3 mr-1.5" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {contact.status !== "ACTIVE" && (
                  <DropdownMenuItem onClick={() => handleStatus("ACTIVE")}>
                    Mark active
                  </DropdownMenuItem>
                )}
                {contact.status !== "UNSUBSCRIBED" && (
                  <DropdownMenuItem onClick={() => handleStatus("UNSUBSCRIBED")}>
                    Mark unsubscribed
                  </DropdownMenuItem>
                )}
                {contact.status !== "BOUNCED" && (
                  <DropdownMenuItem onClick={() => handleStatus("BOUNCED")}>
                    Mark bounced
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-3 w-3 mr-1.5" />
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive ${contact.email}?`}
          description="They will be hidden from the contact list and excluded from new campaigns. Their open / click history is kept on file. You can restore them later from 'Show archived'."
          confirmLabel="Archive"
          onConfirm={doArchive}
        />
      </td>
    </tr>
  );
}

interface ParsedRow {
  [key: string]: string | undefined;
}

function UploadSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSource("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedHeaders = results.meta.fields ?? [];
        setHeaders(parsedHeaders);
        setRows(results.data);
        setMapping(autoMapColumns(parsedHeaders));
      },
      error: (err) => {
        toast.error(`CSV parse failed: ${err.message}`);
      },
    });
  };

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  // Run our validation before submit so the user sees a count before they
  // commit. Light-touch — the bulkImportContacts function does the same
  // checks again server-side, this is just a UX preview.
  const stats = useMemo(() => {
    if (!mapping.email) return { valid: 0, invalid: 0, unique: 0 };
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    let valid = 0;
    let invalid = 0;
    for (const r of rows) {
      const e = (r[mapping.email!] ?? "").trim().toLowerCase();
      if (!emailRe.test(e)) {
        invalid++;
        continue;
      }
      if (!seen.has(e)) {
        seen.add(e);
        valid++;
      }
    }
    return { valid, invalid, unique: seen.size };
  }, [rows, mapping.email]);

  const handleImport = async () => {
    if (!mapping.email) {
      toast.error("Pick which CSV column has the email addresses");
      return;
    }
    setBusy(true);
    try {
      const inputs = rows.map((r) => ({
        email: (r[mapping.email!] ?? "").trim(),
        first_name: mapping.first_name ? r[mapping.first_name] : null,
        last_name: mapping.last_name ? r[mapping.last_name] : null,
        practice_name: mapping.practice_name ? r[mapping.practice_name] : null,
        phone: mapping.phone ? r[mapping.phone] : null,
      }));
      const result = await bulkImportContacts(inputs, source.trim() || null);
      if (result.error) {
        toast.error(`Import error: ${result.error}`);
      } else {
        toast.success(
          `Imported ${result.inserted} new · ${result.duplicates} already existed · ${result.invalid} invalid`
        );
        reset();
        onImported();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Upload contacts CSV</SheetTitle>
          <SheetDescription>
            First row should be column headers. Email is required; other fields are
            mapped automatically when their headers look familiar (you can override below).
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4 flex-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              CSV file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground mt-1">
                {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {headers.length > 0 && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Source (optional but recommended)
                </label>
                <Input
                  placeholder='e.g. "Dental conference Sept 2025", "BDA list", "Wayne import"'
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Stored on every imported contact. Helps you remember where your contacts came from.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  Column mapping
                </label>
                <div className="space-y-1.5">
                  {(["email", "first_name", "last_name", "practice_name", "phone"] as const).map((field) => (
                    <div key={field} className="flex items-center gap-2 text-sm">
                      <span className="w-32 text-muted-foreground">
                        {field.replace("_", " ")}
                        {field === "email" && <span className="text-red-500"> *</span>}
                      </span>
                      <Select
                        value={mapping[field] ?? "__none__"}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [field]: v === "__none__" ? null : v }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="min-w-[200px]">
                          <SelectItem value="__none__">— skip —</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-0.5">
                <p>
                  <span className="font-semibold">{stats.unique}</span> valid + unique emails ready to import
                </p>
                {stats.invalid > 0 && (
                  <p className="text-amber-700">
                    {stats.invalid} row{stats.invalid === 1 ? "" : "s"} will be skipped (invalid email format)
                  </p>
                )}
                <p className="text-muted-foreground">
                  Already-existing contacts in the database are kept as-is — their status and history are not touched.
                </p>
              </div>

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Preview (first 5 rows)
                  </p>
                  <div className="rounded-md border overflow-x-auto text-xs">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          {headers.map((h) => (
                            <th key={h} className="text-left px-2 py-1.5 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={i} className="border-t">
                            {headers.map((h) => (
                              <td key={h} className="px-2 py-1.5 truncate max-w-[140px]">
                                {r[h] || ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t pt-3 flex justify-end gap-2">
          {headers.length > 0 && (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Reset
            </Button>
          )}
          <Button onClick={handleImport} disabled={busy || !mapping.email || stats.unique === 0}>
            {busy ? "Importing..." : `Import ${stats.unique} contact${stats.unique === 1 ? "" : "s"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditContactSheet({
  contact,
  onClose,
  onSaved,
}: {
  contact: OutreachContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [targetRating, setTargetRating] = useState<string>("__none__");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Hydrate form whenever a different contact is selected.
  useEffect(() => {
    if (!contact) return;
    setFirstName(contact.first_name ?? "");
    setLastName(contact.last_name ?? "");
    setPracticeName(contact.practice_name ?? "");
    setPhone(contact.phone ?? "");
    setArea((contact.custom?.area as string) ?? "");
    setTargetRating(
      (contact.custom?.target_rating as string)?.toUpperCase() || "__none__"
    );
    setWebsite((contact.custom?.website as string) ?? "");
    setNotes(contact.notes ?? "");
  }, [contact?.id]);

  const handleSave = async () => {
    if (!contact) return;
    setBusy(true);
    try {
      // Merge into the existing custom jsonb so we don't clobber keys we
      // don't surface in this form (e.g. raw_notes from the import).
      const nextCustom = {
        ...(contact.custom ?? {}),
        area: area.trim() || null,
        target_rating: targetRating === "__none__" ? null : targetRating,
        website: website.trim() || null,
      };
      await updateContact(contact.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        practice_name: practiceName.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        custom: nextCustom,
      });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(contact)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit contact</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">
            {contact?.email}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 mt-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="first-name" className="text-xs">First name</Label>
              <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last-name" className="text-xs">Last name</Label>
              <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="practice-name" className="text-xs">Practice name</Label>
            <Input id="practice-name" value={practiceName} onChange={(e) => setPracticeName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="area" className="text-xs">Area</Label>
              <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Sheffield" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="target" className="text-xs">Target rating</Label>
              <Select value={targetRating} onValueChange={setTargetRating}>
                <SelectTrigger id="target" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— unrated —</SelectItem>
                  {TARGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="website" className="text-xs">Website</Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Free-form notes the rest of the team should see."
            />
          </div>
        </div>

        <div className="border-t pt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
