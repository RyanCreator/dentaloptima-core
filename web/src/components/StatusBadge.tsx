import { Badge, type BadgeVariant } from "@/components/Badge";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_TO_BADGE_VARIANT: Record<string, BadgeVariant> = {
  NEW: "new",
  VIEWED: "viewed",
  IN_PROGRESS: "viewed",
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
  NO_SHOW: "rejected",
  WAITLIST: "waitlist",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = STATUS_TO_BADGE_VARIANT[status] ?? "new";

  return (
    <Badge variant={variant} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
