import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { PageLoading } from "@/components/PageLoading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDuration,
  groupGuidesByCategory,
  HELP_GUIDES,
  type HelpCategory,
  type HelpGuide,
  youtubeEmbedUrl,
} from "@/lib/helpGuides";
import { PlayCircle, Search, HelpCircle, BookOpen } from "lucide-react";

// /help — full guide library, grouped by section. Direct-link to a guide
// via /help#guideId so we can deep-link from emails, release notes, or
// the in-page help button's "Browse all guides" affordance.
//
// Empty state when no guides have been registered yet — we don't want
// the page to look broken before the first video lands.

// Ordering for the category list. Anything missing from this list still
// renders, just at the end in registry order.
const CATEGORY_ORDER: HelpCategory[] = [
  "Getting started",
  "Dashboard",
  "Calendar",
  "Patients",
  "Enquiries",
  "Waiting list",
  "Recalls",
  "NHS claims",
  "Governance",
  "Staff",
  "Settings",
];

export default function HelpIndex() {
  const { loading } = useRequireAuth();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  // Hash deep-link: /help#guide-id opens the player straight on that guide.
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return;
    if (HELP_GUIDES.some((g) => g.id === hash)) setActiveGuideId(hash);
  }, [location.hash]);

  const groups = useMemo(() => groupGuidesByCategory(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const out: Partial<Record<HelpCategory, HelpGuide[]>> = {};
    for (const [cat, list] of Object.entries(groups) as [
      HelpCategory,
      HelpGuide[],
    ][]) {
      const matches = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q),
      );
      if (matches.length > 0) out[cat] = matches;
    }
    return out as Record<HelpCategory, HelpGuide[]>;
  }, [groups, query]);

  const orderedCategories = useMemo(() => {
    const present = Object.keys(filtered) as HelpCategory[];
    const ordered = CATEGORY_ORDER.filter((c) => present.includes(c));
    const leftover = present.filter((c) => !CATEGORY_ORDER.includes(c));
    return [...ordered, ...leftover];
  }, [filtered]);

  const activeGuide = activeGuideId
    ? HELP_GUIDES.find((g) => g.id === activeGuideId) ?? null
    : null;

  if (loading) {
    return (
      <Layout title="Help & guides">
        <PageLoading />
      </Layout>
    );
  }

  const totalGuides = HELP_GUIDES.length;

  return (
    <Layout
      title="Help & guides"
      description="Short videos walking you through each part of Dentaloptima."
    >
      <div className="space-y-6">
        {totalGuides === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Guides coming soon"
            body="We're building out a library of short walk-throughs for every part of Dentaloptima. They'll appear here as they go live — and the ? button at the top of each page will surface the relevant ones in context."
          />
        ) : (
          <>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guides..."
                className="pl-9"
              />
            </div>

            {orderedCategories.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No guides match your search"
                body="Try a different keyword or browse by category."
              />
            ) : (
              <div className="space-y-8">
                {orderedCategories.map((category) => (
                  <section key={category}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      {category}
                    </h2>
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filtered[category]!.map((g) => (
                        <GuideCard
                          key={g.id}
                          guide={g}
                          onPlay={() => setActiveGuideId(g.id)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Player dialog — same iframe-with-noise-suppressed pattern as the
          inline help button. */}
      <Dialog
        open={!!activeGuide}
        onOpenChange={(o) => {
          if (!o) setActiveGuideId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {activeGuide && (
            <>
              <DialogHeader>
                <DialogTitle>{activeGuide.title}</DialogTitle>
                {activeGuide.description && (
                  <p className="text-sm text-muted-foreground">
                    {activeGuide.description}
                  </p>
                )}
              </DialogHeader>
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                <iframe
                  src={youtubeEmbedUrl(activeGuide.youtubeId, { autoplay: true })}
                  title={activeGuide.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function GuideCard({
  guide,
  onPlay,
}: {
  guide: HelpGuide;
  onPlay: () => void;
}) {
  return (
    <li>
      <button
        onClick={onPlay}
        className="w-full h-full flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-muted/40 hover:border-primary/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary shrink-0" />
          <span className="font-medium text-sm flex-1 min-w-0 truncate">
            {guide.title}
          </span>
          {guide.durationSeconds && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatDuration(guide.durationSeconds)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-3">
          {guide.description}
        </p>
      </button>
    </li>
  );
}
