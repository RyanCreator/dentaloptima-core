import { Calendar, Mail, Phone, ShieldCheck } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { BookingForm } from "@/components/BookingForm";
import { ContactForm } from "@/components/ContactForm";
import { usePractice } from "@/contexts/PracticeContext";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";

export default function Book() {
  const tenant = usePractice();
  const bookingEnabled = tenant.practice.booking_app_enabled;
  const siteUrl = `https://${practice.contact.bookingHostname}`;

  useSeo({
    title: bookingEnabled
      ? `Book an appointment | ${practice.seo.siteTitle}`
      : `Enquire about an appointment | ${practice.seo.siteTitle}`,
    description: bookingEnabled
      ? `Request an appointment at ${tenant.practice.name} online. We'll confirm by email once it's been approved, usually within one working day.`
      : `Send an enquiry to ${tenant.practice.name} and we'll be in touch to arrange your appointment.`,
    path: "/book",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Home", url: `${siteUrl}/` },
        { name: bookingEnabled ? "Book" : "Enquire", url: `${siteUrl}/book` },
      ]),
    ],
  });

  return (
    <>
      {/* Header — matches Services / About page pattern */}
      <section className="pt-32 md:pt-40 pb-10 md:pb-12 bg-brand/[0.04]">
        <Container>
          <AnimatedSection className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              {bookingEnabled ? "Book online" : "Get in touch"}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink mb-4">
              {bookingEnabled ? "Request an appointment" : "Enquire about an appointment"}
            </h1>
            <p className="text-base md:text-lg text-ink/70 leading-relaxed">
              {bookingEnabled
                ? "Tell us a little about you and what you'd like to see us about. We'll email you to confirm a time, usually within one working day."
                : "Send us a quick message and a member of the team will get back to you to arrange your visit."}
            </p>
          </AnimatedSection>
        </Container>
      </section>

      {/* Two-column body — intro copy left, form right, full Container width */}
      <section className="section-padding">
        <Container>
          <div className="grid lg:grid-cols-[1fr,1.4fr] gap-10 lg:gap-16 items-start">
            <AnimatedSection className="min-w-0">
              <div className="lg:sticky lg:top-28 space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
                    Your visit
                  </p>
                  <h2 className="font-display text-2xl md:text-3xl leading-tight text-ink mb-3">
                    What happens after you hit send
                  </h2>
                  <p className="text-sm md:text-base text-ink/70 leading-relaxed">
                    Your request goes straight into our diary. A member of our
                    team will review the details, check availability, and email
                    you back to confirm your time — usually within one working
                    day.
                  </p>
                </div>

                <ul className="space-y-3 text-sm">
                  <Bullet icon={Calendar}>
                    We'll suggest a time close to your preferred slot
                  </Bullet>
                  <Bullet icon={Mail}>
                    You'll get a confirmation email with a calendar invite
                  </Bullet>
                  <Bullet icon={ShieldCheck}>
                    Your details are stored securely, only used for your care
                  </Bullet>
                </ul>

                <div className="pt-5 border-t border-ink/5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-2">
                    Rather call?
                  </p>
                  <a
                    href={`tel:${practice.contact.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-2 text-lg font-medium text-ink hover:text-brand transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    {practice.contact.phone}
                  </a>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="min-w-0">
              <div className="mb-7 pb-6 border-b border-ink/10">
                <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
                  {bookingEnabled ? "Your appointment request" : "Send us a message"}
                </h2>
                <p className="text-sm text-ink/60 leading-relaxed">
                  All fields required unless marked optional.
                </p>
              </div>
              {/* The booking wizard requires the booking app (services list,
                  appointment slot management). For website-only customers we
                  fall back to the same enquiry form Contact.tsx uses — both
                  write to booking_request, so the practice owner sees them
                  in one place when they enable the booking app later. */}
              {bookingEnabled ? <BookingForm /> : <ContactForm />}
            </AnimatedSection>
          </div>
        </Container>
      </section>
    </>
  );
}

function Bullet({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-ink/75 leading-relaxed pt-1.5">{children}</span>
    </li>
  );
}
