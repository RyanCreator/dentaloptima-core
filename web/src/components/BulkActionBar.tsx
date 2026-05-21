import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "X selected" action bar. Renders sticky at the bottom of the
// viewport so it stays visible while the user scrolls through the list.
// Hidden when count === 0 — no screen real-estate burn when idle.
//
// Action shape is a tagged record so callers express intent declaratively
// rather than wiring buttons themselves. The bar handles disabled state
// during in-flight work via the `busy` flag.

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "outline" | "destructive" | "ghost";
  onClick: () => void;
}

interface BulkActionBarProps {
  count: number;
  /** Plural noun for the action bar — "recalls", "claims", "patients". */
  noun?: string;
  actions: BulkAction[];
  onClear: () => void;
  /** Disables every action button. Use while a bulk mutation is in flight. */
  busy?: boolean;
}

export function BulkActionBar({ count, noun = "items", actions, onClear, busy }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pointer-events-none",
        "flex justify-center",
      )}
    >
      <div className="pointer-events-auto rounded-full border bg-card shadow-lg px-3 py-2 flex items-center gap-2 max-w-full overflow-x-auto">
        <span className="text-sm font-medium tabular-nums whitespace-nowrap px-2">
          {count} {noun}
        </span>
        <span className="h-5 w-px bg-border shrink-0" />
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.key}
              variant={a.variant ?? "outline"}
              size="sm"
              onClick={a.onClick}
              disabled={busy}
              className="h-8 text-xs shrink-0"
            >
              {Icon && <Icon className="h-3.5 w-3.5 mr-1" />}
              {a.label}
            </Button>
          );
        })}
        <span className="h-5 w-px bg-border shrink-0" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={busy}
          className="h-8 text-xs text-muted-foreground shrink-0"
        >
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}
