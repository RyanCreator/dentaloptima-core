import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { practice } from "@/config/practice.config";
import { Button } from "@/components/Button";
import { useMaybePractice } from "@/contexts/PracticeContext";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export function Header() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // CTA copy adapts to whether the practice has online booking. Header
  // renders inside PracticeBootstrap so the resolved tenant is normally
  // available; if not (e.g. during very early boot) we fall back to the
  // generic "Book now" label.
  const tenant = useMaybePractice();
  const ctaLabel = tenant && !tenant.practice.booking_app_enabled ? "Enquire" : "Book now";

  // Solid background after scrolling past the hero. On non-home pages,
  // always solid to keep text readable against any content.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close mobile menu AND reset scrolled state on route change. Without the
  // reset, going from a scrolled inner page back to the homepage briefly
  // shows the solid "scrolled" header flashing over the hero before the
  // ScrollToTop-triggered onScroll fires, producing a visible white line.
  useEffect(() => {
    setMobileOpen(false);
    setScrolled(window.scrollY > 20);
  }, [location.pathname]);

  const transparent = isHome && !scrolled;

  return (
    <>
      <header
        className={cn(
          // Border stays in the class list at all times — we animate its
          // colour between transparent and ink/5 instead of adding/removing
          // the class. That avoids a 1-frame flash where the border snaps
          // off and leaves a visible horizontal line during the transition.
          "fixed top-0 inset-x-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          transparent
            ? "bg-transparent border-transparent backdrop-blur-0"
            : "bg-white/90 backdrop-blur-md border-ink/5"
        )}
      >
        <div className="container max-w-[1400px] mx-auto flex items-center justify-between py-3 md:py-4">
          <Link
            to="/"
            className="flex items-center gap-2"
            aria-label={`${practice.name} — home`}
          >
            <img
              src={
                transparent
                  ? practice.branding.logoUrl
                  : practice.branding.logoDarkUrl || practice.branding.logoUrl
              }
              alt={practice.name}
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "link-underline px-3 py-2 text-sm font-medium transition-colors",
                    transparent
                      ? "text-white/90 hover:text-white"
                      : "text-ink/75 hover:text-ink",
                    isActive && (transparent ? "text-white" : "text-ink")
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Button asChild size="md" className="ml-3">
              <Link to="/book">{ctaLabel}</Link>
            </Button>
          </nav>

          <button
            type="button"
            className={cn(
              "md:hidden p-2 rounded-lg transition-colors",
              transparent
                ? "text-white hover:bg-white/10"
                : "text-ink hover:bg-ink/5"
            )}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile slide-over */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-30 transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="absolute inset-0 bg-white" />
        <div className="relative h-full flex flex-col items-center justify-center gap-3 px-6 pt-16">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "w-full max-w-sm text-center py-4 rounded-xl text-xl font-medium transition-colors",
                  isActive
                    ? "bg-brand/10 text-brand"
                    : "text-ink hover:bg-ink/5"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Button asChild size="lg" className="w-full max-w-sm mt-4">
            <Link to="/book">Book now</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
