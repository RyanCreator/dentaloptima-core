import { practice as staticPractice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { useSeo } from "@/lib/seo";
import { useMaybePractice } from "@/contexts/PracticeContext";
import {
  ComplaintsProcedureRender,
  type PracticePublicContact,
} from "@/components/ComplaintsProcedureRender";
import { normaliseComplaintsProcedure } from "@/lib/complaintsProcedure";

// Public /complaints page. Two states:
//   1. Practice has published a procedure (complaints_procedure JSONB
//      non-null) — render it via ComplaintsProcedureRender.
//   2. Practice has not yet published — show a friendly notice pointing
//      the visitor to contact the practice directly. We deliberately do
//      NOT silently render a default template, because the operator
//      hasn't seen and approved the wording. CQC expects each practice
//      to have an explicit, named procedure.

export default function Complaints() {
  const tenant = useMaybePractice();
  useSeo({
    title: `Complaints Procedure | ${staticPractice.seo.siteTitle}`,
    description: `How ${staticPractice.name} handles patient complaints — your route to raise concerns, our response timeframes, and how to escalate if you remain dissatisfied.`,
    path: "/complaints",
  });

  // Static-config fallback for the contact block when running standalone
  // (no DB tenant resolved — e.g. local dev with the demo config). In
  // production the DB-backed practice row drives the page.
  const practiceContact: PracticePublicContact = {
    name: staticPractice.name,
    address_line1: staticPractice.address.line1,
    address_line2: staticPractice.address.line2 ?? null,
    city: staticPractice.address.city,
    postcode: staticPractice.address.postcode,
    primary_phone: staticPractice.contact.phone,
    primary_email: staticPractice.contact.email,
  };

  const procedure = normaliseComplaintsProcedure(
    tenant?.practice.complaints_procedure ?? null,
  );

  return (
    <section className="pt-32 md:pt-40 pb-20">
      <Container>
        {procedure ? (
          <ComplaintsProcedureRender data={procedure} practice={practiceContact} />
        ) : (
          <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink">
            <h1>Complaints Procedure</h1>
            <p>
              We're currently finalising the formal version of our complaints
              procedure for publication. In the meantime, if you have any
              concerns about your care or our service, please contact us
              directly — we want to hear from you.
            </p>
            <p>
              Telephone:{" "}
              <a href={`tel:${practiceContact.primary_phone}`}>
                {practiceContact.primary_phone}
              </a>
              <br />
              Email:{" "}
              <a href={`mailto:${practiceContact.primary_email}`}>
                {practiceContact.primary_email}
              </a>
            </p>
            <p>
              All concerns are taken seriously, handled in strict confidence,
              and never affect your future care with us. If you remain
              dissatisfied, you can contact the{" "}
              <a href="https://www.dentalcomplaints.org.uk">
                Dental Complaints Service
              </a>{" "}
              (private treatment) or the{" "}
              <a href="https://www.cqc.org.uk">
                Care Quality Commission
              </a>{" "}
              who regulate dental services in England.
            </p>
          </article>
        )}
      </Container>
    </section>
  );
}
