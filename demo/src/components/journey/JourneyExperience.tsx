import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { practice } from "@/config/practice.config";
import { journeySteps } from "./journeyData";
import { JourneyPanel } from "./JourneyPanel";

// Full-page "patient journey" experience. Each step is a full screen; scroll,
// arrow keys, swipe, or the dot rail trigger one cinematic transition to the
// next panel (à la fullPage.js / Slider Revolution). When the visitor prefers
// reduced motion we fall back to a normal, accessible snap-scroll page.

const TRANSITION_MS = 850;

const slide: Variants = {
  enter: (dir: number) => ({ y: dir >= 0 ? "100%" : "-100%" }),
  center: { y: 0 },
  exit: (dir: number) => ({ y: dir >= 0 ? "-100%" : "100%" }),
};

export function JourneyExperience() {
  const reduce = useReducedMotion();
  const steps = journeySteps;
  const [[index, direction], setFrame] = useState<[number, number]>([0, 0]);

  const indexRef = useRef(0);
  const lockRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const lock = useCallback(() => {
    lockRef.current = true;
    window.setTimeout(() => {
      lockRef.current = false;
    }, TRANSITION_MS);
  }, []);

  const paginate = useCallback(
    (dir: number) => {
      if (lockRef.current) return;
      const next = indexRef.current + dir;
      if (next < 0 || next >= steps.length) return;
      indexRef.current = next;
      setFrame([next, dir]);
      lock();
    },
    [steps.length, lock],
  );

  const jumpTo = useCallback(
    (target: number) => {
      if (target === indexRef.current || target < 0 || target >= steps.length) return;
      const dir = target > indexRef.current ? 1 : -1;
      indexRef.current = target;
      setFrame([target, dir]);
      lock();
    },
    [steps.length, lock],
  );

  // Input handling — only when we're driving the cinematic transitions.
  useEffect(() => {
    if (reduce) return;
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 8) return;
      paginate(e.deltaY > 0 ? 1 : -1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        paginate(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        paginate(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        jumpTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        jumpTo(steps.length - 1);
      }
    };
    // "Take the tour" and similar in-page anchors advance the journey.
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest?.('a[href="#start"]');
      if (anchor) {
        e.preventDefault();
        paginate(1);
      }
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dy = touchY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) paginate(dy > 0 ? 1 : -1);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("click", onClick);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("click", onClick);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [reduce, paginate, jumpTo, steps.length]);

  const current = steps[index];
  const onDark = current.theme === "dark" || current.theme === "brand";

  // ---- Reduced-motion / accessible fallback: native snap scroll ----
  if (reduce) {
    return (
      <div className="h-screen overflow-y-auto snap-y snap-mandatory">
        <Chrome onDark steps={steps} index={0} onJump={() => {}} hideRail />
        {steps.map((step, i) => (
          <section
            key={step.id}
            id={i === 1 ? "start" : undefined}
            className="snap-start h-screen"
          >
            <JourneyPanel step={step} inViewMode isLast={i === steps.length - 1} />
          </section>
        ))}
      </div>
    );
  }

  // ---- Cinematic full-page transitions ----
  return (
    <div ref={containerRef} className="fixed inset-0 h-[100svh] w-full overflow-hidden bg-ink touch-none">
      <Chrome onDark={onDark} steps={steps} index={index} onJump={jumpTo} />

      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={index}
          custom={direction}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: TRANSITION_MS / 1000, ease: [0.83, 0, 0.17, 1] }}
          className="absolute inset-0"
        >
          <JourneyPanel step={current} active isLast={index === steps.length - 1} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Fixed UI that sits above the panels: top bar (brand + book), progress line,
// dot rail, and step counter. Colours adapt to the current panel's theme.
function Chrome({
  onDark,
  steps,
  index,
  onJump,
  hideRail = false,
}: {
  onDark: boolean;
  steps: typeof journeySteps;
  index: number;
  onJump: (i: number) => void;
  hideRail?: boolean;
}) {
  const fg = onDark ? "text-white" : "text-ink";
  return (
    <>
      {/* Progress line */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-black/10">
        <motion.div
          className="h-full bg-brand"
          animate={{ width: `${((index + 1) / steps.length) * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 px-5 sm:px-8 py-4 flex items-center justify-between">
        <Link to="/" className={cn("font-display text-lg font-semibold tracking-tight transition-colors", fg)}>
          {practice.name}
        </Link>
        <Button asChild size="md" className="shadow-card">
          <Link to="/book">
            Book
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Step counter */}
      <div className={cn("fixed bottom-6 left-5 sm:left-8 z-50 font-display text-sm tabular-nums transition-colors", fg)}>
        <span className="text-brand">{String(index + 1).padStart(2, "0")}</span>
        <span className="opacity-50"> / {String(steps.length).padStart(2, "0")}</span>
      </div>

      {/* Dot rail */}
      {!hideRail && (
        <nav
          aria-label="Journey steps"
          className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-3"
        >
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => onJump(i)}
              aria-label={`Go to: ${step.title}`}
              aria-current={i === index}
              className="group flex items-center gap-2"
            >
              <span
                className={cn(
                  "text-xs font-medium pr-1 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 hidden sm:inline",
                  onDark ? "text-white" : "text-ink",
                )}
              >
                {step.stepLabel ?? step.kicker}
              </span>
              <span
                className={cn(
                  "block rounded-full transition-all duration-300",
                  i === index
                    ? "h-2.5 w-2.5 bg-brand scale-110"
                    : cn("h-2 w-2 group-hover:scale-125", onDark ? "bg-white/40 group-hover:bg-white/70" : "bg-ink/25 group-hover:bg-ink/50"),
                )}
              />
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
