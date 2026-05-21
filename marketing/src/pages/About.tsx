import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { TeamPreview } from "@/components/sections/TeamPreview";
import { Testimonials } from "@/components/sections/Testimonials";
import { FinalCta } from "@/components/sections/FinalCta";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";

export default function About() {
  const siteUrl = `https://${practice.contact.bookingHostname}`;

  useSeo({
    title: `About | ${practice.seo.siteTitle}`,
    description: `Meet the team at ${practice.name}. A modern, welcoming practice serving ${practice.address.city} and the surrounding area.`,
    path: "/about",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Home", url: `${siteUrl}/` },
        { name: "About", url: `${siteUrl}/about` },
      ]),
    ],
  });

  return (
    <>
      <section className="pt-32 md:pt-40 pb-12 bg-brand/[0.04]">
        <Container>
          <AnimatedSection className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              Who we are
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink mb-5">
              {practice.about.headline}
            </h1>
            <div
              className="prose prose-lg text-ink/75 max-w-none"
              dangerouslySetInnerHTML={{ __html: practice.about.body }}
            />
          </AnimatedSection>
        </Container>
      </section>

      {practice.about.image && (
        <section className="pb-4">
          <Container>
            <AnimatedSection>
              <div className="rounded-3xl overflow-hidden shadow-card aspect-[16/7]">
                <img
                  src={practice.about.image}
                  alt={`Inside ${practice.name}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </AnimatedSection>
          </Container>
        </section>
      )}

      <TeamPreview />

      {practice.gallery && practice.gallery.length > 0 && (
        <section className="section-padding bg-brand/[0.03]">
          <Container>
            <AnimatedSection className="text-center max-w-xl mx-auto mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
                Inside the practice
              </p>
              <h2 className="font-display text-3xl md:text-4xl text-ink">
                A calm, modern space
              </h2>
            </AnimatedSection>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {practice.gallery.map((item, i) => (
                <AnimatedSection key={i} delay={0.04 * i}>
                  <div className="rounded-2xl overflow-hidden aspect-square bg-brand/10">
                    <img
                      src={item.image}
                      alt={item.caption || `Practice photo ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </Container>
        </section>
      )}

      <Testimonials />
      <FinalCta />
    </>
  );
}
