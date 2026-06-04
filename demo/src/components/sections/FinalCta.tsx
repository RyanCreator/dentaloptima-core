import { Link } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Button } from "@/components/Button";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";

export function FinalCta() {
  return (
    <section className="section-padding">
      <Container>
        <AnimatedSection>
          <div className="rounded-3xl overflow-hidden relative bg-brand text-brand-fg p-10 md:p-14 lg:p-16 text-center">
            <div
              className="absolute inset-0 opacity-[0.08] pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgb(255 255 255) 1px, transparent 0)",
                backgroundSize: "20px 20px",
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight mb-4 max-w-2xl mx-auto">
                Ready to meet your new dentist?
              </h2>
              <p className="text-base md:text-lg text-white/85 max-w-xl mx-auto mb-8">
                Book online in under a minute, or give us a call during opening hours.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="bg-white text-brand border-white hover:bg-white/95"
                >
                  <Link to="/book">
                    Book an appointment <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                >
                  <a href={`tel:${practice.contact.phone.replace(/\s/g, "")}`}>
                    <Phone className="w-4 h-4" />
                    {practice.contact.phone}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </Container>
    </section>
  );
}
