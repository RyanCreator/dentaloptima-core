// CQC-aligned starter templates for the policies a UK dental practice
// needs in place before a CQC inspection. Each template is a serious
// starting point — sections match what inspectors actually look at —
// but every practice MUST customise the [bracketed placeholders] for
// their own clinical lead, premises, suppliers, etc.
//
// These are NOT a substitute for a CQC consultant's review. They're a
// scaffold to stop practices launching with blank policies.
//
// Format: lightweight markdown-ish. "## Heading" is rendered as a
// bold subhead by PolicyContent in PolicyDetail. The Word download
// converts the same structure to <h2>/<p> tags.

export interface PolicyTemplate {
  category: string;
  /** Title prefilled when the user clicks "Use this template". */
  title: string;
  /** Body of the policy. Practice fills in [placeholders]. */
  body: string;
}

export const POLICY_TEMPLATES: Record<string, PolicyTemplate> = {
  INFECTION_CONTROL: {
    category: "INFECTION_CONTROL",
    title: "Infection Prevention and Control Policy",
    body: `## Purpose
This policy sets out how [Practice Name] prevents, controls, and monitors the spread of infection in the practice. It applies to all clinical and non-clinical staff and aligns with HTM 01-05 (Decontamination in primary care dental practices).

## Scope
Covers all areas of the practice including reception, surgeries, decontamination room, staff areas, and patient toilets.

## Responsibilities
- The Infection Prevention and Control (IPC) lead is [Name, Role].
- All clinical staff are responsible for following decontamination procedures and reporting any breaches.
- The practice manager ensures equipment is serviced, validated, and that records are kept.

## Hand hygiene
- All clinical staff bare below the elbow.
- Hand wash with soap and water on arrival, before/after each patient, after PPE removal, after toilet use.
- Alcohol gel between patients where hands are visibly clean.

## Personal Protective Equipment (PPE)
- Single-use gloves, masks, and aprons for every patient contact.
- Eye protection for patient and clinician during aerosol-generating procedures.
- PPE changed between patients and disposed of as clinical waste.

## Instrument decontamination
- All reusable instruments processed in line with HTM 01-05 essential quality requirements.
- Workflow follows dirty-to-clean direction with no crossing.
- Daily, weekly, quarterly, and annual washer-disinfector and autoclave checks logged.
- Tracking system in place from patient back to sterilisation cycle.

## Environmental cleaning
- Clinical surfaces cleaned with [approved product] between patients.
- Daily, weekly, and deep-clean schedules documented and signed off.
- Waste segregated as clinical, offensive, sharps, and domestic per regulations.

## Sharps management
- Safe sharps used where reasonably practicable.
- Sharps disposed of immediately into compliant containers at point of use.
- Needlestick incidents managed under the sharps injury protocol and reported.

## Water quality (dental unit waterlines)
- Lines purged for [X] minutes start and end of session.
- [Disinfection product] used per manufacturer instructions.
- Annual microbiological testing carried out and recorded.

## Training
- All clinical staff complete IPC training annually.
- Records held by the practice manager and available for inspection.

## Audit
- Six-monthly IPC audit using the IPS or BDA template.
- Action plan from each audit reviewed at the next clinical governance meeting.

## Review
Reviewed annually or sooner if guidance changes. Next review: [Date].`,
  },

  SAFEGUARDING: {
    category: "SAFEGUARDING",
    title: "Safeguarding Policy",
    body: `## Purpose
[Practice Name] is committed to protecting children and adults at risk from abuse and neglect. This policy sets out our duties under the Children Act 1989/2004, Care Act 2014, and the Mental Capacity Act 2005.

## Safeguarding leads
- Children: [Name, Role, Contact]
- Adults at risk: [Name, Role, Contact]
- Deputy lead (when leads are unavailable): [Name, Role, Contact]

## What we mean by abuse
We recognise the categories of abuse and neglect set out in Working Together to Safeguard Children and the Care Act statutory guidance: physical, sexual, emotional, financial, neglect, domestic abuse, modern slavery, self-neglect, organisational, and discriminatory.

## Recognising concerns
Staff must be alert to:
- Unexplained injuries inconsistent with the patient's account
- Disclosures by a patient (direct or indirect)
- Behaviour or interactions that cause concern
- Repeated missed appointments for vulnerable patients
- Concerns raised by family members, carers, or other professionals

## What to do if you have a concern
1. Note what was said or observed in the patient's own words, factually, without interpretation. Record date, time, and who was present.
2. Speak to the safeguarding lead the same working day.
3. If the lead is unavailable and there is immediate risk, call 999 (emergency) or the local authority safeguarding team directly.
4. If you suspect the lead is implicated, escalate to the deputy lead or directly to the local authority.

## Confidentiality
Information about safeguarding concerns is shared only on a need-to-know basis. The patient is informed about referrals where it is safe to do so and would not place the patient or others at greater risk.

## External contacts
- Local children's social care: [Number]
- Local adult safeguarding team: [Number]
- Police (non-emergency): 101
- Police (emergency): 999
- NSPCC adult helpline: 0808 800 5000

## Training
- All staff complete safeguarding training appropriate to their role on induction and at refresher intervals (children: Level 2 for clinical, Level 3 for leads; adults: equivalent).
- Training records held by the practice manager.

## Recruitment
- DBS checks (enhanced where required) completed for all staff before they start.
- References obtained for all clinical and clinically-adjacent roles.

## Allegations against staff
Allegations against staff are managed under our separate allegations procedure. The Local Authority Designated Officer (LADO) is informed where the allegation concerns a child.

## Review
Reviewed annually. Next review: [Date].`,
  },

  COMPLAINTS: {
    category: "COMPLAINTS",
    title: "Complaints Policy",
    body: `## Purpose
[Practice Name] welcomes complaints as opportunities to improve. We aim to deal with complaints quickly, fairly, and in line with the NHS complaints procedure and our duty under CQC Regulation 16.

## Complaints lead
The Responsible Person for complaints is [Name, Role]. In their absence: [Deputy Name].

## How to make a complaint
Patients (or their representatives) can complain in any of the following ways:
- In person to any team member
- By phone to [Number]
- In writing to [Practice address]
- By email to [Practice complaints email]

We will accept complaints from third parties acting on behalf of a patient where appropriate consent is in place.

## Time limits
A complaint should normally be made within 12 months of the event or within 12 months of the complainant becoming aware of the matter. We may consider complaints outside this window where there is good reason.

## Acknowledgement
We will acknowledge every complaint within 3 working days of receipt, by the method the complainant prefers.

## Investigation and response
- The complaints lead investigates and produces a written response.
- We aim to send the full response within 28 days. If we need longer, we will write to explain why and set a revised date.
- The response sets out what we found, what we are doing about it, and the complainant's right to escalate.

## Escalation
If the complainant is not satisfied with our response, they may escalate:
- NHS care: Parliamentary and Health Service Ombudsman (0345 015 4033)
- Private care: Dental Complaints Service (08456 120 540)
- GDC concerns about a professional: General Dental Council (020 7167 6000)
- CQC concerns about service safety: enquiries@cqc.org.uk

## Confidentiality
Complaints are handled in strict confidence. Records are kept separately from clinical records and shared only on a need-to-know basis.

## Learning
- Every complaint is logged with category, outcome, and any actions agreed.
- The complaints log is reviewed at each clinical governance meeting to identify themes.
- An annual complaints summary is produced and reviewed by the partners/owner.

## Patient rights
Making a complaint will not affect the care a patient receives. Patients can ask for an advocate (e.g. NHS Independent Health Complaints Advocacy) to support them.

## Review
Reviewed annually. Next review: [Date].`,
  },

  INFORMATION_GOVERNANCE: {
    category: "INFORMATION_GOVERNANCE",
    title: "Information Governance and Data Protection Policy",
    body: `## Purpose
This policy sets out how [Practice Name] handles personal data lawfully and securely under UK GDPR and the Data Protection Act 2018.

## Data Protection Officer / lead
Our Information Governance Lead is [Name, Role]. ICO registration number: [Number].

## Lawful basis for processing
We process personal data on the following bases:
- Provision of dental care: Article 6(1)(b) (contract) and Article 9(2)(h) (health/social care)
- Public task for NHS work: Article 6(1)(e)
- Consent for marketing communications: Article 6(1)(a)
- Legal obligation for NHS billing and CQC reporting: Article 6(1)(c)

## Patient rights
We support every patient right under UK GDPR:
- Right to be informed (privacy notice)
- Right of access (DSAR — answered within 30 days)
- Right to rectification
- Right to erasure (subject to clinical retention rules)
- Right to restriction
- Right to data portability
- Right to object (especially to marketing)
- Rights relating to automated decision-making (we do not use these)

## DSAR (Data Subject Access Request) procedure
- Confirmed in writing on receipt and logged.
- Patient identity verified.
- Full export of records produced within 30 calendar days.
- No fee charged unless the request is manifestly excessive.
- DSARs are recorded and audit-logged in our practice management system.

## Retention
- Adult clinical records: 11 years after last visit, or until death + 11 years if known deceased.
- Children's records: until age 25, or age 26 if last record was at 17.
- Records under legal hold are not deleted regardless of date.
- Retention is enforced by our practice management system.

## Data breach reporting
- Any suspected personal data breach is reported to the IG lead immediately.
- We notify the ICO within 72 hours of becoming aware where the breach poses a risk to rights and freedoms.
- Patients are notified without undue delay where the breach is likely to result in high risk.

## Subcontractors and data sharing
- All third-party data processors have a written Data Processing Agreement (DPA).
- We share data with the NHSBSA for FP17 claims under our public-task basis.
- We do not sell or share patient data for marketing purposes.

## Staff training
- All staff complete IG training on induction and annually.
- Acceptable-use policy signed on joining.
- Passwords are unique, complex, and never shared.

## Security
- Devices are encrypted and password-protected.
- Access to clinical systems is role-based with audit logging.
- Multi-factor authentication where supported.
- Paper records (where they exist) are locked when unattended.

## Review
Reviewed annually. Next review: [Date].`,
  },

  EQUALITY_DIVERSITY: {
    category: "EQUALITY_DIVERSITY",
    title: "Equality, Diversity and Inclusion Policy",
    body: `## Purpose
[Practice Name] is committed to treating every patient, staff member, and visitor fairly and without discrimination. This policy aligns with the Equality Act 2010.

## Protected characteristics
We do not discriminate on the basis of:
- Age
- Disability
- Gender reassignment
- Marriage and civil partnership
- Pregnancy and maternity
- Race
- Religion or belief
- Sex
- Sexual orientation

## Reasonable adjustments
We make reasonable adjustments for patients with disabilities. This may include:
- Longer appointment slots
- Wheelchair access (the practice is/is not on the ground floor; lift access is/is not available)
- Easy-read materials on request
- BSL interpretation booked in advance
- Carer or advocate accompanying the patient

## Communication
- We offer translation through [provider] where English is not the patient's first language.
- Materials are available in large print on request.
- We do not rely on family members (especially children) to interpret for clinical conversations.

## Staff conduct
- Discriminatory language, behaviour, or conduct is not tolerated.
- Concerns are raised under our Whistleblowing or Disciplinary procedures.
- Recruitment is on merit; selection criteria are job-related.

## Patient feedback
- Patients can give feedback in any format, including with a friend or advocate.
- We log complaints by protected characteristic where the complainant tells us, to identify patterns.

## Review
Reviewed annually. Next review: [Date].`,
  },

  HEALTH_SAFETY: {
    category: "HEALTH_SAFETY",
    title: "Health and Safety Policy",
    body: `## Statement of intent
[Practice Name] is committed to providing a safe environment for patients, staff, and visitors. We comply with the Health and Safety at Work etc Act 1974 and associated regulations.

## Responsibilities
- The Practice Owner has overall responsibility for health and safety.
- The Health and Safety lead is [Name, Role].
- All staff are responsible for following safe systems of work and reporting hazards.

## Risk assessment
- Site-wide risk assessment reviewed annually or when circumstances change.
- Task-specific assessments for: COSHH substances, manual handling, lone working, expectant mothers.
- Action plans tracked to completion.

## COSHH (Control of Substances Hazardous to Health)
- COSHH inventory maintained for all hazardous substances on site (decon chemicals, mercury, X-ray developer if applicable).
- Safety data sheets accessible to all staff.
- Spill kits located in [areas]; staff trained in use.

## Fire safety
- Fire risk assessment reviewed annually.
- Fire alarms tested weekly, recorded in the fire log book.
- Emergency lighting and extinguishers serviced annually.
- Evacuation drills carried out [frequency].
- Fire warden: [Name].

## Electrical safety
- Fixed-wiring inspection every 5 years.
- PAT testing of portable appliances on a [frequency] cycle.
- Faulty equipment taken out of service immediately.

## First aid
- First aiders on site during practice hours: [Names].
- First aid kit located in [location], checked monthly.
- Defibrillator on site: [location]; staff trained in BLS + AED.

## Medical emergencies
- Practice keeps the BDA-recommended emergency drugs and equipment.
- Drugs checked monthly for expiry; log retained.
- All clinical staff complete medical emergencies training annually including CPR + AED.

## RIDDOR
- Reportable injuries, diseases, or dangerous occurrences are reported to the HSE under RIDDOR.
- Reports are made within the statutory timeframe by [Role/Name].
- Records kept for a minimum of 3 years.

## Sharps injuries
- Sharps injuries managed under the sharps injury protocol (separate document).
- Reported via RIDDOR where they meet the threshold.

## Display Screen Equipment (DSE)
- Reception and admin DSE assessments on joining and at change of circumstances.

## Review
Reviewed annually. Next review: [Date].`,
  },

  CLINICAL_GOVERNANCE: {
    category: "CLINICAL_GOVERNANCE",
    title: "Clinical Governance Policy",
    body: `## Purpose
[Practice Name] is committed to delivering high-quality clinical care through systematic governance. This policy aligns with CQC Regulation 17 and GDC Standards.

## Clinical governance lead
The clinical lead is [Name, Role]. The clinical governance meeting is held [frequency].

## Components of clinical governance
We address each component of clinical governance:
- Patient and public involvement
- Clinical effectiveness and audit
- Risk management
- Education and training
- Use of information
- Staff management

## Clinical audit
- A rolling audit programme covers at least: radiography, infection control, record-keeping, prescribing, treatment outcomes.
- Each audit follows the audit cycle (plan, measure, analyse, change, re-measure).
- Audit findings are discussed at clinical governance meetings.

## Significant event analysis
- Significant clinical events are reviewed structurally: what happened, why, what we learned, what we will change.
- Learning is shared with the team at clinical governance meetings.

## CPD and revalidation
- All clinicians maintain GDC-compliant CPD records.
- Hygienist + therapist scope of practice is documented and adhered to.
- Practice supports verifiable CPD relevant to clinicians' scope.

## Peer review
- Clinicians take part in peer review or case discussion sessions [frequency].
- Difficult cases are discussed in advance where possible.

## Prescribing
- Prescriptions follow current BNF / SDCEP guidance.
- Controlled drug prescribing follows separate controlled-drugs protocol.
- Patient counselling and warnings recorded for every prescription.

## Patient outcomes
- Failed treatments and complaints are reviewed for clinical themes.
- Recall intervals are individualised in line with NICE CG19.

## Whistleblowing and raising concerns
- Concerns about clinical practice can be raised under our Whistleblowing policy without fear of detriment.

## Review
Reviewed annually. Next review: [Date].`,
  },

  WHISTLEBLOWING: {
    category: "WHISTLEBLOWING",
    title: "Whistleblowing Policy",
    body: `## Purpose
[Practice Name] is committed to a culture of openness and accountability. This policy sets out how staff can raise concerns about wrongdoing and gives the legal protections of the Public Interest Disclosure Act 1998.

## What this policy covers
Concerns covered include (but are not limited to):
- Patient safety
- Fraud, financial impropriety, or corruption
- Breaches of CQC regulations or GDC standards
- Breaches of health and safety
- Cover-up of any of the above

## How to raise a concern (internal)
1. Speak to your line manager or the practice owner.
2. If that's not appropriate (the concern relates to them or you fear detriment), contact [Named alternative — usually a partner or trusted senior]. If still not appropriate, go directly to step 3.
3. External escalation (see below).

Concerns can be raised verbally or in writing. We prefer them in writing where practical so the facts can be considered carefully.

## How we will respond
- We will acknowledge your concern within 5 working days.
- We will tell you who is investigating, the expected timeframe, and how you will be updated.
- The investigation will be proportionate to the concern.

## External routes
Where internal routes are inappropriate or have not resolved the concern, you can raise it externally with the prescribed person/body:
- CQC: 03000 616161 (patient safety + regulation)
- GDC: 020 7167 6000 (professional conduct)
- NHS Counter Fraud Authority (fraud in NHS work)
- HSE (health and safety)
- ICO (data protection)

## Protection from detriment
- No staff member will suffer detriment for raising a concern in good faith.
- Confidentiality is maintained to the extent legally possible.
- Anonymous concerns are accepted but harder to investigate.

## Bad faith
This policy does not protect concerns raised maliciously, knowing them to be false, or for personal gain.

## Review
Reviewed annually. Next review: [Date].`,
  },

  CONSENT: {
    category: "CONSENT",
    title: "Consent Policy",
    body: `## Purpose
This policy sets out how [Practice Name] obtains, records, and respects patient consent in line with the Mental Capacity Act 2005, GDC Standards, and Montgomery v Lanarkshire (2015).

## Principles of valid consent
- Voluntary: given without pressure or coercion.
- Informed: the patient understands the proposed treatment, its risks, benefits, and reasonable alternatives (including no treatment).
- Capacity: the patient understands, retains, weighs, and communicates the decision.

## What we tell patients
For every proposed treatment we discuss:
- The nature of the procedure
- What it is expected to achieve
- Material risks (those a reasonable patient in this patient's circumstances would attach significance to)
- Reasonable alternatives, including no treatment
- The likely cost, including NHS vs private
- That consent may be withdrawn at any time

## Recording consent
- Consent is recorded in the patient's clinical record for every course of treatment.
- Written/electronic signed consent is taken for: sedation, X-rays, photography, treatment plans involving significant cost or risk.
- Verbal consent for routine examinations is documented in the clinical note.

## Children and young people
- Patients aged 16-17 are presumed to have capacity unless evidence suggests otherwise.
- Patients under 16 may consent if Gillick competent for the specific decision.
- Where the child is not Gillick competent, parental responsibility consent is sought.
- A child's refusal of treatment is taken seriously even where a parent consents.

## Adults lacking capacity
- Capacity is assessed for the specific decision at the specific time.
- Decisions are taken in the patient's best interests under the Mental Capacity Act 2005.
- Lasting Power of Attorney for Health and Welfare is checked where the patient lacks capacity.
- Independent Mental Capacity Advocate (IMCA) involvement considered for serious decisions where there is no family/carer.

## Withdrawal
- A patient may withdraw consent at any time, including during treatment.
- Where treatment must continue for safety reasons (e.g. mid-procedure), we stop as soon as safe to do so and document the conversation.

## Review
Reviewed annually. Next review: [Date].`,
  },

  BUSINESS_CONTINUITY: {
    category: "BUSINESS_CONTINUITY",
    title: "Business Continuity Policy",
    body: `## Purpose
This policy sets out how [Practice Name] continues to provide safe care and protect patient information in the event of significant disruption — for example IT failure, premises loss, staff shortages, utility failure, or pandemic.

## Lead
The business continuity lead is [Name, Role]. In their absence: [Deputy].

## Critical functions
Functions that must continue or be restored quickly:
- Access to clinical records and emergency information (medical alerts, allergies)
- Ability to triage patients in pain or acute clinical need
- Ability to take payments and submit NHS claims
- Communication with patients (cancellations, redirections)

## Specific scenarios and responses

### IT / practice management system failure
- Switch to read-only access via [tablet / offline backup].
- Emergency-only appointments continue using paper records.
- Suppliers contacted: [PMS support number], [internet supplier], [hosting provider].
- Restore from backup as soon as possible.

### Loss of premises
- Patients in pain triaged by phone and referred to [arrangement with neighbouring practice / NHS 111 dental triage].
- Notify NHS England area team within 24 hours if NHS work is affected.
- Communicate with patients via [SMS / website / social media].

### Staff shortages
- Minimum safe staffing levels: [list].
- Pre-agreed locum cover with [agency].
- Reduce to emergency-only sessions if needed.

### Utility failure (power / water)
- Patient safety prioritised: in-progress procedures completed safely or stabilised.
- Water failure prevents decontamination → patient care suspended until restored.
- Backup contacts: [supplier numbers].

### Cyber incident / ransomware
- Disconnect affected systems immediately.
- Notify the IG lead and [IT support provider].
- Report to ICO within 72 hours if personal data is at risk.
- Report to NCSC and Action Fraud.

## Communication
- Patient-facing message templates pre-drafted for SMS, voicemail, and website notice.
- Internal cascade via WhatsApp / phone tree maintained by reception manager.

## Testing
- Tabletop scenario exercised at least annually.
- Lessons learned fed back into this plan.

## Review
Reviewed annually or after any incident. Next review: [Date].`,
  },

  OTHER: {
    category: "OTHER",
    title: "Practice Policy",
    body: `## Purpose
[Briefly describe what this policy is for and which staff it applies to.]

## Scope
[List the situations, premises, or roles this policy covers.]

## Responsibilities
- [Who is accountable]
- [Who must follow this policy day-to-day]

## Policy
[Set out the rules, expectations, or procedures here. Use sub-headings as needed.]

## Related documents
- [List linked policies, procedures, or external standards]

## Review
Reviewed annually or sooner if circumstances change. Next review: [Date].`,
  },
};
