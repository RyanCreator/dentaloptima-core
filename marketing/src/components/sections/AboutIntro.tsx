import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";

export function AboutIntro() {
  const { about } = practice;
  return (
    <section className="section-padding">
      <Container>
        <div className="grid lg:grid-cols-[1.15fr,1fr] gap-10 lg:gap-16 items-center">
          <AnimatedSection className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              About {practice.name}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight text-ink mb-5">
              {about.headline}
            </h2>
            <div
              className="prose prose-lg text-ink/75 max-w-none"
              dangerouslySetInnerHTML={{ __html: about.body }}
            />
          </AnimatedSection>
          {about.image && (
            <AnimatedSection delay={0.15} className="min-w-0">
              <div className="relative rounded-3xl overflow-hidden shadow-card aspect-[4/5]">
                <img
                  src={about.image}
                  alt={`Inside ${practice.name}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </AnimatedSection>
          )}
        </div>
      </Container>
    </section>
  );
}
