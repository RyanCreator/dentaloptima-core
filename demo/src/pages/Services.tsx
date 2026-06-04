import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { FinalCta } from "@/components/sections/FinalCta";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";

export default function Services() {
  const siteUrl = `https://${practice.contact.bookingHostname}`;

  useSeo({
    title: `Services | ${practice.seo.siteTitle}`,
    description: `Explore treatments at ${practice.name}: check-ups, hygiene, whitening, Invisalign, and more. Book online 24/7.`,
    path: "/services",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Home", url: `${siteUrl}/` },
        { name: "Services", url: `${siteUrl}/services` },
      ]),
    ],
  });

  return (
    <>
      <section className="pt-32 md:pt-40 pb-10 md:pb-12 bg-brand/[0.04]">
        <Container>
          <AnimatedSection className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              Our services
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink mb-4">
              Everything we do, under one roof
            </h1>
            <p className="text-base md:text-lg text-ink/70">
              From routine check-ups to smile makeovers, our team blends modern
              techniques with proper old-fashioned care. Pick a service to learn
              more.
            </p>
          </AnimatedSection>
        </Container>
      </section>

      <section className="section-padding">
        <Container>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {practice.services.map((service, i) => (
              <AnimatedSection key={service.slug} delay={0.04 * i}>
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
                    <h2 className="font-display text-xl text-ink mb-2">
                      {service.name}
                    </h2>
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

      <FinalCta />
    </>
  );
}
