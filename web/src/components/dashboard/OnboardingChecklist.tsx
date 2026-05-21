import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";

// First-run guide for new practices. Hidden once every relevant step is
// done — we don't want an evergreen "you finished setup!" reminder. The
// completion threshold is per-step; when outstanding hits zero the whole
// card just disappears.

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const { items, outstanding, loaded } = useOnboardingChecklist();

  // Don't render until we know — avoids a flash of "you have setup work to
  // do" on a fully-configured practice during the first round-trip.
  if (!loaded) return null;
  if (outstanding.length === 0) return null;

  const total = items.length;
  const done = total - outstanding.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="mb-6 rounded-lg border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Rocket className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Get your practice ready</h2>
            <p className="text-xs text-muted-foreground">
              {done} of {total} steps complete · {outstanding.length} to go
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{percent}%</span>
        </div>
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const Icon = item.done ? CheckCircle2 : Circle;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.href)}
              disabled={item.done}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                item.done
                  ? "bg-muted/20 cursor-default"
                  : "hover:bg-muted/40",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  item.done ? "text-green-600" : "text-muted-foreground",
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    item.done && "line-through text-muted-foreground",
                  )}
                >
                  {item.label}
                </p>
                {!item.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
              {!item.done && (
                <span className="inline-flex items-center gap-1 text-xs text-primary shrink-0">
                  Set up <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
