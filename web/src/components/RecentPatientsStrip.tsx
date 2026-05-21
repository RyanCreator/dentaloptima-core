import { useNavigate } from "react-router-dom";
import { User } from "lucide-react";
import { useRecentPatients } from "@/hooks/useRecentPatients";

// Horizontal "recently viewed" strip. Hidden when empty — same rule as
// the dashboard governance card, no point in screen-space for zero items.
// Mounted above the calendar (and could later go above the patients list,
// dashboard, etc).

export function RecentPatientsStrip() {
  const navigate = useNavigate();
  const { recent } = useRecentPatients();

  if (recent.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card mb-4">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recently viewed
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto p-2 scrollbar-thin">
        {recent.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/patients/${p.id}`)}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-background hover:bg-accent transition-colors text-sm"
            title={`Open ${p.full_name}`}
          >
            <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium shrink-0">
              {initials(p.full_name)}
            </span>
            <span className="truncate max-w-[180px]">{p.full_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
