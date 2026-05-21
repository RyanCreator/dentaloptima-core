import { ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { PlatformAnnouncementBanner } from "@/components/PlatformAnnouncementBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { useCommandPalette } from "@/hooks/useCommandPalette";

interface LayoutProps {
  children: ReactNode;
  title: string;
  // ReactNode (not string) so callers can drop in <GlossaryTerm /> and
  // other inline components — strings still work because string is a
  // ReactNode.
  description?: ReactNode;
  onBack?: () => void;
}

// Routes where we auto-collapse the main sidebar to icon-only on entry.
// Settings has its own left-rail, so leaving the main sidebar wide eats
// ~200px of horizontal space the forms could use. We only collapse on
// the *transition into* a matching route — once collapsed, the user can
// re-open it and navigating between settings sub-pages won't re-collapse.
const AUTO_COLLAPSE_PREFIXES = ["/settings"];

function shouldAutoCollapse(pathname: string): boolean {
  return AUTO_COLLAPSE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export const Layout = ({ children, title, description, onBack }: LayoutProps) => {
  const location = useLocation();
  const palette = useCommandPalette();
  // Controlled sidebar state — lets us collapse on settings entry while
  // still letting the user manually re-open via the SidebarTrigger.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 1024) return false;
    return !shouldAutoCollapse(window.location.pathname);
  });

  // Mobile detection — different default behaviour at <1024px.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024 && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarOpen]);

  // Auto-collapse on entry to settings (or any future auto-collapse route),
  // and auto-restore on exit. We only fire on the *transition* —
  // wasOnAutoCollapseRoute ref tracks the previous value so navigating
  // within /settings/* doesn't repeatedly collapse after the user manually
  // opened it. On leaving, we re-open only on desktop (≥1024px) so we
  // don't fight the mobile default of a hidden sidebar.
  const wasOnAutoCollapseRoute = useRef(shouldAutoCollapse(location.pathname));
  useEffect(() => {
    const now = shouldAutoCollapse(location.pathname);
    const was = wasOnAutoCollapseRoute.current;
    if (now && !was) {
      setSidebarOpen(false);
    } else if (!now && was && typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
    wasOnAutoCollapseRoute.current = now;
  }, [location.pathname]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title={title} description={description} onBack={onBack} />
          {/* `scrollbar-gutter: stable` reserves space for the scrollbar
              whether or not it's actually showing — so navigating between
              a short page (no scrollbar) and a tall page (scrollbar)
              doesn't shift the whole content area / Settings rail left
              by ~15px. Browsers that don't support it (very old Safari)
              fall back to the previous behaviour, no harm. */}
          <main
            className="flex-1 p-4 md:p-6 overflow-auto bg-muted/20"
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Platform-wide notices — sit at the top of every authed page.
                Component returns null when there's nothing live so it
                doesn't take up vertical space when quiet. */}
            <PlatformAnnouncementBanner />
            {children}
          </main>
        </div>
      </div>
      {/* Global command palette — bound to Cmd/Ctrl-K via useCommandPalette.
          Mounted at Layout level so every authed page gets it for free. */}
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </SidebarProvider>
  );
};
