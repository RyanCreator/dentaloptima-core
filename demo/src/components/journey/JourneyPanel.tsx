import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import type { JourneyStep, PanelTheme } from "./journeyData";

// One full-screen journey panel. Pure presentation — the JourneyExperience
// engine decides which panel is mounted/active and drives the transitions.
// Inner content reveals with a gentle stagger once the panel is active.

const stage: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.18 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const themeText: Record<PanelTheme, string> = {
  dark: "text-white",
  brand: "text-brand-fg",
  light: "text-ink",
  soft: "text-ink",
};
// Background colour applied to the panel itself — only when there's no
// full-bleed background image (otherwise it would paint over the image).
const themeBg: Record<PanelTheme, string> = {
  dark: "bg-ink",
  brand: "", // brand uses a gradient via inline style
  light: "bg-surface",
  soft: "bg-brand-soft/40",
};

interface Props {
  step: JourneyStep;
  /** Engine mode: animate when the panel becomes active. */
  active?: boolean;
  /** Fallback mode (reduced motion / native scroll): reveal on scroll into view. */
  inViewMode?: boolean;
  isLast?: boolean;
}

export function JourneyPanel({ step, active = false, inViewMode = false, isLast = false }: Props) {
  const reduce = useReducedMotion();

  // Pick how the inner content reveals: on activation (engine) or on scroll
  // (fallback). Reduced motion shows everything immediately.
  const revealProps = reduce
    ? {}
    : inViewMode
      ? { initial: "hidden" as const, whileInView: "show" as const, viewport: { once: false, amount: 0.4 } }
      : { initial: "hidden" as const, animate: active ? ("show" as const) : ("hidden" as const) };

  const isDark = step.theme === "dark" || step.theme === "brand";
  // A full-bleed background image is only used on dark/brand panels. When
  // present, the panel itself stays transparent and the image + overlay sit
  // behind the content (z-10) — applying a bg colour here would hide them.
  const hasImageBg = isDark && !!step.image;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden flex items-center",
        themeText[step.theme],
        !hasImageBg && themeBg[step.theme],
      )}
      style={
        !hasImageBg && step.theme === "brand"
          ? { background: "linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--accent)) 100%)" }
          : undefined
      }
    >
      {/* Full-bleed background image + readability overlay */}
      {hasImageBg && (
        <>
          <img
            src={step.image}
            alt={step.imageAlt ?? ""}
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                step.theme === "brand"
                  ? "linear-gradient(135deg, rgb(var(--brand) / 0.92) 0%, rgb(var(--accent) / 0.82) 100%)"
                  : "linear-gradient(120deg, rgb(0 0 0 / 0.72) 0%, rgb(0 0 0 / 0.4) 55%, rgb(0 0 0 / 0.2) 100%)",
            }}
            aria-hidden
          />
        </>
      )}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 sm:px-8">
        {step.layout === "split" ? (
          <SplitLayout step={step} revealProps={revealProps} isDark={isDark} />
        ) : (
          <CenteredLayout step={step} revealProps={revealProps} isHero={step.layout === "hero"} />
        )}
      </div>

      {/* Scroll cue on the opening panel */}
      {step.layout === "hero" && !reduce && (
        <motion.div
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-1 text-white/70"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <span className="text-[11px] uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      )}

      {isLast && <span id="journey-end" className="sr-only" />}
    </div>
  );
}

type RevealProps = Record<string, unknown>;

function Eyebrow({ step }: { step: JourneyStep }) {
  return (
    <motion.div variants={item} className="flex items-center gap-3">
      {step.stepLabel && (
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
          {step.stepLabel}
        </span>
      )}
      {step.kicker && (
        <span className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
          {step.kicker}
        </span>
      )}
    </motion.div>
  );
}

function Actions({ step, dark }: { step: JourneyStep; dark?: boolean }) {
  if (!step.primaryCta && !step.secondaryCta) return null;
  return (
    <motion.div variants={item} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
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
          className={cn(dark && "bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50 hover:text-white")}
        >
          <CtaLink to={step.secondaryCta.to}>{step.secondaryCta.label}</CtaLink>
        </Button>
      )}
    </motion.div>
  );
}

