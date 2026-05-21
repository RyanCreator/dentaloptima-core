import { Phone, Mail, MapPin, Clock, ArrowRight } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { ContactForm } from "@/components/ContactForm";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function hoursLine(h: (typeof practice.hours)[keyof typeof practice.hours]) {
  if ("closed" in h && h.closed) return "Closed";
  return `${(h as { open: string }).open} – ${(h as { close: string }).close}`;
}

export default function Contact() {
  const siteUrl = `https://${practice.contact.bookingHostname}`;
  const phoneHref = `tel:${practice.contact.phone.replace(/\s/g, "")}`;
  const mailHref = `mailto:${practice.contact.email}`;

  useSeo({
    title: `Contact | ${practice.seo.siteTitle}`,
    description: `Get in touch with ${practice.name}. Phone, email, and opening hours — we usually reply within one working day.`,
    path: "/contact",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Home", url: `${siteUrl}/` },
        { name: "Contact", url: `${siteUrl}/contact` },
      ]),
    ],
  });

  const mapQuery = encodeURIComponent(
    [
      practice.address.line1,
      practice.address.line2,
      practice.address.city,
      practice.address.postcode,
      practice.address.country,
    ]
      .filter(Boolean)
      .join(", ")
  );
  const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`;

  return (
    <>
      {/* Header — left-aligned max-w-2xl inside full Container */}
      <section className="pt-32 md:pt-40 pb-10 md:pb-12 bg-brand/[0.04]">
        <Container>
          <AnimatedSection className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              Get in touch
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink mb-4">
              We'd love to hear from you
            </h1>
            <p className="text-base md:text-lg text-ink/70 leading-relaxed">
              For appointments, use our online booking. For anything else, give
              us a call or drop us a line.
            </p>
          </AnimatedSection>
        </Container>
      </section>

      {/* Two-column body — contact details left, map right, full Container width */}
      <section className="section-padding">
        <Container>
          <div className="grid lg:grid-cols-[1fr,1.2fr] gap-10 lg:gap-16 items-start">
            <AnimatedSection className="min-w-0 space-y-6">
              {/* Primary Call / Email CTA pair */}
              <div className="grid sm:grid-cols-2 gap-4">
                <a
                  href={phoneHref}
                  className="group rounded-2xl bg-brand text-brand-fg p-5 md:p-6 flex flex-col justify-between gap-4 min-h-[150px] hover:opacity-95 transition-opacity shadow-card"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
                      <Phone className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
                      Call us
                    </span>
                  </div>
                  <p className="font-display text-xl md:text-2xl leading-tight">
                    {practice.contact.phone}
                  </p>
                </a>

                <a
                  href={mailHref}
                  className="group rounded-2xl bg-white border border-ink/10 p-5 md:p-6 flex flex-col justify-between gap-4 min-h-[150px] hover:border-brand/40 hover:bg-brand/[0.03] transition-colors shadow-card"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                      Email us
                    </span>
                  </div>
                  <p className="font-display text-base md:text-lg leading-tight text-ink break-all">
                    {practice.contact.email}
                  </p>
                </a>
              </div>

              {/* Address + Hours tiles */}
              <div className="grid sm:grid-cols-2 gap-4">
                <InfoTile icon={MapPin} label="Visit">
                  <p className="text-sm text-ink leading-relaxed">
                    {practice.address.line1}
                    {practice.address.line2 && (
                      <>
                        <br />
                        {practice.address.line2}
                      </>
                    )}
                    <br />
                    {practice.address.city}, {practice.address.postcode}
                  </p>
                </InfoTile>

                <InfoTile icon={Clock} label="Opening hours">
                  <ul className="space-y-0.5 text-xs">
                    {(Object.keys(DAY_LABELS) as Array<keyof typeof DAY_LABELS>).map(
                      (k) => (
                        <li
                          key={k}
                          className="flex items-center justify-between gap-2 tabular-nums"
                        >
                          <span className="text-ink/55">{DAY_LABELS[k]}</span>
                          <span className="text-ink/85">
                            {hoursLine(
                              practice.hours[k as keyof typeof practice.hours]
                            )}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </InfoTile>
              </div>

              {/* Booking nudge */}
              <div className="rounded-2xl border border-ink/10 p-5 md:p-6 bg-white flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-display text-lg text-ink">
                    Looking to book an appointment?
                  </p>
                  <p className="text-sm text-ink/60">
                    Use our online booking — it's faster.
                  </p>
                </div>
                <a
                  href="/book"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline shrink-0"
                >
                  Book online
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="min-w-0">
              <div className="lg:sticky lg:top-28">
                <div className="rounded-2xl overflow-hidden border border-ink/10 aspect-[16/10] lg:aspect-[4/5] bg-ink/5">
                  <iframe
                    src={mapEmbedUrl}
                    title={`Map showing ${practice.name}`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </AnimatedSection>
          </div>
        </Container>
      </section>

      {/* Optional contact form — config opt-in */}
      {practice.features.contactForm && (
        <section className="section-padding border-t border-ink/5">
          <Container>
            <div className="grid lg:grid-cols-[1fr,1.4fr] gap-10 lg:gap-16 items-start">
              <AnimatedSection className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
                  Prefer to write?
                </p>
                <h2 className="font-display text-2xl md:text-3xl leading-tight text-ink mb-3">
                  Send us a message
                </h2>
                <p className="text-sm md:text-base text-ink/70 leading-relaxed">
                  Drop a note below and we'll get back to you, usually within
                  one working day. Not for booking appointments — use the
                  booking form for that.
                </p>
              </AnimatedSection>
              <AnimatedSection delay={0.1} className="min-w-0">
                <ContactForm />
              </AnimatedSection>
            </div>
          </Container>
        </section>
      )}
    </>
  );
}

function InfoTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full p-5 md:p-6 rounded-2xl bg-brand/[0.04] border border-ink/5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand mb-3">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}
