import type { ComplaintsProcedureData } from "@/lib/complaintsProcedure";

// Public renderer for a practice's complaints procedure. Mirrored from
// `web/src/components/complaints/ComplaintsProcedureRender.tsx` — keep
// the two in sync when changing wording or section structure. The
// duplication is deliberate: each app is a separate Vite build and a
// shared package would be more rope than benefit at the moment.
//
// National regulator contacts are hardcoded here — same numbers + URLs
// for every UK practice. Update both copies of this file together if any
// of those change.

export interface PracticePublicContact {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  primary_phone: string | null;
  primary_email: string | null;
}

interface ComplaintsProcedureRenderProps {
  data: ComplaintsProcedureData;
  practice: PracticePublicContact;
}

// National regulator contacts — verified 2026-01.
const REGULATORS = {
  gdcPrivateComplaints: {
    phone: "020 8253 0800",
    url: "https://www.dentalcomplaints.org.uk",
  },
  gdcMain: {
    phone: "020 7167 6000",
    email: "information@gdc-uk.org",
    url: "https://www.gdc-uk.org",
  },
  cqc: {
    phone: "03000 616 161",
    url: "https://www.cqc.org.uk",
  },
  ombudsman: {
    phone: "0345 015 4033",
    url: "https://www.ombudsman.org.uk",
  },
} as const;

function formatAddress(p: PracticePublicContact): string[] {
  return [p.address_line1, p.address_line2, p.city, p.postcode].filter(
    (line): line is string => !!line && line.trim().length > 0,
  );
}

function formatReviewDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ComplaintsProcedureRender({
  data,
  practice,
}: ComplaintsProcedureRenderProps) {
  const managerName = data.complaints_manager_name.trim() || "the Complaints Manager";
  const managerEmail = data.complaints_manager_email?.trim() || practice.primary_email;
  const addressLines = formatAddress(practice);
  const showNhsBlocks = data.accepts_nhs;

  return (
    <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink prose-a:text-primary">
      <h1>Patient Complaints Procedure</h1>

      <p>
        At <strong>{practice.name}</strong> our aim is to always have satisfied
        patients, to meet your expectations of care and service, and to resolve
        any complaints efficiently, effectively, and politely. We take
        complaints very seriously, investigate them fully and fairly, and take
        great care to protect your confidentiality. We learn from complaints
        to improve our service. We will never discriminate against patients
        who have made a complaint and we will be happy to answer any questions
        you have about this procedure.
      </p>

      <h2>How to raise a complaint</h2>
      <p>
        If you are not entirely satisfied with any aspect of our care or
        service, please let us know as soon as possible. We accept complaints
        made verbally as well as in writing. We hope that most concerns can be
        resolved easily and quickly at the time they arise, with the person
        concerned.
      </p>
      <p>
        If your concern cannot be sorted in this way and you wish to make a
        formal complaint, please contact <strong>{managerName}</strong>
        {data.complaints_manager_role ? ` (${data.complaints_manager_role})` : ""}
        {", "}who is our designated Complaints Manager and will be your
        personal contact throughout the process.
      </p>

      <h2>What happens next</h2>
      <ul>
        <li>
          We aim to resolve <strong>verbal complaints within{" "}
          {data.ack_verbal_hours} hours</strong> wherever possible.
        </li>
        <li>
          Written complaints will be acknowledged within{" "}
          <strong>{data.ack_written_days} working days</strong>, with a full
          written response to follow as soon as is practical.
        </li>
        <li>
          If the investigation takes longer than expected, the Complaints
          Manager will contact you at least every{" "}
          <strong>{data.update_cadence_days} working days</strong> to keep you
          informed of progress and any reasons for delay.
        </li>
        <li>
          On completion of the investigation, you will receive a written
          response addressing each of your concerns, and you will be invited
          to a meeting to discuss the outcome and any practical resolutions.
        </li>
      </ul>

      <h2>How to contact us</h2>
      <p>You can send your complaint to us at:</p>
      <address className="not-italic">
        <strong>{practice.name}</strong>
        {addressLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
        {practice.primary_phone && (
          <span className="block">Telephone: {practice.primary_phone}</span>
        )}
        {managerEmail && (
          <span className="block">
            Email:{" "}
            <a href={`mailto:${managerEmail}`}>{managerEmail}</a>
          </span>
        )}
      </address>

      <h2>Complaining on behalf of someone else</h2>
      <p>
        We keep strictly to the rules of patient confidentiality. If you are
        complaining on behalf of someone else, we need their written consent
        to discuss their care with you — unless they are unable to provide
        this because of physical or mental illness, or are a child under 16.
      </p>

      <h2>Confidentiality and records</h2>
      <p>
        We keep comprehensive and confidential records of your complaint,
        stored securely and accessible only to those who need to see them for
        the purposes of the investigation and our improvement processes.
        Making a complaint will never affect your care.
      </p>

      <h2>If you are not satisfied with our response</h2>
      <p>
        We hope to resolve your complaint within our practice. If you are not
        satisfied with our response, you can escalate it to the following
        independent bodies.
      </p>

      {showNhsBlocks && data.local_icb && (
        <>
          <h3>NHS complaints — your local ICB</h3>
          <p>
            If you do not feel able to raise an NHS complaint directly with
            us, or you are dissatisfied with our response, you can contact our
            local NHS Integrated Care Board. Please mark correspondence
            "for the attention of the Complaints Team".
          </p>
          <address className="not-italic">
            <strong>{data.local_icb.name}</strong>
            {data.local_icb.address.split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
            {data.local_icb.email && (
              <span className="block">
                Email:{" "}
                <a href={`mailto:${data.local_icb.email}`}>
                  {data.local_icb.email}
                </a>
              </span>
            )}
            {data.local_icb.phone && (
              <span className="block">Telephone: {data.local_icb.phone}</span>
            )}
          </address>
        </>
      )}

      <h3>Private treatment — Dental Complaints Service</h3>
      <p>
        For complaints about <em>private</em> dental treatment, you can contact
        the <a href={REGULATORS.gdcPrivateComplaints.url}>Dental Complaints
        Service</a>, run independently by the General Dental Council. Contact
        them within 12 months of the treatment, or within 12 months of
        becoming aware of the issue.
      </p>
      <p>Telephone: {REGULATORS.gdcPrivateComplaints.phone}</p>

      {showNhsBlocks && (
        <>
          <h3>Parliamentary and Health Service Ombudsman</h3>
          <p>
            If your NHS complaint remains unresolved after escalating to the
            ICB, you can contact the{" "}
            <a href={REGULATORS.ombudsman.url}>
              Parliamentary and Health Service Ombudsman
            </a>{" "}
            (England). Telephone: {REGULATORS.ombudsman.phone}.
          </p>
        </>
      )}

      <h3>Care Quality Commission (CQC)</h3>
      <p>
        The <a href={REGULATORS.cqc.url}>Care Quality Commission</a> regulates
        private and NHS dental care in England. They can take action against
        providers that are not meeting their standards. Telephone:{" "}
        {REGULATORS.cqc.phone}.
      </p>

      <h3>General Dental Council (GDC)</h3>
      <p>
        The <a href={REGULATORS.gdcMain.url}>General Dental Council</a> is the
        regulator for all dental professionals in the UK. Use this route if
        your complaint is about a clinician's conduct or fitness to practise.
        Email: <a href={`mailto:${REGULATORS.gdcMain.email}`}>{REGULATORS.gdcMain.email}</a>
        . Telephone: {REGULATORS.gdcMain.phone}.
      </p>

      {data.additional_notes?.trim() && (
        <>
          <h2>Additional information</h2>
          {data.additional_notes
            .split("\n\n")
            .map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
        </>
      )}

      {data.last_reviewed_at && (
        <p className="text-sm text-ink/55">
          Last reviewed: {formatReviewDate(data.last_reviewed_at)}
        </p>
      )}
    </article>
  );
}
