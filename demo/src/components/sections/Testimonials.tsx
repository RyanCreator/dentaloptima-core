import { Star } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";

export function Testimonials() {
  if (!practice.features.showTestimonials || practice.testimonials.length === 0) {
    return null;
  }
  return (
    <section className="section-padding bg-ink text-white">
      <Container>
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-12 md:mb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70 mb-3">
            What our patients say
          </p>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight">
            Care you'll feel the moment you arrive
          </h2>
        </AnimatedSection>

        <div className="grid md:grid-cols-3 gap-6">
          {practice.testimonials.map((t, i) => (
            <AnimatedSection key={i} delay={0.08 * i}>
              <figure className="h-full rounded-3xl bg-white/5 border border-white/10 p-6 md:p-7">
                {typeof t.rating === "number" && (
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`w-4 h-4 ${
                          idx < (t.rating ?? 0)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-white/25"
                        }`}
                      />
                    ))}
                  </div>
                )}
                <blockquote className="text-base leading-relaxed text-white/90">
                  "{t.quote}"
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold text-white">{t.author}</span>
                  {t.authorRole && (
                    <span className="text-white/55"> · {t.authorRole}</span>
                  )}
                </figcaption>
              </figure>
            </AnimatedSection>
          ))}
        </div>
      </Container>
    </section>
  );
}
