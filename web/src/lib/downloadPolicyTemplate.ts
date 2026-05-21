import type { PolicyTemplate } from "@/lib/policyTemplates";

// Browser-side Word download. We don't pull in a docx library here —
// Microsoft Word reads HTML files with a `.doc` extension natively, which
// gives the practice an editable Word document without a 100+kb runtime
// dep. The output looks reasonable when opened (real headings, paragraphs,
// fonts) and edits cleanly. It's a known practical hack used by many web
// apps for ad-hoc Word exports.
//
// Practices who want a "proper" .docx can paste this into Word and Save
// As — the trade-off is intentional: smaller bundle, no breakage if we
// change the markdown-ish format later.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convert the in-app body (lightweight markdown-ish) to printable HTML. */
function bodyToHtml(body: string): string {
  // Split on blank lines so each block becomes its own paragraph / heading.
  // Same split as the PolicyContent renderer in PolicyDetail, so what you
  // see in the app matches what you get in Word.
  const blocks = body.split(/\n\s*\n/);
  return blocks
    .map((b) => {
      const trimmed = b.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("## ")) {
        return `<h2>${escapeHtml(trimmed.replace(/^##\s+/, ""))}</h2>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<h1>${escapeHtml(trimmed.replace(/^#\s+/, ""))}</h1>`;
      }
      // Preserve intra-paragraph line breaks. Word respects <br/> inside <p>.
      return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
}

export function downloadPolicyTemplateAsWord(template: PolicyTemplate): void {
  const safeName = template.title.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "policy";
  const filename = `${safeName}.doc`;

  // Office namespace declaration tells Word "this HTML is a Word document".
  // Without it, Word opens the file but warns about file extension. With
  // it, the warning goes away and Word treats it as native.
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"/><title>${escapeHtml(template.title)}</title>` +
    `<style>` +
    `body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #222; max-width: 800px; }` +
    `h1 { font-size: 18pt; margin-bottom: 4pt; }` +
    `h2 { font-size: 13pt; margin-top: 16pt; margin-bottom: 6pt; color: #1a1a1a; }` +
    `p { margin: 0 0 8pt 0; }` +
    `</style></head><body>` +
    `<h1>${escapeHtml(template.title)}</h1>` +
    bodyToHtml(template.body) +
    `</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Browser holds the blob alive until the URL is revoked. Wait a tick
  // so the download fires before we revoke it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
