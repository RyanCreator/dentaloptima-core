// Centralised glossary of dental + regulatory terms surfaced anywhere in
// the booking app. Two consumers:
//   - <GlossaryTerm term="UDA" /> renders the term inline with a popover
//     that shows the definition on tap/click.
//   - The /glossary reference page lists everything — findable via Cmd+K.
//
// Keep entries tight. The popover is for a quick "what does this mean?"
// jog, not a full explainer. If a term needs more than ~3 sentences,
// link the deeper resource in the body and keep the popover summary
// short.

export interface GlossaryEntry {
  /** Display name in the popover header — usually expanded form. */
  title: string;
  /** Short category for sorting/grouping on the /glossary page. */
  category:
    | "NHS"
    | "Regulatory"
    | "Clinical"
    | "GDPR"
    | "Practice operations";
  /** 1-3 sentence plain-English definition. */
  body: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  UDA: {
    title: "UDA — Unit of Dental Activity",
    category: "NHS",
    body:
      "The NHS contract measures dental work in UDAs. A check-up is 1 UDA; a band-3 course (crowns, dentures) is 12. Practices are paid against an annual UDA target.",
  },
  FP17: {
    title: "FP17",
    category: "NHS",
    body:
      "The form used to claim NHS dental treatment. Completed when a course of treatment finishes (or part-way for some band-1 work) and submitted to NHSBSA for payment.",
  },
  FP17O: {
    title: "FP17O",
    category: "NHS",
    body:
      "The orthodontic equivalent of FP17. Tracks orthodontic treatment phases (assess + refuse, assess + appliance fitted, completed treatment, etc).",
  },
  NHSBSA: {
    title: "NHSBSA — NHS Business Services Authority",
    category: "NHS",
    body:
      "The body that processes FP17 claims and pays practices. Submission happens through their Compass portal; rejected claims are returned with a reason code.",
  },
  Performer: {
    title: "Performer number",
    category: "NHS",
    body:
      "An NHS-issued ID number assigned to each clinician who provides NHS care. Required on every FP17. One per dentist or hygienist, granted after the National Performers List process.",
  },
  Band: {
    title: "Treatment band (NHS)",
    category: "NHS",
    body:
      "England has three patient-charge bands. Band 1: exam + diagnosis + advice. Band 2: adds fillings, extractions, root canal. Band 3: adds lab-made items like crowns and dentures.",
  },
  Exemption: {
    title: "NHS exemption",
    category: "NHS",
    body:
      "Reasons a patient pays no NHS charge — under 18, pregnant, on certain benefits, NHS low-income scheme. Evidence must be seen and recorded on the FP17.",
  },
  CQC: {
    title: "CQC — Care Quality Commission",
    category: "Regulatory",
    body:
      "The independent regulator for health and adult social care in England. Inspects practices against the Fundamental Standards. Registration is mandatory to provide regulated activity.",
  },
  RIDDOR: {
    title: "RIDDOR",
    category: "Regulatory",
    body:
      "Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013. Employers must report certain workplace injuries (e.g. >7-day absence, needlestick exposure) to the HSE.",
  },
  NRLS: {
    title: "NRLS — National Reporting and Learning System",
    category: "Regulatory",
    body:
      "The NHS England reporting system for patient-safety incidents. Serious clinical incidents should be reported so trends can be learned from across the system.",
  },
  ICO: {
    title: "ICO — Information Commissioner's Office",
    category: "Regulatory",
    body:
      "The UK's data-protection regulator. Personal-data breaches must be reported to the ICO within 72 hours of awareness. ICO can issue fines for GDPR non-compliance.",
  },
  Ombudsman: {
    title: "Ombudsman",
    category: "Regulatory",
    body:
      "For NHS patients: the Parliamentary and Health Service Ombudsman (PHSO) handles unresolved complaints. For private patients: the Dental Complaints Service. Complaints can escalate after the practice's local resolution fails.",
  },
  Safeguarding: {
    title: "Safeguarding",
    category: "Regulatory",
    body:
      "The duty to protect children and adults at risk from abuse and neglect. Practices must have a named safeguarding lead, a written policy, and a referral pathway to local authority + police.",
  },
  GDPR: {
    title: "GDPR — General Data Protection Regulation",
    category: "GDPR",
    body:
      "UK law on personal data (the post-Brexit UK version of EU GDPR plus the Data Protection Act 2018). Sets the rules for collecting, storing, sharing, and erasing patient data.",
  },
  DSAR: {
    title: "DSAR — Data Subject Access Request",
    category: "GDPR",
    body:
      "A patient's right under UK GDPR Article 15 to receive a copy of all personal data the practice holds about them. The practice must respond within 30 days.",
  },
  LegalHold: {
    title: "Legal hold",
    category: "GDPR",
    body:
      "A flag that prevents a patient record being deleted under the retention policy. Used when a claim, complaint, or insurance matter means records must be preserved beyond the normal window.",
  },
  Retention: {
    title: "Retention period",
    category: "GDPR",
    body:
      "How long records are kept after care ends. UK rule of thumb: 11 years for adults from last visit, or until a child patient turns 25 — whichever is later.",
  },
  Sedation: {
    title: "Conscious sedation",
    category: "Clinical",
    body:
      "Medication-induced reduced consciousness during treatment, while the patient stays responsive to verbal contact. Specific consent + fasting + escort home are required.",
  },
  COSHH: {
    title: "COSHH — Control of Substances Hazardous to Health",
    category: "Practice operations",
    body:
      "Workplace regulations requiring practices to assess and control exposure to hazardous substances (decon chemicals, mercury, latex). Risk assessments must be documented and reviewed.",
  },
  HTM01_05: {
    title: "HTM 01-05",
    category: "Practice operations",
    body:
      "The NHS technical memorandum on decontamination in dentistry. Sets the required standards for sterilising instruments, traceability, and clean/dirty workflow zones.",
  },
};
