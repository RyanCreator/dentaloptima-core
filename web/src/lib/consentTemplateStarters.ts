// Starter library of consent templates. Inserted into a practice's
// consent_template table on demand (Settings → Consent Templates →
// "Add starter library"). Each template ships as is_active = true but
// with NO service links — practice has to assign them to services
// before they appear on appointments, which forces a review pass.
//
// Each body opens with a "PRACTICE TO REVIEW" disclaimer so the
// reception team knows this is starter wording and ought to be
// reviewed by the principal dentist (and ideally a defence-union
// adviser) before being relied on for live consent.
//
// Source basis: drawn from GDC "Standards for the Dental Team" §3.1
// (Informed Consent), CQC consent guidance, and BDA member template
// scaffolding. Not legal advice; practices remain responsible for
// the final wording.

export interface ConsentTemplateStarter {
  code: string;
  title: string;
  version: string;
  body: string;
}

const DISCLAIMER = `> **PRACTICE TO REVIEW.** This is starter wording from the Dentaloptima
> library. Please review with your principal dentist and (where
> appropriate) your defence union before using with patients. Customise
> any practice-specific details — clinician names, in-house vs referred
> procedures, recovery instructions, fee structure — and bump the
> version once you're happy.

`;

export const CONSENT_TEMPLATE_STARTERS: ConsentTemplateStarter[] = [
  // 1. General examination + treatment ----------------------------------------
  {
    code: "EXAMINATION_AND_TREATMENT",
    title: "Examination and routine treatment",
    version: "v1",
    body: `${DISCLAIMER}I confirm that the dentist has examined my mouth and explained:

* the diagnosis and findings of today's examination
* the recommended treatment options, including the option of no treatment
* the expected benefits, possible risks, and likely outcomes of each option
* the fees I'll be charged and any choice between NHS and private treatment

I understand that:

* treatment may need to be adjusted once it has begun if the dentist finds something unexpected
* I can ask questions at any point and I can withdraw consent at any time
* dentistry is not an exact science and not all outcomes can be guaranteed

I confirm I have given the dentist accurate information about my medical history, medication, allergies, and any concerns I have.

By signing below I agree to the proposed examination and treatment.
`,
  },

  // 2. Dental radiographs (X-rays) -------------------------------------------
  {
    code: "RADIOGRAPHS",
    title: "Dental radiographs (X-rays)",
    version: "v1",
    body: `${DISCLAIMER}The dentist has recommended taking dental X-rays as part of my examination or treatment.

**Why we take X-rays.** X-rays help the dentist see what isn't visible during a normal examination — decay between teeth, problems below the gum, bone level, infections, and the position of teeth that haven't come through yet.

**What we need to know first.**

* The radiation dose from a single dental X-ray is very low — comparable to a few days of natural background radiation.
* X-rays are taken only when the diagnostic benefit clearly outweighs that small dose.
* **If you are pregnant or might be pregnant, please tell the dentist before any X-rays are taken.** We will normally postpone non-urgent imaging.

**My consent.** I confirm that the reason for taking these X-rays has been explained, my questions have been answered, and I agree to the X-rays the dentist has recommended today.
`,
  },

  // 3. Local anaesthetic -----------------------------------------------------
  {
    code: "LOCAL_ANAESTHETIC",
    title: "Local anaesthetic",
    version: "v1",
    body: `${DISCLAIMER}My treatment today will involve a local anaesthetic injection to numb the area being treated.

**What to expect.**

* A brief sting at the injection site, then the area going numb within a few minutes.
* Numbness usually wears off within 1–4 hours depending on the type of anaesthetic used.
* I'll be advised not to eat hot food or drink very hot drinks while I'm still numb, to avoid burns or biting my cheek/tongue without realising.

**Possible side effects.** These are uncommon but include:

* a small bruise where the needle was placed
* short-lived dizziness or fast heartbeat from the anaesthetic
* very rare allergic reactions — please tell the dentist if you have ever had a reaction to a local anaesthetic
* very rare prolonged numbness if a nerve has been irritated, usually resolves within a few weeks

I confirm the dentist has asked about my medical history including any heart conditions, allergies, and medications, and I have answered truthfully.

By signing below I agree to local anaesthetic being used for today's treatment.
`,
  },

  // 4. Simple extraction -----------------------------------------------------
  {
    code: "EXTRACTION_SIMPLE",
    title: "Tooth extraction (simple)",
    version: "v1",
    body: `${DISCLAIMER}I have been advised that one or more teeth need to be removed. The reason has been explained to me, along with the option of not removing the tooth and any alternatives that may be possible (such as root canal treatment, repair, or referral).

**What the procedure involves.** The dentist will numb the area with local anaesthetic and then loosen and remove the tooth using dental instruments. Most simple extractions take a few minutes once the area is fully numb.

**Possible risks and what to expect afterwards.**

* Bleeding from the socket for the first few hours — bite firmly on the gauze provided.
* Soreness and swelling for a few days — manage with painkillers as advised.
* Bruising of the cheek or jaw, especially with lower teeth.
* "Dry socket" (an inflamed socket) is uncommon but can happen, especially in smokers — we'll give you aftercare instructions to reduce the risk.
* Infection of the socket is rare but possible — please contact the practice if pain gets worse after 2–3 days, or if you develop a fever.
* A small piece of root may occasionally break and require a return visit.
* Numbness, tingling, or altered sensation of the lip, chin, or tongue is rare for upper teeth and uncommon for routine lower extractions, but can occur if a nerve is close to the tooth.

I confirm I have been given written aftercare advice and have had the chance to ask questions.

By signing below I agree to the extraction of the tooth or teeth the dentist has identified.
`,
  },

  // 5. Surgical extraction / wisdom teeth -----------------------------------
  {
    code: "EXTRACTION_SURGICAL",
    title: "Surgical extraction (including wisdom teeth)",
    version: "v1",
    body: `${DISCLAIMER}I understand that the tooth being removed today requires a surgical procedure (such as making a small cut in the gum, removing some bone around the tooth, or sectioning the tooth into pieces).

**What this involves.** The dentist will use local anaesthetic, make a small flap in the gum, gently remove some bone if needed, and remove the tooth. Stitches may be used and these are often dissolvable.

**Recovery.** Most patients have moderate swelling and discomfort for 3–7 days. I will be given written aftercare and prescribed any necessary medication. I'll need to plan for some rest after the appointment and avoid strenuous activity for 24–48 hours.

**Risks I should be aware of.**

* Pain, swelling, and bruising — usually peak at day 2–3.
* Bleeding — small amount of oozing is normal for the first day.
* "Dry socket" (delayed healing) — more common in lower wisdom teeth and in smokers.
* Infection of the surgical site.
* Limited mouth opening for a few days.
* **Numbness or altered sensation of the lower lip, chin, or tongue** — uncommon but a real risk with lower wisdom teeth because nerves run close. Usually temporary (resolving within weeks or months) but can rarely be permanent. The dentist will explain how the position of these nerves relates to your tooth based on the X-rays.
* Sinus communication — possible with upper back teeth; the dentist will explain if this applies.
* Damage to adjacent teeth or fillings — uncommon.

I confirm the dentist has discussed my X-rays with me, explained the position of any nearby nerves, and answered my questions.

By signing below I agree to the surgical removal the dentist has recommended.
`,
  },

  // 6. Root canal treatment --------------------------------------------------
  {
    code: "ROOT_CANAL",
    title: "Root canal treatment",
    version: "v1",
    body: `${DISCLAIMER}The dentist has explained that one of my teeth needs root canal treatment to save it.

**What this involves.** The pulp inside the tooth (containing nerves and blood vessels) has become inflamed or infected. The dentist will numb the tooth, make an opening, clean out the inside of the root canals, shape them, and fill them with a sealing material. A permanent filling and often a crown will be needed afterwards to protect the tooth.

**Number of visits and time.** Root canal treatment usually takes one or two appointments, each typically 60–90 minutes.

**Success rates.** Around 85–95% of root-treated teeth function well for many years. The success depends on the tooth, how badly it was damaged before treatment, and the restoration placed on top.

**Possible risks and limitations.**

* Mild discomfort for a few days afterwards is normal.
* Occasionally a tooth needs re-treatment if the infection persists.
* Very rarely a fine instrument can fracture inside the canal — the dentist will explain if this happens.
* Root-treated teeth become more brittle and usually need a crown — the dentist will discuss this with you.
* If the tooth can't be saved despite treatment, extraction may be necessary.

**Alternative.** Extracting the tooth is the main alternative. The dentist has discussed the options for replacing an extracted tooth (denture, bridge, implant, or no replacement) and the relative costs and benefits.

By signing below I agree to root canal treatment of the tooth identified, understanding that a follow-up restoration will be needed.
`,
  },

  // 7. Crown / bridge --------------------------------------------------------
  {
    code: "CROWN_BRIDGE",
    title: "Crown or bridge",
    version: "v1",
    body: `${DISCLAIMER}The dentist has recommended a crown or bridge.

**What's involved.**

* The tooth (or teeth) will be shaped down so that the new crown or bridge can fit over them.
* An impression or scan is taken and sent to the laboratory.
* A temporary crown or bridge is fitted while the permanent one is made.
* At the next visit (usually 1–2 weeks later) the permanent crown or bridge is cemented in place.

**What I should know.**

* Anaesthetic is normally used for the tooth-shaping appointment.
* The temporary crown may feel slightly different — it's not the final shape.
* The shade is chosen with you to match your other teeth.
* Crowns and bridges typically last 10–15 years with good oral hygiene, but lifespan varies.

**Possible risks and limitations.**

* The prepared tooth may become sensitive for a short time afterwards.
* In a small number of cases, the tooth's nerve becomes inflamed and root canal treatment may be needed later.
* The crown or bridge can come loose over time and need re-cementing.
* Bridges put extra load on the supporting teeth — looking after the gums and surrounding teeth is even more important.
* Material choices (porcelain, metal-ceramic, all-ceramic, zirconia) have been explained, with the trade-offs in strength, aesthetics, and cost.

By signing below I agree to the crown or bridge treatment the dentist has discussed with me.
`,
  },

  // 8. Sedation --------------------------------------------------------------
  {
    code: "SEDATION",
    title: "Conscious sedation",
    version: "v1",
    body: `${DISCLAIMER}My treatment today will involve conscious sedation to help me feel relaxed during the procedure.

**What sedation is.** I will remain conscious and able to respond to the dentist, but I will be relaxed and may have little memory of the procedure afterwards. Sedation is not a general anaesthetic.

**Before the appointment.**

* I will follow the fasting / eating instructions the practice gave me.
* I will bring a responsible adult (over 18) to escort me home and stay with me for at least the rest of the day.
* I confirm I have provided an accurate medical history including all medications and any allergies.

**On the day.**

* I must not drive, ride a bicycle, operate machinery, or sign any legally binding document for 24 hours after sedation.
* I must not drink alcohol or take recreational drugs for 24 hours.
* I will have someone with me at home for at least the rest of the day.

**Possible side effects.**

* Drowsiness for several hours afterwards.
* Slight nausea or headache.
* A bruise at the site of the cannula (if intravenous sedation).
* Allergic reactions are very rare; the team is trained to deal with them.

I confirm the dentist or sedationist has explained the type of sedation, asked about my medical history, and answered my questions. I understand the post-sedation instructions.

By signing below I agree to receive conscious sedation for today's treatment.
`,
  },

  // 9. Clinical photography --------------------------------------------------
  {
    code: "CLINICAL_PHOTOGRAPHY",
    title: "Clinical photography",
    version: "v1",
    body: `${DISCLAIMER}I understand the dentist would like to take clinical photographs of my teeth or face during treatment.

**Why we take them.** Photographs are used to:

* record the appearance of my teeth before, during, and after treatment
* help plan treatment, particularly for orthodontics, implants, and cosmetic work
* communicate with laboratories or specialists involved in my care
* enable comparison over time

**How they're stored.** Clinical photographs form part of my dental record and are stored securely and confidentially under the practice's data protection policies. They are only accessible to staff involved in my care.

**Other uses — your choice.** Please indicate below if you also consent to photographs being used for:

* teaching and training of dental staff (faces / identifying features will be obscured)
* anonymised case studies in professional journals or presentations
* anonymised before/after examples on the practice website or social media

I understand I can withdraw consent at any time for any of these additional uses, and that my decision will not affect my dental treatment.

By signing below I agree to clinical photographs being taken for the purposes I have ticked.
`,
  },

  // 10. NHS terms ------------------------------------------------------------
  {
    code: "NHS_TERMS",
    title: "NHS dental treatment terms",
    version: "v1",
    body: `${DISCLAIMER}I am receiving treatment under the National Health Service (NHS).

**Treatment bands and charges.** NHS dental treatment in England, Wales, or Northern Ireland is grouped into bands. The dentist has explained which band my course of treatment falls into and the current charge for that band, or whether I'm entitled to free treatment.

**Course of treatment.** My NHS treatment is a "course of treatment" — all the work needed to put my mouth into a stable, healthy condition. The course charge covers all visits within it. If new problems arise, the course may be extended or a new course may begin.

**Exemption.** I have confirmed whether or not I am exempt from NHS dental charges, and I will provide evidence (such as a tax credit award notice or maternity exemption certificate) if asked. I understand that making a false exemption claim is a criminal offence under the NHS dental charges regulations.

**Choice between NHS and private.** Where appropriate, the dentist has explained which treatments are available on the NHS and which are only available privately, including any difference in materials (e.g. tooth-coloured fillings on back teeth, premium crown materials). I have chosen which option I want.

**Failure to attend.** I understand that if I fail to attend without giving reasonable notice the practice may have to ask me to be seen on a private basis in future.

By signing below I confirm I have read these NHS terms and that the information I have given about my exemption status is correct.
`,
  },

  // 11. Dentures -------------------------------------------------------------
  {
    code: "DENTURES",
    title: "Dentures (partial or full)",
    version: "v1",
    body: `${DISCLAIMER}I have been advised that a denture is the most suitable option to replace my missing teeth, and the alternatives (no replacement, bridge, or implants) have been explained, along with the relative costs and benefits.

**What's involved.**

* Several visits are normally needed: impressions/scans, bite registration, "try-in" of the wax denture, and final fitting.
* The teeth, colour, and shape of the denture are agreed with you at the try-in stage.
* Adjustments after fitting are normal — sore spots and small reshaping appointments are part of the process.

**What to expect at first.**

* Dentures feel bulky for the first few weeks while you get used to them.
* Speech and eating take practice — start with soft foods and build up.
* Removable dentures should be taken out at night and cleaned daily.
* Even with a full denture, you should still attend regular check-ups so the dentist can examine your gums and remaining teeth.

**Limitations and risks.**

* Dentures are not as efficient as natural teeth — chewing tough foods can be more difficult.
* Lower dentures, especially full ones, may move during use; implant-retained options exist but are private and more costly.
* Gums shrink over time after teeth are lost — dentures may need to be relined or replaced every few years.
* Partial dentures put load on adjacent teeth; meticulous oral hygiene around the clasps is important to prevent decay.

By signing below I agree to the denture work the dentist has discussed with me.
`,
  },

  // 12. Dental implants ------------------------------------------------------
  {
    code: "DENTAL_IMPLANTS",
    title: "Dental implants",
    version: "v1",
    body: `${DISCLAIMER}The dentist has discussed dental implants as a way to replace one or more missing teeth, and the alternatives (denture, bridge, or no replacement) have been explained along with the costs and benefits of each.

**What an implant is.** A small titanium screw is placed into the jaw bone to act as a root. After healing, a crown, bridge, or denture is attached to the implant(s).

**What's involved.**

* An assessment appointment with X-rays and often a 3D CBCT scan to plan the placement.
* A minor surgical procedure under local anaesthetic (sedation is available privately if needed) to place the implant.
* A healing period of typically 3–6 months while the implant integrates with the bone.
* A second appointment to fit the final crown, bridge, or denture attachment.

**Success rates.** Around 95–98% of implants integrate successfully and remain functional for many years. Long-term success depends on excellent oral hygiene, regular maintenance, and not smoking.

**Risks I should be aware of.**

* Pain, swelling, and bruising for several days after surgery.
* Infection of the implant site — uncommon but possible.
* Failure of the implant to integrate with the bone (around 2–5%) — would need removal and possibly re-placement later.
* Damage to nearby nerves causing numbness of the lip, chin, or tongue (uncommon, may be temporary or rarely permanent — particularly for lower jaw implants).
* Communication with the sinus for upper-back implants (managed at placement).
* Bone loss around the implant over time, especially with poor hygiene or smoking (peri-implantitis).

**Maintenance.** I understand implants need lifelong care — at least twice-yearly hygiene visits, daily brushing and flossing/interdental cleaning around the implant, and avoidance of smoking which significantly reduces long-term success.

**Cost.** The fee structure has been explained, including the assessment, placement, restoration, and any sinus lift / bone graft that may be needed.

By signing below I agree to dental implant treatment as discussed.
`,
  },

  // 13. Fixed orthodontic appliances (braces) -------------------------------
  {
    code: "ORTHODONTICS_FIXED",
    title: "Fixed orthodontic appliances (braces)",
    version: "v1",
    body: `${DISCLAIMER}I have been advised that fixed braces are an appropriate way to straighten my teeth, and the alternatives (clear aligners, removable appliances, or no treatment) have been discussed.

**What's involved.**

* Brackets are bonded to the front of each tooth and connected with a wire that the orthodontist adjusts at each appointment.
* Active treatment typically takes 12–24 months depending on the complexity.
* Appointments every 4–8 weeks for adjustments.
* Retainers worn afterwards — sometimes for life — to keep the teeth straight.

**What to expect.**

* Mild discomfort for a few days after each adjustment.
* Soft diet for the first few days; avoid hard, sticky, or sugary foods for the duration of treatment.
* Speech may be affected briefly.
* Brushing and cleaning around the braces takes longer — interdental brushes and a particular technique will be demonstrated.

**Risks and limitations.**

* **Decalcification ("white spots") and decay** if oral hygiene is not excellent — this is the most common preventable problem.
* Gum inflammation, especially without thorough cleaning.
* Root resorption (slight shortening of tooth roots) — usually minor and clinically insignificant.
* Brackets coming loose, requiring extra visits.
* Treatment time may be longer than predicted; results depend on growth, anatomy, and patient cooperation.
* Relapse — teeth tend to move back without retainer use, which is why retainers are essential.

**Commitment.** I understand orthodontic treatment depends on me — keeping appointments, looking after my hygiene, avoiding foods that damage the braces, and wearing retainers as instructed afterwards.

By signing below I agree to fixed orthodontic treatment as discussed.
`,
  },

  // 14. Clear aligners (e.g. Invisalign) -----------------------------------
  {
    code: "ORTHODONTICS_ALIGNERS",
    title: "Clear aligner orthodontics",
    version: "v1",
    body: `${DISCLAIMER}I have been assessed for clear aligner treatment to straighten my teeth, and the alternatives (fixed braces or no treatment) have been discussed.

**What's involved.**

* Digital scan or impressions to design a custom series of clear plastic aligners.
* A new aligner every 1–2 weeks for typically 6–18 months depending on the case.
* Periodic in-practice review appointments.
* Small tooth-coloured "attachments" may be bonded to some teeth to help them move.
* Retainers worn after treatment — often nightly for life.

**My commitment.**

* Aligners must be worn at least **22 hours per day** — only removing them to eat, drink anything other than water, brush, or floss.
* Less than this and the teeth won't move as planned, extending or compromising treatment.
* Aligners must be cleaned and stored carefully when not in the mouth.

**Risks and limitations.**

* Decalcification ("white spots") and decay if hygiene is poor — water only with aligners in.
* Speech may be affected for the first few days of each aligner.
* Mild discomfort with each new aligner.
* Treatment may take longer than predicted, or may not achieve the planned movement, in which case refinement aligners or alternative treatment may be needed.
* Attachments can come off and need replacing.
* Relapse — without retainers the teeth tend to move back.

**Outcome.** Aligners are excellent for many cases but not every case — some severe rotations or movements are better suited to fixed braces. The dentist has discussed what is and isn't achievable for my case.

By signing below I agree to clear aligner treatment as discussed.
`,
  },

  // 15. Tooth whitening ------------------------------------------------------
  {
    code: "TOOTH_WHITENING",
    title: "Tooth whitening",
    version: "v1",
    body: `${DISCLAIMER}The dentist has assessed my suitability for tooth whitening and the procedure has been explained.

**What's involved.** Whitening uses a peroxide-based gel either at home in custom trays for 1–4 weeks, or in the chair, depending on the system chosen. The dentist will explain which is suitable for me.

**Important facts.**

* Whitening only lightens natural tooth tissue — it does **not** lighten existing fillings, crowns, veneers, or bridges. These may need to be replaced after whitening to match.
* The level of whitening achievable varies between people; results cannot be guaranteed.
* Tooth whitening in the UK is a prescription dental procedure and can only legally be carried out under a registered dental professional.

**Possible side effects.**

* Tooth sensitivity — usually short-lived but can persist for a few days.
* Gum irritation if the gel comes into prolonged contact with the gums — careful tray fit reduces this.
* Slight unevenness of result is normal because teeth take up whitening differently.
* Existing cracks or worn enamel may become more noticeable.

**Aftercare.**

* Avoid strongly coloured food and drink (tea, coffee, red wine, curry) for 24–48 hours after each whitening session.
* Top-up whitening may be needed every 1–2 years to maintain the result.

**Exclusions.** Whitening is not generally suitable during pregnancy or breastfeeding, for under-18s (except where prescribed as part of orthodontic treatment), or where there is untreated decay or gum disease.

By signing below I agree to tooth whitening as discussed.
`,
  },

  // 16. Veneers / composite bonding -----------------------------------------
  {
    code: "VENEERS_BONDING",
    title: "Veneers or composite bonding",
    version: "v1",
    body: `${DISCLAIMER}The dentist has discussed cosmetic improvement of my front teeth using **veneers** or **composite bonding**, including the differences between the options and the expected outcome.

**What each involves.**

* **Composite bonding** — tooth-coloured filling material shaped onto the tooth in a single visit, usually with little or no tooth preparation.
* **Porcelain veneers** — a thin shell of porcelain custom-made by a laboratory and bonded to the tooth. Usually requires some preparation (light reshaping of the front surface). Temporary veneers may be fitted between visits.

**What to expect.**

* The shade, shape, and length are agreed before any irreversible work starts.
* For veneers, a "wax-up" or digital mock-up may be used to preview the final appearance.
* Existing fillings, crowns, or restorations close to the area may need to be replaced for an even appearance.

**Risks and limitations.**

* **Veneers usually involve irreversible removal of some tooth tissue.** Once prepared, the tooth will always need a veneer or crown.
* The prepared tooth may become sensitive for a short time afterwards.
* In a small number of cases the tooth's nerve becomes inflamed and root canal treatment may be needed later.
* Veneers can chip, come loose, or stain at the margins over time — typical lifespan is 10–15 years.
* Composite bonding stains more readily than porcelain and may need polishing or refreshing every few years; expected lifespan 5–8 years.
* Excessive force (e.g. teeth grinding, nail biting, opening packets with teeth) can chip or fracture veneers and bonding.

**Maintenance.** A night guard may be recommended if there is any sign of grinding. Regular hygiene appointments help the longevity of the work.

By signing below I agree to the cosmetic treatment the dentist has discussed with me.
`,
  },

  // 17. Periodontal treatment ----------------------------------------------
  {
    code: "PERIODONTAL_TREATMENT",
    title: "Periodontal (gum) treatment",
    version: "v1",
    body: `${DISCLAIMER}I have been advised that I have periodontal disease (also called gum disease) and require treatment to control it.

**What this is.** Periodontal disease is a bacterial infection of the gums and bone that supports the teeth. Without treatment it can lead to loose teeth and tooth loss.

**What treatment involves.**

* A detailed measurement of my gum pockets ("periodontal charting").
* Thorough cleaning above and below the gum line by the dentist or hygienist, often over several visits.
* Local anaesthetic is sometimes used for deeper cleaning.
* Instruction in home care techniques (brushing, flossing, interdental brushes).
* Review appointments to remeasure pockets and monitor progress.
* In some cases, referral to a periodontist or minor gum surgery may be recommended.

**What to expect after treatment.**

* Gums may be tender for a few days.
* Some teeth may feel more sensitive, especially to cold, as the roots become exposed when inflamed gums settle. This usually improves.
* Slight bleeding for the first few days after each session is normal as inflammation resolves.
* Teeth may appear slightly longer because gums shrink back as they heal.
* Slight gaps may appear where inflamed gum tissue has reduced.

**Limitations and ongoing care.**

* Periodontal disease cannot be cured but can usually be controlled with treatment and ongoing maintenance.
* Long-term success depends on excellent daily oral hygiene at home and regular maintenance visits (typically every 3–4 months).
* Smoking significantly reduces the success of periodontal treatment.
* Some teeth may already be too far gone and may need to be extracted regardless of treatment.

By signing below I agree to the periodontal treatment plan the dentist or hygienist has discussed with me.
`,
  },

  // 18. Paediatric treatment (parental consent) -----------------------------
  {
    code: "PAEDIATRIC_PARENTAL",
    title: "Treatment of a child or young person",
    version: "v1",
    body: `${DISCLAIMER}I am the parent or legal guardian of the child / young person named on this consent. I confirm I have the legal authority to make decisions about their dental care.

**What I have been told.** The dentist has explained:

* the findings of today's examination
* the recommended treatment, including any alternatives and the option of no treatment
* the likely benefits, possible risks, and what to expect
* the choice of NHS and / or private options where relevant
* the fees, where they apply

**Young people aged 16–17.** I understand that in England, young people aged 16 or 17 are presumed to have capacity to consent to their own dental treatment. The dentist may seek consent from them directly while keeping me informed.

**Young people under 16 ("Gillick competence").** I understand that a child under 16 may sometimes be able to give consent to their own treatment if the dentist considers them to have sufficient understanding ("Gillick competent"). The dentist has explained when this might apply.

**Behaviour management.** If gentle, child-friendly behaviour management techniques are used (such as "tell-show-do", positive reinforcement, distraction, or the supportive presence of a parent), I consent to these.

**Photography.** If clinical photographs are needed as part of treatment planning or for the child's records, I consent (unless I have indicated otherwise on the photography consent).

**My role.** I will attend appointments with my child unless they are old enough to attend alone and the dentist has agreed. I will provide accurate medical history information and follow aftercare instructions on their behalf.

By signing below I confirm I am the parent or legal guardian and I agree to the dental treatment as discussed.
`,
  },

  // 19. Marketing communications -------------------------------------------
  {
    code: "MARKETING_COMMUNICATIONS",
    title: "Marketing communications (opt-in)",
    version: "v1",
    body: `${DISCLAIMER}This consent is separate from your dental treatment — your decision here will not affect the care you receive in any way.

**What this covers.** From time to time the practice may want to contact you with:

* news about the practice (new clinicians joining, new services, opening hours changes)
* offers, promotions, or seasonal campaigns
* health awareness messages (e.g. mouth cancer awareness month)
* invitations to feedback surveys or events

**This is separate from:**

* clinical reminders (recall, appointment confirmations, hygiene due) — we send these as part of providing your care, with a different lawful basis
* legal or safety messages (data breach notifications, recalls) — these are not marketing and don't require your opt-in

**How we'll contact you.** Tick the channels you're happy with:

☐ Email
☐ SMS
☐ Post
☐ Phone

**Your rights.** You can change your mind at any time by emailing us, calling reception, or clicking unsubscribe in any marketing email. We will action your opt-out within 5 working days.

**Data protection.** Your contact details are held in line with our privacy notice. We do **not** sell your data, and we only contact you directly — we don't share your details with third-party marketers.

By signing below I confirm my marketing preferences as ticked above.
`,
  },

  // 20. Data sharing for referrals + insurance -----------------------------
  {
    code: "DATA_SHARING",
    title: "Sharing your data for referrals and claims",
    version: "v1",
    body: `${DISCLAIMER}During the course of your dental care, we may need to share some of your clinical information with others. This consent explains what, when, and why — and what's already covered by other legal bases.

**What we always share without separate consent (because there is a legal or contractual basis):**

* NHS bodies — for NHS treatment claims and audit (NHS Business Services Authority)
* Dental laboratories — for prescriptions for your dentures, crowns, or appliances
* Care Quality Commission — during inspections or investigations
* Public Health England / UK Health Security Agency — for notifiable diseases

**What we may share with your explicit consent:**

* **Specialist dentists or hospitals** — if we refer you for treatment we cannot provide in-house (e.g. orthodontics, oral surgery, sedation), we will share relevant clinical records, x-rays, and your contact details.
* **Your GP or other doctors** — if your medical history is relevant to your dental treatment or vice versa.
* **Private dental insurance providers** — if you ask us to submit a claim on your behalf, we will share treatment details and supporting evidence.
* **Other dental practices** — if you transfer to another practice, we will share your records on request to ensure continuity of care.

**Your rights.** You can refuse consent for any of the above and we will respect that, although in some cases (e.g. referral) it may not be possible to proceed with the planned treatment.

**Our data protection commitments.** We share only the minimum information needed, by secure means, and in line with our privacy notice. You can request a copy of any record at any time under data protection law.

By signing below I agree that the practice may share my dental records and related information for the purposes above.
`,
  },
];
