import { useState, type RefObject } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Insert a markdown-style link [label](url) at the textarea's cursor.
// The send-email edge function renders [label](url) into a real <a> tag in
// the outbound HTML body (and into "label (url)" for the plain-text body),
// so recipients see a clickable link — not the raw markdown.
//
// If the operator has text selected when they click "Add link", that text
// becomes the default label.

interface MarkdownLinkButtonProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function MarkdownLinkButton({
  textareaRef,
  value,
  onChange,
  disabled,
}: MarkdownLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);

  function openDialog() {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const selected = ta ? ta.value.slice(start, end) : "";
    setSelectionStart(start);
    setSelectionEnd(end);
    setLabel(selected);
    setUrl("");
    setOpen(true);
  }

  function handleInsert() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    // Auto-prefix https:// if the operator pasted a domain without one.
    const normalisedUrl = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;
    const linkText = (label.trim() || normalisedUrl);
    const markdown = `[${linkText}](${normalisedUrl})`;

    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    onChange(before + markdown + after);
    setOpen(false);

    // Restore focus and position the cursor right after the inserted link
    // so the operator can keep typing inline. setTimeout so React flushes
    // the value update before we touch the DOM selection.
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const pos = selectionStart + markdown.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={openDialog}
        disabled={disabled}
        className="h-7 px-2 text-xs"
        title="Insert a hyperlink"
      >
        <Link2 className="h-3.5 w-3.5 mr-1" />
        Add link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
            <DialogDescription>
              The recipient will see the label as a clickable link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="link-label" className="text-xs">Label (what they see)</Label>
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. website self test"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-url" className="text-xs">URL</Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://salonoptima.com/guides/..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) {
                    e.preventDefault();
                    handleInsert();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleInsert} disabled={!url.trim()}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
