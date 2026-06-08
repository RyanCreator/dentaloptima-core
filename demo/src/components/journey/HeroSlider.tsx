import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Star } from "lucide-react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { heroSlides, trust } from "./journeyData";
import { CtaLink } from "./CtaLink";
import { Grain } from "./Decor";

// Auto-rotating, layered hero slider — the Slider-Revolution-style opener.
// Each slide cross-fades while its brand-tinted background slowly Ken-Burns
// zooms, and text layers stagger in. A floating glass trust card adds depth +
// social proof. Autoplay pauses on hover/focus; reduced motion drops the
// zoom/fade/autoplay.

const AUTOPLAY_MS = 6500;

const layers: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } },
};
const layer: Variants = {
  hidden: { opacity: 0, y: 34 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export function HeroSlider() {
  const reduce = useReducedMotion();
  const slides = heroSlides;
  const [[index, dir], setFrame] = useState<[number, number]>([0, 0]);
  const pausedRef = useRef(false);
  const idxRef = useRef(0);
  useEffect(() => {
    idxRef.current = index;
  }, [index]);

  const go = useCallback(
    (next: number, d: number) => setFrame([(next + slides.length) % slides.length, d]),
    [slides.length],
  );
  const next = useCallback(() => go(idxRef.current + 1, 1), [go]);
  const prev = useCallback(() => go(idxRef.current - 1, -1), [go]);

  useEffect(() => {
    if (reduce || slides.length < 2) return;
    const t = window.setInterval(() => {
      if (!pausedRef.current) next();
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [reduce, slides.length, next]);

  const slide = slides[index];
  // Emphasise the final word of the headline in the display serif italic.
  const words = slide.title.split(" ");
  const lastWord = words.pop();

  return (
    <section
      id="hero"
      className="relative h-[100svh] min-h-[660px] w-full overflow-hidden bg-ink text-white"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
      aria-roledescription="carousel"
    >
      {/* Background slides: brand-tinted photo + Ken-Burns */}
      <AnimatePresence initial={false} custom={dir} mode="sync">
        <motion.div
          key={slide.id}
          className="absolute inset-0"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: reduce ? 1 : 0 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        >
          <motion.img
            src={slide.image}
            alt={slide.imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
            initial={reduce ? undefined : { scale: 1.05 }}
            animate={reduce ? undefined : { scale: 1.18 }}
            transition={{ duration: AUTOPLAY_MS / 1000 + 1.5, ease: "linear" }}
            decoding="async"
          />
          {/* Brand tint (cohesive look) + readability gradient */}
          <div
            className="absolute inset-0 mix-blend-multiply"
            style={{ background: "linear-gradient(120deg, rgb(var(--brand) / 0.45) 0%, transparent 60%)" }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(110deg, rgb(7 12 20 / 0.86) 0%, rgb(7 12 20 / 0.55) 45%, rgb(7 12 20 / 0.2) 100%)" }}
            aria-hidden
          />
        </motion.div>
      </AnimatePresence>

      <Grain />

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-6xl items-center px-6 sm:px-8">
        <motion.div key={slide.id} variants={layers} initial="hidden" animate="show" className="max-w-2xl">
          <motion.div variants={layer} className="mb-5 flex items-center gap-3">
            <span className="h-px w-8 bg-accent" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/85">{slide.kicker}</span>
          </motion.div>
          <motion.h1
            variants={layer}
            className="font-display text-[2.6rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
          >
            {words.join(" ")}{" "}
            <span className="italic text-brand-soft">{lastWord}</span>
          </motion.h1>
          <motion.p variants={layer} className="mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            {slide.sub}
          </motion.p>
          <motion.div variants={layer} className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="shadow-hero">
              <CtaLink to={slide.primaryCta.to}>
                {slide.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </CtaLink>
            </Button>
            {slide.secondaryCta && (
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="border-white/25 bg-white/10 text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/20 hover:text-white"
              >
                <CtaLink to={slide.secondaryCta.to}>{slide.secondaryCta.label}</CtaLink>
              </Button>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Floating glass trust card */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-24 right-8 z-10 hidden w-64 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md lg:block"
      >
        <div className="flex items-center gap-1 text-accent">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current" />
          ))}
          <span className="ml-1.5 text-sm font-semibold text-white">{trust.rating}</span>
        </div>
        <p className="mt-2 text-xs text-white/75">{trust.ratingLabel}</p>
        <div className="mt-3 flex -space-x-2">
          {trust.avatars.map((a) => (
            <img key={a} src={a} alt="" className="h-8 w-8 rounded-full border-2 border-white/30 object-cover" />
          ))}
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 bg-brand text-[10px] font-semibold text-brand-fg">
            +
          </span>
        </div>
      </motion.div>

      {/* Arrows */}
      {slides.length > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 z-20 hidden items-center justify-between px-4 sm:flex">
          <SliderArrow side="left" onClick={prev} />
          <SliderArrow side="right" onClick={next} />
        </div>
      )}

      {/* Dots + autoplay progress */}
      {slides.length > 1 && (
        <div className="absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i, i > index ? 1 : -1)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className="relative h-2.5 overflow-hidden rounded-full bg-white/30 transition-all"
              style={{ width: i === index ? 44 : 10 }}
            >
              {i === index && !reduce && (
                <motion.span
                  key={`p-${index}`}
                  className="absolute inset-0 origin-left bg-white"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                />
              )}
              {i === index && reduce && <span className="absolute inset-0 bg-white" />}
            </button>
          ))}
        </div>
      )}

      {/* Scroll cue */}
      {!reduce && (
        <motion.a
          href="#journey-start"
          className="absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/60 hover:text-white sm:flex"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          aria-label="Scroll to the patient journey"
        >
          <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown className="h-5 w-5" />
        </motion.a>
      )}
    </section>
  );
}

function SliderArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/20 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/40",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
