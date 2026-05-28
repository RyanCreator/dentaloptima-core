// Central registry of in-app guide videos. The TopBar help button reads
// this to decide which guides are relevant to the user's current page,
// and the /help index lists everything grouped by category.
//
// To add a new guide:
//   1. Record + upload to YouTube as Unlisted.
//   2. Grab the 11-char video ID from the URL (e.g. dQw4w9WgXcQ from
//      youtube.com/watch?v=dQw4w9WgXcQ).
//   3. Add an entry below with the routes it applies to. Set durationSeconds
//      so the list shows "3:42" next to the title.
//
// Route matching rules:
//   - "*"            applies to every page (e.g. a "Welcome" intro)
//   - "/patients"    exact match for /patients
//   - "/patients/*"  matches /patients and any subpath (e.g. /patients/123)
//
// We deliberately don't load this from the DB. Guides are platform-wide
// content owned by the Dentaloptima team, not per-practice — so shipping
// them with the app means we can add a guide without operators having to
// edit anything, and removing one is just a code change.

export type HelpCategory =
  | "Getting started"
  | "Dashboard"
  | "Calendar"
  | "Patients"
  | "Enquiries"
  | "Waiting list"
  | "Recalls"
  | "NHS claims"
  | "Governance"
  | "Staff"
  | "Settings";

export interface HelpGuide {
  /** Stable slug — used in /help#guideId deep-links and analytics. */
  id: string;
  /** Short, action-oriented title — what the viewer will be able to do after watching. */
  title: string;
  /** One-line description shown in the list. */
  description: string;
  /** 11-char YouTube video ID. Use Unlisted videos. */
  youtubeId: string;
  /** Optional duration in seconds. Shown as "m:ss" beside the title. */
  durationSeconds?: number;
  /** Section the guide is filed under on the /help index. */
  category: HelpCategory;
  /** Route patterns this guide applies to. See file-header docs. */
  routes: string[];
}

// Starts empty — populate as videos are recorded. Until the first guide
// lands, the help button still opens (showing an empty state on the page-
// specific list and routing the user to /help, which itself displays a
// "guides coming soon" message).
//
// Example shape, leave commented until you have a real video:
// {
//   id: "calendar-create-appointment",
//   title: "Book an appointment from the calendar",
//   description: "Click-to-pick slots, default duration, and how the smart defaults work.",
//   youtubeId: "abcdefghijk",
//   durationSeconds: 162,
//   category: "Calendar",
//   routes: ["/calendar", "/calendar/*"],
// },
export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "dashboard-overview",
    title: "Dashboard tour",
    description:
      "Stat cards, check-in flow, in-treatment / late / waiting buckets, and where the day's outstanding balances live.",
    youtubeId: "tvICEb3HE4g",
    category: "Dashboard",
    routes: ["/", "/dashboard"],
  },
  {
    id: "enquiries-overview",
    title: "Enquiries — review, book, waitlist or reject",
    description:
      "Working through the enquiries queue — open a request, use Smart Availability to find a slot, and book / waitlist / reject.",
    youtubeId: "635XX_l34pY",
    category: "Enquiries",
    routes: ["/enquiries", "/enquiries/*"],
  },
];

/**
 * Check whether a route pattern matches a given pathname.
 * Exported for testing and for the help index to filter by section.
 */
export function routeMatches(pattern: string, pathname: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return pathname === pattern;
}

/**
 * Guides relevant to a given pathname, in registry order. Most-specific
 * routes (exact paths) sort before wildcard catch-alls so the page-
 * specific guides float to the top of the list.
 */
export function getGuidesForRoute(pathname: string): HelpGuide[] {
  const matched = HELP_GUIDES.filter((g) =>
    g.routes.some((r) => routeMatches(r, pathname)),
  );
  return matched.sort((a, b) => {
    const aSpec = specificityScore(a, pathname);
    const bSpec = specificityScore(b, pathname);
    return bSpec - aSpec;
  });
}

/**
 * Higher score = more specific to this pathname. Used to surface page-
 * specific guides above app-wide ones.
 */
function specificityScore(guide: HelpGuide, pathname: string): number {
  let best = 0;
  for (const route of guide.routes) {
    if (route === "*") best = Math.max(best, 1);
    else if (route.endsWith("/*") && routeMatches(route, pathname)) best = Math.max(best, 2);
    else if (route === pathname) best = Math.max(best, 3);
  }
  return best;
}

/** Group guides by category for the /help index. */
export function groupGuidesByCategory(): Record<HelpCategory, HelpGuide[]> {
  const out = {} as Record<HelpCategory, HelpGuide[]>;
  for (const g of HELP_GUIDES) {
    if (!out[g.category]) out[g.category] = [];
    out[g.category].push(g);
  }
  return out;
}

/** Render a duration as "m:ss" — e.g. 162 → "2:42". */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Build the YouTube embed URL with sensible defaults — no related-video
 * spam at the end, no extra branding noise. Set `autoplay` when the user
 * has explicitly clicked into a specific guide.
 */
export function youtubeEmbedUrl(
  videoId: string,
  opts: { autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    ...(opts.autoplay ? { autoplay: "1" } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
