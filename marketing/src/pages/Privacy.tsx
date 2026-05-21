import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { useSeo } from "@/lib/seo";

export default function Privacy() {
  useSeo({
    title: `Privacy Policy | ${practice.seo.siteTitle}`,
    description: `How ${practice.name} collects, uses, and protects your personal data.`,
    path: "/privacy",
  });

  return (
    <section className="pt-32 md:pt-40 pb-20">
      <Container>
        <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink">
          <h1>Privacy Policy</h1>
          <p>
            {practice.legalName} ("we", "us") operates{" "}
            <strong>{practice.name}</strong>. This policy explains how we
            handle your personal data under the UK GDPR.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Booking + contact form submissions</strong>: name, email,
              phone, message, and any health information you choose to share
            </li>
            <li>
              <strong>Patient records</strong>: treatment history, clinical
              notes, imaging (stored securely, only accessible to your
              clinicians)
            </li>
            <li>
              <strong>Website analytics</strong>: aggregate, anonymised usage
              data via Google Analytics (only with your consent)
            </li>
          </ul>

          <h2>How we use it</h2>
          <p>
            To provide dental care, manage appointments, send reminders, handle
            billing, and communicate with you. We only use your data for these
            purposes.
          </p>

          <h2>Who we share it with</h2>
          <p>
            We work with a handful of trusted processors who help us run the
            practice:
          </p>
          <ul>
            <li>
              <strong>Dentaloptima</strong> (our practice management software
              provider) — data hosted in the European Union (Ireland) via
              Supabase
            </li>
            <li>
              <strong>Postmark</strong> — sends booking confirmations and
              appointment reminders
            </li>
            <li>
              <strong>Stripe</strong> — processes payments for invoices where
              you choose to pay online
            </li>
            <li>
              <strong>Google Analytics 4</strong> — aggregate website stats,
              only loaded with your consent
            </li>
          </ul>
          <p>
            We never sell your data. We share it with the NHS or your GP only
            where necessary for your care, and only with your knowledge.
          </p>

          <h2>Data location &amp; security</h2>
          <p>
            Your records are held within the European Union (Ireland), on
            infrastructure that provides enterprise-grade security including
            TLS in transit, AES-256 encryption at rest, row-level access
            controls, and off-site backups. The UK Government recognises the
            EU under an adequacy decision, so this transfer is treated the
            same as UK-only processing for UK GDPR purposes.
          </p>

          <h2>Your rights</h2>
          <p>Under the UK GDPR you have the right to:</p>
          <ul>
            <li>Request a copy of your personal data</li>
            <li>Ask us to correct information that's wrong or out of date</li>
            <li>
              Ask us to delete your data (where not overridden by our
              regulatory duty to retain clinical records)
            </li>
            <li>Withdraw marketing consent at any time</li>
            <li>
              Complain to the Information Commissioner's Office (ICO) if you
              feel we have mishandled your data
            </li>
          </ul>

          <h2>How to contact us</h2>
          <p>
            Email{" "}
            <a href={`mailto:${practice.contact.email}`}>
              {practice.contact.email}
            </a>{" "}
            or call {practice.contact.phone}.
          </p>

          <p className="text-sm text-ink/55">
            Last updated: {new Date().toLocaleDateString("en-GB")}
          </p>
        </article>
      </Container>
    </section>
  );
}
