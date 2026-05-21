import { useMemo, useState, type RefObject } from "react";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOutreachTemplates } from "@/hooks/useOutreachTemplates";

// Insert an outreach template into the compose/reply form. The template's
// body is inserted at the textarea cursor (so the operator can place it
// inline with whatever they've already typed). If a subject setter is
// provided and the current subject is empty, the template subject fills it.
//
// Templates often contain {first_name} / {salon_name} variables — those
// stay as-is (no contact context here), so the operator needs to hand-fill
// them. We surface a small hint when the selected template has variables.

interface TemplatePickerButtonProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  bodyValue: string;
  onBodyChange: (next: string) => void;
  // Optional subject hookup. When omitted (reply form), only the body is
  // affected — the thread's subject stays locked.
  subject?: string;
  onSubjectChange?: (next: string) => void;
  disabled?: boolean;
}

const PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/g;

export function TemplatePickerButton({
  textareaRef,
  bodyValue,
  onBodyChange,
  subject,
  onSubjectChange,
  disabled,
}: TemplatePickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { templates, loading } = useOutreachTemplates();

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.body_text.toLowerCase().includes(q),
    );
  }, [templates, search]);

  function applyTemplate(t: { subject: string; body_text: string }) {
    // Subject: only set if the caller supports it AND the current subject
    // is empty. Otherwise the operator may have already typed something
    // they want to keep.
    if (onSubjectChange && subject !== undefined && subject.trim() === "") {
      onSubjectChange(t.subject);
    }

    // Body: insert at the cursor. With an empty body the cursor is at 0,
    // so this effectively replaces the whole field — but if they've
    // typed a greeting first, the template lands wherever they left off.
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? bodyValue.length;
    const end = ta?.selectionEnd ?? bodyValue.length;
    const before = bodyValue.slice(0, start);
    const after = bodyValue.slice(end);
    const next = before + t.body_text + after;
    onBodyChange(next);

    setOpen(false);
    setSearch("");

    setTimeout(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + t.body_text.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="h-7 px-2 text-xs"
        title="Insert a saved template"
      >
        <FileText className="h-3.5 w-3.5 mr-1" />
        Use template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Insert template</DialogTitle>
            <DialogDescription>
              Picks up where your cursor is. Variables like <code>{"{first_name}"}</code> stay
              in the body — fill them in by hand before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto -mx-2 px-2">
            {loading && (
              <p className="text-xs text-muted-foreground py-6 text-center">Loading templates…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {templates.length === 0
                  ? "No templates yet — create one in /outreach/templates."
                  : "No matches."}
              </p>
            )}
            <ul className="space-y-1">
              {filtered.map((t) => {
                const placeholders = Array.from(
                  new Set(t.body_text.match(PLACEHOLDER_RE) ?? []),
                );
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left rounded-md border border-transparent hover:border-border hover:bg-accent px-3 py-2 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        {placeholders.length > 0 && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded shrink-0">
                            {placeholders.length} var{placeholders.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {t.description}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground italic truncate mt-0.5">
                        {t.subject}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
