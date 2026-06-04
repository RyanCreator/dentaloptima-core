import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { Button } from "@/components/Button";

export function TeamPreview() {
  return (
    <section className="section-padding">
      <Container>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 md:mb-12">
          <AnimatedSection className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              The people
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl leading-[1.1] tracking-tight text-ink">
              A friendly team you'll actually want to see
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <Button asChild variant="secondary">
              <Link to="/about">
                Meet everyone <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </AnimatedSection>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {practice.team.map((member, i) => (
            <AnimatedSection key={member.name} delay={0.08 * i}>
              <div className="group rounded-3xl overflow-hidden bg-brand/5 shadow-card">
                <div className="aspect-[4/5] overflow-hidden">
                  <img
                    src={member.photo}
                    alt={`${member.name}, ${member.role} at ${practice.name}`}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg text-ink">{member.name}</h3>
                  <p className="text-sm text-ink/70">{member.role}</p>
                  {member.gdcNumber && (
                    <p className="text-xs text-ink/50 mt-1">
                      {/* GDC Standard 1.3: registered title + GDC number
                          must be visible on the practice website for every
                          clinician shown. The number deep-links into the
                          public GDC register so anyone can verify it. */}
                      <a
                        href="https://www.gdc-uk.org/search-registers/the-online-register"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-ink hover:underline decoration-ink/40"
                      >
                        GDC {member.gdcNumber}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </Container>
    </section>
  );
}
