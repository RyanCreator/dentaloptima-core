import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Phone, Mail, MapPin } from "lucide-react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { useMaybePractice } from "@/contexts/PracticeContext";

// Map the DB cqc_rating enum to the human-readable string shown publicly.
const CQC_RATING_LABEL: Record<string, string> = {
  OUTSTANDING: "Outstanding",
  GOOD: "Good",
  REQUIRES_IMPROVEMENT: "Requires improvement",
  INADEQUATE: "Inadequate",
};

function formatRatingDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

const DAY_LABELS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function hoursLine(h: (typeof practice.hours)[keyof typeof practice.hours]) {
  if ("closed" in h && h.closed) return "Closed";
  return `${(h as { open: string }).open} – ${(h as { close: string }).close}`;
}

export function Footer() {
  const year = new Date().getFullYear();
  const social = [
    { href: practice.social.facebook, icon: Facebook, label: "Facebook" },
    { href: practice.social.instagram, icon: Instagram, label: "Instagram" },
    { href: practice.social.twitter, icon: Twitter, label: "Twitter" },
  ].filter((s) => s.href);

  // Pull regulator-display fields from the resolved DB practice row (not
  // the static config) — the operator manages these via Settings, so they
  // need to be live data. Static fallback for previewing locally is
  // intentionally absent so missing data is obvious during testing.
  const tenant = useMaybePractice();
  const ico = tenant?.practice.ico_registration_number?.trim() || null;
  const cqcProviderId = tenant?.practice.cqc_provider_id?.trim() || null;
  const cqcRating = tenant?.practice.cqc_rating ?? null;
  const cqcRatingDate = tenant?.practice.cqc_rating_date ?? null;

  // Principal Dentist resolution order:
  //   1. DB (operator-editable via booking app Settings → Clinic).
  //   2. Static config — whoever in `practice.team` has a role matching
  //      "principal" or "owner". This keeps standalone-template demos
  //      working without a DB row, and lets clients who haven't filled
  //      in the field yet still get a sensible default.
  const dbPrincipalName = tenant?.practice.principal_dentist_name?.trim() || null;
  const dbPrincipalGdc = tenant?.practice.principal_dentist_gdc_number?.trim() || null;
  const configPrincipal = practice.team.find((m) =>
    /principal|owner/i.test(m.role),
  );
  const principalName = dbPrincipalName ?? configPrincipal?.name ?? null;
  const principalGdc = dbPrincipalGdc ?? configPrincipal?.gdcNumber ?? null;

  return (
    <footer className="bg-ink text-white/80 mt-16">
      <Container className="py-14 md:py-20">
        {/* 3-column grid on desktop. Left column stacks brand + contact.
            Middle = pages, right = hours. Collapses to 1-col on mobile,
            2-col on tablet for better use of horizontal space. */}
        <div className="grid gap-10 md:gap-12 md:grid-cols-2 lg:grid-cols-[1.3fr,1fr,1fr]">
          {/* Column 1 — Brand + contact */}
          <div className="md:col-span-2 lg:col-span-1">
            <img
              src={practice.branding.logoUrl}
              alt={practice.name}
              className="h-10 w-auto mb-5"
            />
            <p className="text-sm leading-relaxed text-white/65 max-w-sm mb-6">
              {practice.tagline}
            </p>

            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href={`tel:${practice.contact.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-start gap-2.5 text-white/75 hover:text-white transition-colors"
                >
                  <Phone className="w-4 h-4 mt-0.5 shrink-0 text-white/40" />
                  {practice.contact.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${practice.contact.email}`}
                  className="inline-flex items-start gap-2.5 text-white/75 hover:text-white transition-colors break-all"
                >
                  <Mail className="w-4 h-4 mt-0.5 shrink-0 text-white/40" />
                  {practice.contact.email}
                </a>
              </li>
              <li>
                <address className="not-italic inline-flex items-start gap-2.5 text-white/75">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-white/40" />
                  <span className="leading-relaxed">
                    {practice.address.line1}
                    {practice.address.line2 && (
                      <>
                        <br />
                        {practice.address.line2}
                      </>
                    )}
                    <br />
                    {practice.address.city}, {practice.address.postcode}
                  </span>
                </address>
              </li>
            </ul>

            {social.length > 0 && (
              <div className="flex items-center gap-2 mt-6">
                {social.map(({ href, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Column 2 — Pages */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white mb-4">
              Pages
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <FooterLink to="/">Home</FooterLink>
              </li>
              <li>
                <FooterLink to="/services">Services</FooterLink>
              </li>
              <li>
                <FooterLink to="/about">About us</FooterLink>
              </li>
              <li>
                <FooterLink to="/book">Book online</FooterLink>
              </li>
              <li>
                <FooterLink to="/contact">Contact</FooterLink>
              </li>
            </ul>
          </div>

          {/* Column 3 — Opening hours */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white mb-4">
              Opening hours
            </h3>
            <ul className="space-y-2 text-sm">
              {(Object.keys(DAY_LABELS) as Array<keyof typeof DAY_LABELS>).map(
                (key) => (
                  <li
                    key={key}
                    className="grid grid-cols-[auto,1fr] gap-4 tabular-nums"
                  >
                    <span className="text-white/55">{DAY_LABELS[key]}</span>
                    <span className="text-right text-white/80">
                      {hoursLine(
                        practice.hours[key as keyof typeof practice.hours]
                      )}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      </Container>

      {/* Regulator-display block. CQC + GDC + ICO references are legally
          required to be visible on a UK dental practice's website.
          Surfaced as a tight strip above the legal bar so it doesn't
          fight with the main footer columns. Each row is hidden when its
          underlying data is missing — partial data still looks clean. */}
      {(cqcProviderId || cqcRating || ico || principalGdc) && (
        <div className="border-t border-white/10">
          <Container className="py-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-3">
              Regulatory information
            </p>
            <div className="grid gap-2 text-xs text-white/65 sm:grid-cols-2 lg:grid-cols-3">
              {cqcProviderId && (
                <p>
                  Regulated by the{" "}
                  <a
                    href={`https://www.cqc.org.uk/provider/${cqcProviderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/30 hover:decoration-white/80 hover:text-white"
                  >
                    Care Quality Commission
                  </a>
                  {cqcRating && (
                    <>
                      {" "}— rated <strong className="text-white">{CQC_RATING_LABEL[cqcRating]}</strong>
                      {cqcRatingDate && ` (${formatRatingDate(cqcRatingDate)})`}
                    </>
                  )}
                </p>
              )}
              {ico && (
                <p>
                  ICO data-controller registration:{" "}
                  <a
                    href="https://ico.org.uk/ESDWebPages/Search"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/30 hover:decoration-white/80 hover:text-white"
                  >
                    <strong className="text-white">{ico}</strong>
                  </a>
                </p>
              )}
              {principalGdc && principalName && (
                <p>
                  Principal:{" "}
                  <span className="text-white">{principalName}</span>
                  {" — "}
                  <a
                    href="https://www.gdc-uk.org/search-registers/the-online-register"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/30 hover:decoration-white/80 hover:text-white"
                  >
                    GDC {principalGdc}
                  </a>
                </p>
              )}
            </div>
          </Container>
        </div>
      )}

      {/* Legal / credit bar */}
      <div className="border-t border-white/10">
        <Container className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-white/45">
          <p>© {year} {practice.legalName}. All rights reserved.</p>

          <nav className="flex items-center gap-x-5 gap-y-1 flex-wrap">
            <Link to="/glossary" className="hover:text-white transition-colors">
              Dental glossary
            </Link>
            <Link to="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link to="/complaints" className="hover:text-white transition-colors">
              Complaints
            </Link>
            <Link to="/cookies" className="hover:text-white transition-colors">
              Cookies
            </Link>
            <span className="text-white/25">·</span>
            <span>
              Website by{" "}
              <a
                href="https://dentaloptima.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors"
              >
                Dentaloptima
              </a>
            </span>
          </nav>
        </Container>
      </div>
    </footer>
  );
}

function FooterLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="text-white/75 hover:text-white transition-colors"
    >
      {children}
    </Link>
  );
}
