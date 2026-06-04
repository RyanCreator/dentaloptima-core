import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowRight, Calendar, Check } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { Button } from "@/components/Button";
import { FinalCta } from "@/components/sections/FinalCta";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const service = practice.services.find((s) => s.slug === slug);

  if (!service) {
    return <Navigate to="/services" replace />;
  }

  const siteUrl = `https://${practice.contact.bookingHostname}`;
  const pageUrl = `${siteUrl}/services/${service.slug}`;
  const heroImage = service.heroImage || service.cardImage;

  const jsonLd: Array<Record<string, unknown>> = [
    breadcrumbJsonLd([
      { name: "Home", url: `${siteUrl}/` },
      { name: "Services", url: `${siteUrl}/services` },
      { name: service.name, url: pageUrl },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: service.name,
      description: service.shortDescription,
      provider: {
        "@type": "Dentist",
        name: practice.name,
        url: siteUrl,
      },
      areaServed: practice.address.city,
      serviceType: "Dental service",
      url: pageUrl,
    },
  ];

  if (service.faqs && service.faqs.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: service.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  useSeo({
    title: `${service.name} | ${practice.seo.siteTitle}`,
    description: service.shortDescription,
    path: `/services/${service.slug}`,
    image: `${siteUrl}${heroImage}`,
    jsonLd,
  });

  return (
    <>
      {/* Hero */}
      <section className="relative pt-32 md:pt-40 pb-14 md:pb-20 overflow-hidden">
        <picture className="absolute inset-0 -z-10">
          <img
            src={heroImage}
            alt={service.name}
            className="w-full h-full object-cover"
            fetchPriority="high"
          />
        </picture>
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.55) 100%)",
          }}
          aria-hidden="true"
        />

        <Container>
          <AnimatedSection className="max-w-3xl text-white">
            <nav className="text-xs text-white/70 mb-4">
              <Link to="/services" className="hover:text-white">
                Services
              </Link>{" "}
              <span className="opacity-40">/</span> {service.name}
            </nav>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight mb-4">
              {service.name}
            </h1>
            <p className="text-lg md:text-xl text-white/85 leading-relaxed max-w-2xl">
              {service.shortDescription}
            </p>
          </AnimatedSection>
        </Container>
      </section>

      {/* Body + key info */}
      <section className="section-padding">
        <Container>
          <div className="grid lg:grid-cols-[1.4fr,1fr] gap-10 lg:gap-14">
            <AnimatedSection className="min-w-0">
              <div
                className="prose prose-lg text-ink/80 max-w-none prose-headings:font-display prose-headings:text-ink prose-strong:text-ink"
                dangerouslySetInnerHTML={{ __html: service.body }}
              />
              <div className="mt-8">
                <Button asChild size="lg">
                  <Link to="/book">
                    <Calendar className="w-4 h-4" />
                    Book this treatment
                  </Link>
                </Button>
                <p className="text-xs text-ink/50 mt-3 italic">
                  You'll be able to pick from our full live service list on the
                  next page.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="min-w-0">
              <div className="rounded-3xl bg-brand/[0.04] p-6 md:p-8 border border-ink/5">
                <h2 className="font-display text-xl text-ink mb-5">
                  At a glance
                </h2>
                <dl className="space-y-4">
                  {service.keyInfo.map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs uppercase tracking-wide text-ink/50 mb-0.5">
                        {item.label}
                      </dt>
                      <dd className="text-base font-medium text-ink">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </AnimatedSection>
          </div>
        </Container>
      </section>

      {/* Gallery */}
      {service.galleryImages && service.galleryImages.length > 0 && (
        <section className="pb-16 md:pb-20">
          <Container>
            <AnimatedSection>
              <h2 className="font-display text-2xl md:text-3xl text-ink mb-6">
                Gallery
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {service.galleryImages.map((img, i) => (
                  <div
                    key={img}
                    className={`rounded-2xl overflow-hidden ${
                      i === 0 ? "col-span-2 md:col-span-2 row-span-2" : ""
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${service.name} example ${i + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover aspect-[4/3]"
                    />
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </Container>
        </section>
      )}

      {/* FAQs */}
      {service.faqs && service.faqs.length > 0 && (
        <section className="section-padding bg-brand/[0.03]">
          <Container>
            <AnimatedSection className="max-w-3xl mx-auto">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3 text-center">
                FAQs
              </p>
              <h2 className="font-display text-3xl md:text-4xl text-ink text-center mb-10">
                Common questions
              </h2>
              <dl className="space-y-4">
                {service.faqs.map((faq) => (
                  <div
                    key={faq.question}
                    className="rounded-2xl bg-white p-5 md:p-6 border border-ink/5"
                  >
                    <dt className="font-display text-lg text-ink mb-2">
                      {faq.question}
                    </dt>
                    <dd className="text-sm md:text-base text-ink/70 leading-relaxed">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </AnimatedSection>
          </Container>
        </section>
      )}

      <FinalCta />
    </>
  );
}
