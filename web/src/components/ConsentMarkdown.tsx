import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Shared markdown renderer for consent bodies. Used by:
//   - The kiosk signing surface — patient sees the rendered text.
//   - The editor preview pane — author sees exactly what the kiosk
//     will display.
// Keeping one component prevents "looks good in editor, broken on kiosk"
// drift and makes typography uniform across the consent flow.
//
// react-markdown handles the parsing; the component classes here set
// the prose-style spacing so the rendered output reads like the legal
// document it is, not a tweet.

export function ConsentMarkdown({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Approximation of @tailwindcss/typography "prose" without the
        // dependency. Targets the elements react-markdown emits.
        "text-sm leading-relaxed",
        "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1",
        "[&_p]:mb-2",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ul]:space-y-0.5",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ol]:space-y-0.5",
        "[&_li]:leading-relaxed",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-amber-400 [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:bg-amber-50/40 dark:[&_blockquote]:bg-amber-950/20 [&_blockquote]:my-2 [&_blockquote]:text-amber-900 dark:[&_blockquote]:text-amber-100",
        "[&_a]:text-primary [&_a]:underline",
        "[&_code]:text-xs [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
