import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { CtaLink } from "./CtaLink";
import { Orbs, DotGrid, Grain, Tinted } from "./Decor";
import { BeforeAfter } from "./BeforeAfter";
import { beforeAfter, type JourneyStep, type SectionTheme } from "./journeyData";

// A scroll-revealed journey section with real visual craft: a giant watermark
// numeral, decorative orbs/dot-grid, layered image cards (offset accent panel +
// brand tint + floating stat badge), and parallax. Content layers stagger in as
// the section enters; reduced motion drops the transforms.

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const up: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};
const fromSide = (x: number): Variants => ({
  hidden: { opacity: 0, x },
  show: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
});

const themeText: Record<SectionTheme, string> = {
  dark: "text-white",
  brand: "text-brand-fg",
  light: "text-ink",
  soft: "text-ink",
};
const viewport = { once: true, amount: 0.3 } as const;

interface Props {
  step: JourneyStep;
  index: number;
}

export function JourneySection({ step, index }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yRaw = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const y = reduce ? 0 : yRaw;

  const isDark = step.theme === "dark" || step.theme === "brand";
  const reversed = index % 2 === 1;

  // ---- Final CTA ----
  if (step.layout === "final") {
    return (
      <section
        ref={ref}
        id={step.id}
        className={cn("relative flex min-h-[80svh] items-center overflow-hidden py-24", themeText[step.theme])}
        style={{ background: "linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--accent)) 100%)" }}
      >
        <Grain />
        <div className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-[90px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-10 h-96 w-96 rounded-full bg-black/10 blur-[100px]" aria-hidden />
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center"
        >
          {step.kicker && (
            <motion.p variants={up} className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
              {step.kicker}
            </motion.p>
          )}
          <motion.h2 variants={up} className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            {step.title}
          </motion.h2>
          <motion.p variants={up} className="max-w-xl text-base leading-relaxed text-white/85 md:text-lg">
            {step.body}
          </motion.p>
          <motion.div variants={up}>
            <Actions step={step} dark />
          </motion.div>
        </motion.div>
      </section>
    );
  }

  // ---- Showcase / results (dark + before-after) ----
  if (step.layout === "showcase") {
    return (
      <section ref={ref} id={step.id} className="relative flex min-h-screen items-center overflow-hidden bg-ink py-24 text-white">
        <Orbs />
        <Grain />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 sm:px-8 md:grid-cols-2">
          <motion.div variants={container} initial="hidden" whileInView="show" viewport={viewport} className="flex flex-col gap-6">
            <Eyebrow step={step} variants={fromSide(-40)} dark />
            <motion.h2 variants={fromSide(-40)} className="font-display text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
              {step.title}
            </motion.h2>
            <motion.p variants={up} className="max-w-lg text-base leading-relaxed text-white/80 md:text-lg">
              {step.body}
            </motion.p>
            {step.stat && (
              <motion.div variants={up} className="flex items-center gap-3">
                <span className="font-display text-4xl font-semibold">{step.stat.value}</span>
                <span className="text-sm text-white/65">{step.stat.label}</span>
              </motion.div>
            )}
            <motion.p variants={up} className="text-xs text-white/45">Drag the slider to reveal the difference</motion.p>
          </motion.div>
          <motion.div
            style={{ y }}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewport}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <BeforeAfter image={beforeAfter.image} alt={beforeAfter.alt} />
          </motion.div>
        </div>
      </section>
    );
  }

  // ---- Split (default) ----
  const Icon = step.icon;
  const isSoft = step.theme === "soft";
  return (
    <section
      ref={ref}
      id={step.id}
      className={cn(
        "relative flex min-h-screen items-center overflow-hidden py-24",
        isSoft ? "bg-gradient-to-b from-brand-soft/40 via-surface to-surface" : "bg-surface",
        themeText[step.theme],
      )}
    >
      {isSoft && <Orbs />}
      <DotGrid className={cn(reversed ? "right-0" : "left-0")} />

      {/* Giant watermark numeral */}
      {step.stepLabel && (
        <span
          className={cn(
            "pointer-events-none absolute top-6 select-none font-display text-[11rem] font-semibold leading-none text-brand/[0.06] sm:text-[16rem]",
            reversed ? "right-4" : "left-4",
          )}
          aria-hidden
        >
          {step.stepLabel}
        </span>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid items-center gap-10 md:grid-cols-2 lg:gap-16">
          {/* Text */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            className={cn("flex flex-col gap-6", reversed ? "md:order-2" : "md:order-1")}
          >
            <Eyebrow step={step} variants={fromSide(reversed ? 40 : -40)} />
            <motion.h2
              variants={fromSide(reversed ? 40 : -40)}
              className="font-display text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl"
            >
              {step.title}
            </motion.h2>
            <motion.p variants={up} className="text-base leading-relaxed text-ink/70 md:text-lg">
              {step.body}
            </motion.p>
            {step.bullets && (
              <motion.ul variants={container} className="flex flex-col gap-3">
                {step.bullets.map((b) => (
                  <motion.li
                    key={b}
                    variants={up}
                    className="flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-surface/60 px-3.5 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] backdrop-blur-sm"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-sm text-ink/80 md:text-base">{b}</span>
                  </motion.li>
                ))}
              </motion.ul>
            )}
            {(step.primaryCta || step.secondaryCta) && (
              <motion.div variants={up}>
                <Actions step={step} dark={isDark} />
              </motion.div>
            )}
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: reversed ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewport}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className={cn(reversed ? "md:order-1" : "md:order-2")}
          >
            <motion.div style={{ y }} className="relative">
              {/* Offset accent panel for depth */}
              <div
                className={cn(
                  "absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-brand/20 to-accent/20",
                  reversed ? "-translate-x-5 translate-y-5" : "translate-x-5 translate-y-5",
                )}
                aria-hidden
              />
              {step.image ? (
                <div className="relative">
                  <Tinted
                    src={step.image}
                    alt={step.imageAlt}
                    className="aspect-[4/5] rounded-3xl shadow-hero sm:aspect-square"
                  />
                  {/* Floating stat badge */}
                  {step.stat && (
                    <div className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-ink/5 bg-surface/90 px-4 py-3 shadow-card backdrop-blur">
                      <span className="font-display text-2xl font-semibold text-ink">{step.stat.value}</span>
                      <span className="text-xs text-ink/60">{step.stat.label}</span>
                    </div>
                  )}
                  {Icon && (
                    <span className="absolute -left-4 -top-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-card">
                      <Icon className="h-7 w-7" />
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className="relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-3xl p-8 shadow-hero sm:aspect-square"
                  style={{ background: "linear-gradient(150deg, rgb(var(--brand)) 0%, rgb(var(--accent)) 100%)" }}
                >
                  <Grain />
                  <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
                  {Icon && (
                    <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm">
                      <Icon className="h-8 w-8" />
                    </span>
                  )}
                  <div className="relative text-brand-fg">
                    {step.stat && (
                      <div className="mb-3">
                        <div className="font-display text-6xl font-semibold leading-none">{step.stat.value}</div>
                        <div className="mt-1.5 text-sm text-white/80">{step.stat.label}</div>
                      </div>
                    )}
                    <div className="font-display text-lg font-medium opacity-90">{step.kicker}</div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ step, variants, dark }: { step: JourneyStep; variants: Variants; dark?: boolean }) {
  return (
    <motion.div variants={variants} className="flex items-center gap-3">
      {step.stepLabel && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg shadow-[0_4px_12px_-4px_rgb(var(--brand))]">
          {step.stepLabel}
        </span>
      )}
      <span className="h-px w-6 bg-accent" />
      {step.kicker && (
        <span className={cn("text-xs font-semibold uppercase tracking-[0.18em]", dark ? "text-white/70" : "text-ink/55")}>
          {step.kicker}
        </span>
      )}
    </motion.div>
  );
}

function Actions({ step, dark }: { step: JourneyStep; dark?: boolean }) {
  if (!step.primaryCta && !step.secondaryCta) return null;
  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      {step.primaryCta && (
        <Button asChild size="lg">
          <CtaLink to={step.primaryCta.to}>
            {step.primaryCta.label}
            <ArrowRight className="h-4 w-4" />
          </CtaLink>
        </Button>
      )}
      {step.secondaryCta && (
        <Button
          asChild
          size="lg"
          variant="secondary"
          className={cn(dark && "border-white/30 bg-white/10 text-white hover:border-white/50 hover:bg-white/20 hover:text-white")}
        >
          <CtaLink to={step.secondaryCta.to}>{step.secondaryCta.label}</CtaLink>
        </Button>
      )}
    </div>
  );
}
