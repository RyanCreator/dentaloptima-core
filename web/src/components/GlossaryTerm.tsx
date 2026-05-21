import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY } from "@/lib/glossary";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// Inline jargon term. Wraps the trigger text in a dotted underline + help
// cursor; clicking opens a popover with the definition + a "Full glossary"
// link to /glossary. Popover (not Tooltip) so tap-to-open works on iPads
// — Tooltip's hover-on-touch behaviour is unreliable.
//
// Usage:
//   <GlossaryTerm term="UDA" />                  // renders "UDA"
//   <GlossaryTerm term="FP17">FP17 claims</GlossaryTerm>  // renders "FP17 claims"
//
// Falls back to plain text if the term isn't in the glossary, so a typo
// in `term` never breaks the page.

interface GlossaryTermProps {
  term: keyof typeof GLOSSARY | string;
  children?: React.ReactNode;
  className?: string;
}

export function GlossaryTerm({ term, children, className }: GlossaryTermProps) {
  const navigate = useNavigate();
  const entry = GLOSSARY[term as keyof typeof GLOSSARY];
  const displayText = children ?? term;

  // Unknown terms render as plain text — no broken affordances if the
  // dictionary doesn't have a definition yet.
  if (!entry) return <span className={className}>{displayText}</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 cursor-help",
            "hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
            className,
          )}
        >
          {displayText}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="font-semibold mb-1">{entry.title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{entry.body}</p>
        <button
          type="button"
          onClick={() => navigate("/glossary")}
          className="text-xs text-primary hover:underline mt-2 inline-block"
        >
          Full glossary →
        </button>
      </PopoverContent>
    </Popover>
  );
}
