import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, PlayCircle, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatDuration,
  getGuidesForRoute,
  type HelpGuide,
  youtubeEmbedUrl,
} from "@/lib/helpGuides";

// The "?" affordance shown in the TopBar on every page. Two modes:
//
//   1. Picker  — opens with a list of guides relevant to the current
//                page. User clicks one to expand the player.
//   2. Player  — embedded YouTube iframe (16:9), with a "back to list"
//                button so the user can flip between guides without
//                closing the dialog.
//
// The button is always visible (per our chosen UX), even when no guides
// are registered for the current route. The empty state nudges the user
// to the /help index so they can browse what's available.

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const guides = useMemo(
    () => getGuidesForRoute(location.pathname),
    [location.pathname],
  );

  const activeGuide = useMemo(
    () => guides.find((g) => g.id === activeGuideId) ?? null,
    [guides, activeGuideId],
  );

  // Reset to list view whenever the dialog reopens — feels weird to
  // come back into the picker mid-video next time.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setActiveGuideId(null);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label="View guides for this page"
            className="h-8 w-8 p-0"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {guides.length > 0
            ? `View guides (${guides.length} for this page)`
            : "Help & guides"}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Width sized for a 16:9 video at a comfortable viewing size on a
            laptop. max-h prevents the dialog from running off-screen on
            small displays. */}
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {activeGuide ? (
            <PlayerView
              guide={activeGuide}
              onBack={() => setActiveGuideId(null)}
              onClose={() => handleOpenChange(false)}
              hasMultiple={guides.length > 1}
            />
          ) : (
            <ListView
              guides={guides}
              onPick={(id) => setActiveGuideId(id)}
              onSeeAll={() => {
                handleOpenChange(false);
                navigate("/help");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ─── List view ───────────────────────────────────────────────────────

function ListView({
  guides,
  onPick,
  onSeeAll,
}: {
  guides: HelpGuide[];
  onPick: (id: string) => void;
  onSeeAll: () => void;
}) {
  if (guides.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Help & guides</DialogTitle>
          <DialogDescription>
            We don't have a guide for this page just yet — the full library
            covers every section of the app.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-6 text-center">
          <HelpCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">No guides for this page yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            More are being added all the time. Browse the full library to find
            what you need.
          </p>
          <Button className="mt-4" onClick={onSeeAll} size="sm">
            Browse all guides
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Guides for this page</DialogTitle>
        <DialogDescription>
          Short walk-throughs of how this section works. Click one to play.
        </DialogDescription>
      </DialogHeader>

      <ul className="space-y-2 mt-2">
        {guides.map((g) => (
          <li key={g.id}>
            <button
              onClick={() => onPick(g.id)}
              className="w-full flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors text-left"
            >
              <PlayCircle className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm truncate">
                    {g.title}
                  </span>
                  {g.durationSeconds && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatDuration(g.durationSeconds)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {g.description}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="pt-2 border-t flex justify-end">
        <Button variant="ghost" size="sm" onClick={onSeeAll}>
          Browse all guides
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </>
  );
}

// ─── Player view ─────────────────────────────────────────────────────

function PlayerView({
  guide,
  onBack,
  onClose,
  hasMultiple,
}: {
  guide: HelpGuide;
  onBack: () => void;
  onClose: () => void;
  hasMultiple: boolean;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{guide.title}</DialogTitle>
        {guide.description && (
          <DialogDescription>{guide.description}</DialogDescription>
        )}
      </DialogHeader>

      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
        <iframe
          src={youtubeEmbedUrl(guide.youtubeId, { autoplay: true })}
          title={guide.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        {hasMultiple ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowRight className="h-3.5 w-3.5 mr-1.5 rotate-180" />
            Other guides for this page
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Close
        </Button>
      </div>
    </>
  );
}
