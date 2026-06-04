import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { Button } from "@/components/Button";

export function ServicesPreview() {
  // Home page highlights the first 3 services; full list lives on /services.
  const featured = practice.services.slice(0, 3);

  return (
    <section className="section-padding bg-brand/[0.03]">
      <Container>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 md:mb-12">
          <AnimatedSection className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              What we do
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight text-ink">
              Services tailored to every smile
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <Button asChild variant="secondary">
              <Link to="/services">
                See all services <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </AnimatedSection>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((service, i) => (
            <AnimatedSection key={service.slug} delay={0.08 * i}>
              <Link
                to={`/services/${service.slug}`}
                className="group block rounded-3xl bg-white overflow-hidden shadow-card hover:shadow-hero transition-shadow h-full"
              >
                <div className="aspect-[4/3] overflow-hidden bg-brand/10">
                  <img
                    src={service.cardImage}
                    alt={service.name}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl text-ink mb-2">
                    {service.name}
                  </h3>
                  <p className="text-sm text-ink/70 leading-relaxed mb-4">
                    {service.shortDescription}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                    Learn more
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            </AnimatedSection>
          ))}
        </div>
      </Container>
    </section>
  );
}
