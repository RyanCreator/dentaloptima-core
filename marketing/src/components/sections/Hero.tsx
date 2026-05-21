import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Button } from "@/components/Button";
import { Container } from "@/components/Container";

export function Hero() {
  const { hero } = practice;

  return (
    <section className="relative h-[100svh] min-h-[620px] flex items-center overflow-hidden">
      {/* Background image */}
      <picture className="absolute inset-0 -z-10">
        {hero.imageMobile && (
          <source media="(max-width: 640px)" srcSet={hero.imageMobile} />
        )}
        <img
          src={hero.image}
          alt={hero.imageAlt}
          className="w-full h-full object-cover"
          fetchPriority="high"
          decoding="async"
        />
      </picture>

      {/* Dark gradient overlay — stronger at top-left for text readability */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.2) 100%)",
        }}
        aria-hidden="true"
      />

      <Container className="relative z-10 pt-24 md:pt-28">
        <div className="max-w-2xl text-white animate-fade-up">
          {hero.kicker && (
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.14em] text-white/85 mb-4">
              {hero.kicker}
            </p>
          )}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] tracking-tight mb-5 md:mb-6">
            {hero.headline}
          </h1>
          <p className="text-base md:text-lg text-white/85 leading-relaxed max-w-xl mb-8">
            {hero.subheading}
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Button asChild size="lg">
              <Link to={hero.primaryCta.to}>
                {hero.primaryCta.label}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            {hero.secondaryCta && (
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="bg-white/10 text-white border-white/30 hover:bg-white/15 hover:border-white/50"
              >
                <Link to={hero.secondaryCta.to}>{hero.secondaryCta.label}</Link>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
