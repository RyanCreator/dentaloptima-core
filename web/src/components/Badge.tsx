import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "new"
  | "viewed"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "waitlist"
  | "scheduled"
  | "completed"
  | "no_show";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const badgeStyles: Record<BadgeVariant, string> = {
  new: "bg-[hsl(var(--status-new))] text-white",
  viewed: "bg-[hsl(var(--status-viewed))] text-white",
  confirmed: "bg-[hsl(var(--status-confirmed))] text-white",
  rejected: "bg-red-600 text-white",
  cancelled: "bg-red-600 text-white",
  waitlist: "bg-[hsl(var(--status-waitlist))] text-white",
  scheduled: "bg-blue-600 text-white",
  completed: "bg-green-600 text-white",
  no_show: "bg-amber-600 text-white",
};

export const Badge = ({ variant, children, className }: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        badgeStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

// Helper function to get badge variant from appointment status
export const getAppointmentBadgeVariant = (status: string): BadgeVariant => {
  const statusLower = status.toLowerCase();
  if (statusLower === "scheduled") return "scheduled";
  if (statusLower === "completed") return "completed";
  if (statusLower === "cancelled") return "cancelled";
  if (statusLower === "no_show") return "no_show";
  if (statusLower === "rejected") return "rejected";
  return "scheduled"; // default fallback
};