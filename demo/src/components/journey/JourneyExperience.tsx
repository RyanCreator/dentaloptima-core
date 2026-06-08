import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { practice } from "@/config/practice.config";
import { journeySteps, finalCta } from "./journeyData";
import { HeroSlider } from "./HeroSlider";
import { TrustBand } from "./TrustBand";
import { JourneySection } from "./JourneySection";

// The patient-journey landing experience: an auto-rotating hero slider, then a
// naturally-scrolling sequence of scroll-revealed sections. A sticky header
// fades from transparent (over the hero) to solid (once scrolled), a top
// progress bar tracks reading position, and a dot rail scroll-spies the
// sections.

const navItems = [
  { id: "hero", label: "Top" },
  ...journeySteps.map((s) => ({ id: s.id, label: s.stepLabel ?? s.kicker ?? s.title })),
  { id: finalCta.id, label: "Book" },
];

export function JourneyExperience() {
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState("hero");

  // Header goes solid once the hero is mostly scrolled past.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: highlight whichever section is crossing the viewport centre.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActiveId(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const item of navItems) {
      const el = document.getElementById(item.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  // Top reading-progress bar.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  const onDark = !scrolled; // header sits over the dark hero until scrolled

  return (
    <div className="relative">
      {/* Reading progress */}
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-0.5 origin-left bg-brand"
        style={{ scaleX: progress }}
      />

      {/* Sticky header */}
      <header
        className={cn(
          "fixed left-0 right-0 top-0 z-40 transition-colors duration-300",
          scrolled ? "border-b border-ink/10 bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75" : "bg-transparent",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            to="/"
            className={cn("font-display text-lg font-semibold tracking-tight transition-colors", onDark ? "text-white" : "text-ink")}
          >
            {practice.name}
          </Link>
          <Button asChild size="md" className="shadow-card">
            <Link to="/book">
              Book
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero slider */}
      <HeroSlider />

      {/* Social proof */}
      <TrustBand />

      {/* Anchor target for the hero's "Take the tour" / scroll cue */}
      <div id="journey-start" />

      {/* Scrolling journey */}
      {journeySteps.map((step, i) => (
        <JourneySection key={step.id} step={step} index={i} />
      ))}
      <JourneySection step={finalCta} index={journeySteps.length} />

      {/* Dot rail (scroll-spy) */}
      <nav
        aria-label="Sections"
        className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-3 sm:flex"
      >
        {navItems.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
              aria-label={`Go to ${item.label}`}
              aria-current={active}
              className="group flex items-center gap-2"
            >
              <span
                className={cn(
                  "hidden pr-1 text-xs font-medium opacity-0 -translate-x-1 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 sm:inline",
                  onDark ? "text-white" : "text-ink",
                )}
              >
                {item.label}
              </span>
              <span
                className={cn(
                  "block rounded-full transition-all duration-300",
                  active
                    ? "h-2.5 w-2.5 scale-110 bg-brand"
                    : cn("h-2 w-2 group-hover:scale-125", onDark ? "bg-white/40 group-hover:bg-white/70" : "bg-ink/25 group-hover:bg-ink/50"),
                )}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