// CTAs may point at a route (/book), an in-page anchor (#start), or a tel:
// link. Forwards ref + all props (incl. the className Radix Slot injects via
// Button asChild) onto the underlying anchor — otherwise the button styling
// is silently dropped.
const CtaLink = forwardRef<HTMLAnchorElement, { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ to, ...rest }, ref) =>
    to.startsWith("/") ? (
      <Link ref={ref} to={to} {...rest} />
    ) : (
      <a ref={ref} href={to} {...rest} />
    ),
);
CtaLink.displayName = "CtaLink";

function CenteredLayout({
  step,
  revealProps,
  isHero,
}: {
  step: JourneyStep;
  revealProps: RevealProps;
  isHero: boolean;
}) {
  const dark = step.theme === "dark" || step.theme === "brand";
  return (
    <motion.div
      variants={stage}
      {...revealProps}
      className={cn(
        "max-w-3xl",
        step.layout === "centered" || step.layout === "final" ? "mx-auto text-center items-center" : "",
        "flex flex-col gap-6",
      )}
    >
      <Eyebrow step={step} />
      <motion.h2
        variants={item}
        className={cn(
          "font-display font-semibold tracking-tight leading-[1.05]",
          isHero ? "text-4xl sm:text-5xl md:text-6xl lg:text-7xl" : "text-3xl sm:text-4xl md:text-5xl",
        )}
      >
        {step.title}
      </motion.h2>
      <motion.p
        variants={item}
        className={cn("text-base md:text-lg leading-relaxed max-w-2xl", dark ? "text-white/85" : "text-ink/70")}
      >
        {step.body}
      </motion.p>
      {step.stat && (
        <motion.div variants={item} className="flex items-baseline gap-3 justify-center">
          <span className="font-display text-4xl font-semibold">{step.stat.value}</span>
          <span className={cn("text-sm", dark ? "text-white/70" : "text-ink/60")}>{step.stat.label}</span>
        </motion.div>
      )}
      <div className={cn(step.layout === "centered" || step.layout === "final" ? "flex justify-center" : "")}>
        <Actions step={step} dark={dark} />
      </div>
    </motion.div>
  );
}

function SplitLayout({
  step,
  revealProps,
  isDark,
}: {
  step: JourneyStep;
  revealProps: RevealProps;
  isDark: boolean;
}) {
  const Icon = step.icon;
  return (
    <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
      {/* Text column */}
      <motion.div variants={stage} {...revealProps} className="flex flex-col gap-6 order-2 md:order-1">
        <Eyebrow step={step} />
        <motion.h2
          variants={item}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08]"
        >
          {step.title}
        </motion.h2>
        <motion.p variants={item} className={cn("text-base md:text-lg leading-relaxed", isDark ? "text-white/85" : "text-ink/70")}>
          {step.body}
        </motion.p>
        {step.bullets && (
          <motion.ul variants={item} className="flex flex-col gap-2.5">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Check className="h-3 w-3" />
                </span>
                <span className={cn("text-sm md:text-base", isDark ? "text-white/85" : "text-ink/75")}>{b}</span>
              </li>
            ))}
          </motion.ul>
        )}
        <Actions step={step} dark={isDark} />
      </motion.div>

      {/* Visual column — real image if provided, else a branded stat card */}
      <motion.div
        variants={stage}
        {...revealProps}
        className="order-1 md:order-2"
      >
        <motion.div variants={item} className="relative">
          {step.image ? (
            <div className="relative aspect-[4/5] sm:aspect-square rounded-3xl overflow-hidden shadow-hero">
              <img src={step.image} alt={step.imageAlt ?? ""} className="h-full w-full object-cover" decoding="async" />
            </div>
          ) : (
            <div
              className="relative aspect-[4/5] sm:aspect-square rounded-3xl overflow-hidden shadow-hero flex flex-col justify-between p-8"
              style={{ background: "linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--accent)) 100%)" }}
            >
              {Icon && (
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
                  <Icon className="h-8 w-8" />
                </span>
              )}
              <div className="text-brand-fg">
                {step.stat && (
                  <div className="mb-2">
                    <div className="font-display text-5xl font-semibold leading-none">{step.stat.value}</div>
                    <div className="text-sm text-white/80 mt-1">{step.stat.label}</div>
                  </div>
                )}
                <div className="text-lg font-display font-medium opacity-90">{step.kicker}</div>
              </div>
            </div>
          )}
          {/* Floating icon badge over real images */}
          {step.image && Icon && (
            <span className="absolute -top-4 -left-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-card">
              <Icon className="h-7 w-7" />
            </span>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
