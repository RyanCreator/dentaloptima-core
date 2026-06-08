import { cn } from "@/lib/cn";

// Decorative primitives that give sections depth + a "designed" feel without
// depending on photography: blurred brand orbs, a faint dot grid, film grain,
// and a cohesive brand tint over imagery (so even stock photos look intentional).

export function Orbs({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/20 blur-[90px]" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-accent/20 blur-[100px]" />
    </div>
  );
}

export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 text-ink/[0.07]", className)}
      aria-hidden
      style={{
        backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        maskImage: "radial-gradient(ellipse 70% 60% at center, black 25%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at center, black 25%, transparent 75%)",
      }}
    />
  );
}

export function Grain({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay", className)}
      aria-hidden
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

// A photo with a cohesive brand tint baked in — multiply in the shadows, a hint
// of accent in the highlights — so disparate images share one look.
export function Tinted({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img src={src} alt={alt ?? ""} className={cn("h-full w-full object-cover", imgClassName)} decoding="async" />
      <div
        className="absolute inset-0 mix-blend-multiply"
        style={{ background: "linear-gradient(135deg, rgb(var(--brand) / 0.35) 0%, transparent 55%, rgb(var(--accent) / 0.25) 100%)" }}
        aria-hidden
      />
    </div>
  );
}
