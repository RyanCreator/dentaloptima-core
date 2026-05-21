import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// Shared empty-state component. Use everywhere a list/section is empty.
// Three jobs:
//   1. Tell the user what this thing IS
//   2. Tell them WHY it's empty
//   3. Give them an obvious next action (when one exists)
//
// Pages used to roll their own divs for this and they all drifted apart —
// some had icons, some didn't, button styles varied. Centralising here so
// "what does an empty list look like in this app?" has one answer.

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  /** One-line headline — say what's missing. e.g. "No patients yet" */
  title: string;
  /** Body explaining either why it's empty (filters) or how things get added. */
  body?: string;
  /** Primary action — usually the same as the page's "+ New" button. */
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
  /** Tighter padding for sub-section empty states (inside cards) vs main pages. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? "rounded-lg border border-dashed p-6 text-center"
          : "rounded-lg border border-dashed p-8 text-center"
      }
    >
      <Icon className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
      <p className="font-medium text-foreground">{title}</p>
      {body && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {body}
        </p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          variant="default"
          size="sm"
          className="mt-4"
        >
          {action.icon ? <action.icon className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
