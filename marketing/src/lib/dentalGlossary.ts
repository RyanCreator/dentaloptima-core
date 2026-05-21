// Patient-facing dental terminology. Plain language, no jargon — the
// audience is a patient who Googled a word their dentist used. Each entry
// has a short headline definition (1-2 sentences) and an optional longer
// explanation that the page can expand on hover/click.
//
// Categories help the page group related concepts. Slugs are anchor-link
// safe so each term gets its own URL fragment (e.g. `/glossary#crown`).
// That gives a single URL good SEO without exploding into per-term routes.

export type DentalGlossaryCategory =
  | "Anatomy & general"
  | "Hygiene & prevention"
  | "Fillings & restorations"
  | "Crowns, bridges & dentures"
  | "Root canal & endodontics"
  | "Gum (periodontal) treatment"
  | "Surgery & implants"
  | "Orthodontics"
  | "Cosmetic dentistry"
  | "Imaging & diagnostics"
  | "NHS & payment";

export interface DentalGlossaryEntry {
  slug: string;        // anchor-friendly id, e.g. "dental-crown"
  term: string;        // display label, e.g. "Crown"
  category: DentalGlossaryCategory;
  short: string;       // 1-2 sentence summary
  more?: string;       // optional longer explanation
  also?: string[];     // related terms (slugs) shown as chips
}

export const DENTAL_GLOSSARY: DentalGlossaryEntry[] = [
  // ─── Anatomy & general ────────────────────────────────────────────────
  {
    slug: "enamel",
    term: "Enamel",
    category: "Anatomy & general",
    short:
      "The hard, white outer layer of a tooth. It's the most mineralised tissue in the body and protects the softer layers underneath.",
    more:
      "Once enamel is worn away by acid, grinding, or decay, the body can't grow it back — so prevention matters. Fluoride helps remineralise tiny early breaches.",
  },
  {
    slug: "dentin",
    term: "Dentin",
    category: "Anatomy & general",
    short:
      "The yellow-ish layer of tooth that sits underneath the enamel. It's softer than enamel and makes up most of the tooth's structure.",
    more:
      "Dentin contains tiny tubes that connect to the nerve, which is why exposed dentin (from worn enamel or gum recession) often feels sensitive to hot, cold, or sweet things.",
    also: ["enamel", "sensitivity"],
  },
  {
    slug: "pulp",
    term: "Pulp",
    category: "Anatomy & general",
    short:
      "The soft inner tissue of a tooth that contains the nerves and blood vessels.",
    more:
      "When decay or trauma reaches the pulp, it can become inflamed or infected — that's when a root canal is usually needed.",
    also: ["root-canal", "abscess"],
  },
  {
    slug: "gums",
    term: "Gums (gingiva)",
    category: "Anatomy & general",
    short:
      "The pink tissue that surrounds and supports your teeth. Healthy gums are firm and don't bleed.",
    also: ["gingivitis", "periodontal-disease"],
  },
  {
    slug: "occlusion",
    term: "Occlusion / bite",
    category: "Anatomy & general",
    short:
      "How your upper and lower teeth meet when you close your mouth.",
    more:
      "An uneven bite (malocclusion) can lead to tooth wear, jaw discomfort, and headaches. Orthodontic treatment or adjustments to fillings can help.",
  },
  {
    slug: "plaque",
    term: "Plaque",
    category: "Anatomy & general",
    short:
      "A soft, sticky film of bacteria that forms on teeth — the main cause of decay and gum disease.",
    more:
      "Plaque is removed by brushing and flossing. Left in place, it hardens into tartar (calculus) which only a dental professional can remove.",
    also: ["tartar", "scale-and-polish"],
  },
  {
    slug: "tartar",
    term: "Tartar / calculus",
    category: "Anatomy & general",
    short:
      "Hardened plaque that's bonded to the tooth. Brushing won't remove it — your hygienist scrapes or ultrasonically cleans it off.",
    also: ["plaque", "scale-and-polish"],
  },
  {
    slug: "sensitivity",
    term: "Tooth sensitivity",
    category: "Anatomy & general",
    short:
      "Sharp pain in a tooth in response to hot, cold, sweet, or acidic things. Usually caused by exposed dentin.",
    more:
      "Common causes: worn enamel, receding gums, cracked teeth, or recent dental work. Sensitivity toothpaste and fluoride varnish can help; persistent sensitivity should be checked.",
    also: ["dentin", "enamel"],
  },

  // ─── Hygiene & prevention ─────────────────────────────────────────────
  {
    slug: "scale-and-polish",
    term: "Scale and polish",
    category: "Hygiene & prevention",
    short:
      "A professional clean — your hygienist removes plaque and tartar from above the gumline, then polishes the teeth smooth.",
    more:
      "Usually painless. Recommended every 6-12 months for most people, more often if you're prone to gum disease.",
    also: ["plaque", "tartar"],
  },
  {
    slug: "fluoride-varnish",
    term: "Fluoride varnish",
    category: "Hygiene & prevention",
    short:
      "A concentrated fluoride coating painted onto the teeth to strengthen enamel and prevent decay.",
    more:
      "Quick, painless, and especially valuable for children and adults at higher risk of cavities.",
  },
  {
    slug: "fissure-sealant",
    term: "Fissure sealant",
    category: "Hygiene & prevention",
    short:
      "A thin plastic coating applied to the deep grooves on the chewing surfaces of back teeth — fills the grooves so food and bacteria can't lodge there.",
    more:
      "Most commonly placed on children's permanent molars shortly after they come through.",
  },
  {
    slug: "interdental-cleaning",
    term: "Interdental cleaning",
    category: "Hygiene & prevention",
    short:
      "Cleaning between the teeth with floss, interdental brushes, or a water flosser. Brushing alone misses about 40% of the tooth surfaces.",
  },

  // ─── Fillings & restorations ──────────────────────────────────────────
  {
    slug: "filling",
    term: "Filling (restoration)",
    category: "Fillings & restorations",
    short:
      "Material used to repair a tooth after decay has been removed.",
    more:
      "Modern fillings are usually tooth-coloured composite resin; amalgam (silver) fillings are still occasionally used in NHS work on back teeth.",
    also: ["composite-filling", "amalgam-filling"],
  },
  {
    slug: "composite-filling",
    term: "Composite filling",
    category: "Fillings & restorations",
    short:
      "Tooth-coloured plastic-and-glass filling that bonds to the tooth. Used for both front and back teeth.",
    more:
      "Set with a blue curing light. Strong, natural-looking, and conservative — the dentist removes less healthy tooth than for amalgam.",
  },
  {
    slug: "amalgam-filling",
    term: "Amalgam filling",
    category: "Fillings & restorations",
    short:
      "Silver-coloured filling made of a metal mix. Hard-wearing, often used on NHS back teeth.",
    more:
      "Safe and effective but cosmetically obvious. From 2025, new EU and UK rules restrict its use except where clinically necessary.",
  },
  {
    slug: "inlay-onlay",
    term: "Inlay / onlay",
    category: "Fillings & restorations",
    short:
      "A custom-made filling crafted in a lab from porcelain, gold, or composite, then bonded onto the tooth.",
    more:
      "Used when a tooth needs more than a simple filling but doesn't yet need a crown. Stronger and longer-lasting than a direct filling.",
  },

  // ─── Crowns, bridges & dentures ───────────────────────────────────────
  {
    slug: "crown",
    term: "Crown (cap)",
    category: "Crowns, bridges & dentures",
    short:
      "A custom-made cover that fits over a damaged or root-treated tooth, restoring its shape, strength, and appearance.",
    more:
      "Materials: porcelain (most natural-looking), porcelain-fused-to-metal, gold, or zirconia. Usually two visits unless the practice has same-day technology.",
    also: ["root-canal", "bridge"],
  },
  {
    slug: "bridge",
    term: "Bridge",
    category: "Crowns, bridges & dentures",
    short:
      "A fixed replacement for one or more missing teeth, anchored to crowns on the natural teeth either side.",
    more:
      "Cemented permanently — patients can't remove it themselves. An alternative to a denture or implant for filling a gap.",
    also: ["crown", "implant"],
  },
  {
    slug: "denture",
    term: "Denture",
    category: "Crowns, bridges & dentures",
    short:
      "A removable replacement for missing teeth and surrounding gum. Can be full (all teeth) or partial (some teeth).",
    more:
      "Modern dentures look natural and fit comfortably; implant-retained dentures clip onto implants for a more secure fit.",
  },

  // ─── Root canal & endodontics ─────────────────────────────────────────
  {
    slug: "root-canal",
    term: "Root canal treatment",
    category: "Root canal & endodontics",
    short:
      "A treatment to save a tooth whose nerve has become infected or damaged. The dentist removes the infected pulp, cleans the canals, and fills them.",
    more:
      "Modern root canals are usually no more uncomfortable than a filling. They typically take 1-2 appointments. A crown is often placed afterwards to protect the tooth.",
    also: ["pulp", "abscess", "crown"],
  },
  {
    slug: "abscess",
    term: "Dental abscess",
    category: "Root canal & endodontics",
    short:
      "A pocket of pus caused by a bacterial infection in or around a tooth. Symptoms: severe throbbing pain, swelling, sensitivity to pressure.",
    more:
      "Needs urgent care. Treatment is usually drainage plus root canal or extraction, sometimes with antibiotics if the infection is spreading.",
    also: ["root-canal", "extraction"],
  },

  // ─── Gum treatment ────────────────────────────────────────────────────
  {
    slug: "gingivitis",
    term: "Gingivitis",
    category: "Gum (periodontal) treatment",
    short:
      "Early-stage gum disease. Gums are red, swollen, and bleed easily — but the supporting bone isn't yet affected.",
    more:
      "Reversible with better brushing, interdental cleaning, and a professional scale and polish.",
    also: ["periodontal-disease", "scale-and-polish"],
  },
  {
    slug: "periodontal-disease",
    term: "Periodontal disease",
    category: "Gum (periodontal) treatment",
    short:
      "Advanced gum disease where the infection has spread beneath the gum and started destroying the bone that holds teeth in place.",
    more:
      "Treated with deep cleaning (root surface debridement), improved home care, and sometimes minor surgery. Untreated periodontitis is the most common cause of tooth loss in adults.",
    also: ["gingivitis"],
  },

  // ─── Surgery & implants ───────────────────────────────────────────────
  {
    slug: "extraction",
    term: "Extraction",
    category: "Surgery & implants",
    short:
      "Removal of a tooth. Done under local anaesthetic; sometimes with sedation for anxious patients or complex cases.",
    more:
      "Simple extractions use forceps; surgical extractions (e.g. for impacted wisdom teeth) involve a small incision and sometimes splitting the tooth to remove it gently.",
    also: ["wisdom-teeth", "sedation"],
  },
  {
    slug: "wisdom-teeth",
    term: "Wisdom teeth",
    category: "Surgery & implants",
    short:
      "The third (back) molars, which usually come through between ages 17 and 25. They often need removing if there isn't space, or if they're impacted.",
    more:
      "NICE guidelines say wisdom teeth should only be removed if there's a clear clinical reason — pain, repeated infection, decay, or damage to neighbouring teeth.",
  },
  {
    slug: "implant",
    term: "Dental implant",
    category: "Surgery & implants",
    short:
      "A small titanium screw placed in the jawbone to replace the root of a missing tooth. A crown, bridge, or denture is then attached on top.",
    more:
      "The bone fuses with the implant over 3-6 months (osseointegration). Implants are the closest thing to a natural tooth replacement available today.",
    also: ["bone-graft", "crown", "denture"],
  },
  {
    slug: "bone-graft",
    term: "Bone graft",
    category: "Surgery & implants",
    short:
      "A procedure to add bone to the jaw — usually before an implant if the existing bone is too thin to support it.",
    more:
      "Graft material may be synthetic, from another part of the body, or from a donor source. Healing typically takes 4-6 months before the implant goes in.",
    also: ["implant"],
  },
  {
    slug: "sedation",
    term: "Conscious sedation",
    category: "Surgery & implants",
    short:
      "Medication used to make a patient deeply relaxed and less aware of the procedure, while staying conscious and able to respond.",
    more:
      "Common for anxious patients or longer procedures. You'll need a responsible adult to take you home and stay with you afterwards.",
  },

  // ─── Orthodontics ─────────────────────────────────────────────────────
  {
    slug: "braces",
    term: "Braces (fixed appliance)",
    category: "Orthodontics",
    short:
      "Brackets bonded to the teeth, connected by a wire that's adjusted over time to move teeth into position.",
    more:
      "Available in metal, ceramic (tooth-coloured), or lingual (behind the teeth). Treatment usually takes 12-24 months.",
    also: ["aligners", "retainer"],
  },
  {
    slug: "aligners",
    term: "Clear aligners",
    category: "Orthodontics",
    short:
      "A series of nearly-invisible, removable plastic trays that gradually move teeth. Brands include Invisalign and ClearCorrect.",
    more:
      "Each tray is worn for ~1-2 weeks. Best for mild-to-moderate crowding and spacing; not always suitable for complex bite problems.",
    also: ["braces", "retainer"],
  },
  {
    slug: "retainer",
    term: "Retainer",
    category: "Orthodontics",
    short:
      "An appliance worn after braces or aligners to stop the teeth from drifting back. Fixed (bonded wire) or removable.",
    more:
      "Teeth always have some tendency to move, so most orthodontists recommend wearing a retainer indefinitely — full-time at first, then nights only.",
  },

  // ─── Cosmetic ─────────────────────────────────────────────────────────
  {
    slug: "veneer",
    term: "Veneer",
    category: "Cosmetic dentistry",
    short:
      "A thin shell of porcelain or composite bonded to the front of a tooth to improve its colour, shape, or alignment.",
    more:
      "Porcelain veneers are more durable and stain-resistant; composite veneers are cheaper and can usually be done in one visit.",
  },
  {
    slug: "whitening",
    term: "Tooth whitening",
    category: "Cosmetic dentistry",
    short:
      "A safe lightening treatment that uses peroxide gel to remove stains from inside the tooth. Can be done in-surgery or with at-home trays.",
    more:
      "By law in the UK, only registered dental professionals can legally provide whitening. Beware of beauty salons or kiosks offering it.",
  },
  {
    slug: "bonding",
    term: "Composite bonding",
    category: "Cosmetic dentistry",
    short:
      "A tooth-coloured resin applied and shaped directly onto the tooth in a single visit, to fix chips, gaps, or small cosmetic issues.",
    more:
      "Less invasive than veneers and reversible, but doesn't last as long — usually 3-7 years before needing a refresh.",
  },

  // ─── Imaging & diagnostics ────────────────────────────────────────────
  {
    slug: "x-ray",
    term: "X-ray (radiograph)",
    category: "Imaging & diagnostics",
    short:
      "A low-dose image that shows what your dentist can't see by eye — decay between teeth, bone level, abscesses, impacted teeth.",
    more:
      "Modern digital X-rays use a tiny fraction of the radiation of older film X-rays. Frequency is decided patient-by-patient based on risk.",
  },
  {
    slug: "opg",
    term: "OPG (panoramic X-ray)",
    category: "Imaging & diagnostics",
    short:
      "A single wide image that captures all your teeth, both jaws, and the surrounding bone.",
    more:
      "Useful for planning extractions, implants, orthodontics, and for spotting cysts or impacted teeth.",
  },
  {
    slug: "intra-oral-scan",
    term: "Intra-oral scan",
    category: "Imaging & diagnostics",
    short:
      "A digital 3D scan of your teeth taken with a small wand — replaces the traditional gloopy impression material.",
    more:
      "Used to design crowns, veneers, aligners, and retainers. Faster, more comfortable, and more accurate than putty impressions.",
  },

  // ─── NHS & payment ────────────────────────────────────────────────────
  {
    slug: "nhs-band-1",
    term: "NHS band 1",
    category: "NHS & payment",
    short:
      "The lowest NHS dental charge band. Covers examination, diagnosis, advice, X-rays, and a scale and polish if needed.",
  },
  {
    slug: "nhs-band-2",
    term: "NHS band 2",
    category: "NHS & payment",
    short:
      "Covers everything in band 1 plus fillings, extractions, and root canal treatment — for one fixed price per course of treatment.",
  },
  {
    slug: "nhs-band-3",
    term: "NHS band 3",
    category: "NHS & payment",
    short:
      "Covers everything in bands 1 and 2 plus lab-made items like crowns, bridges, and dentures — again, one fixed price per course.",
  },
  {
    slug: "nhs-exemption",
    term: "NHS exemption",
    category: "NHS & payment",
    short:
      "Reasons you don't pay an NHS dental charge — under 18, in full-time education up to age 19, pregnant or recently had a baby, on certain benefits, or on the NHS low-income scheme.",
    more:
      "You'll need to show evidence at the appointment. If you claim incorrectly, NHSBSA will follow up and may charge a penalty.",
  },
  {
    slug: "private-treatment",
    term: "Private treatment",
    category: "NHS & payment",
    short:
      "Treatment paid for outside NHS bands, usually because it's cosmetic, uses premium materials, or isn't available on the NHS in your area.",
    more:
      "Your dentist will give you a written treatment plan with itemised costs before any private work begins.",
  },
];

/** Convenience: terms grouped by category, in the category order declared
 *  above. Used by the glossary page to render section-by-section. */
export function groupedByCategory(): Array<{
  category: DentalGlossaryCategory;
  entries: DentalGlossaryEntry[];
}> {
  const order: DentalGlossaryCategory[] = [
    "Anatomy & general",
    "Hygiene & prevention",
    "Fillings & restorations",
    "Crowns, bridges & dentures",
    "Root canal & endodontics",
    "Gum (periodontal) treatment",
    "Surgery & implants",
    "Orthodontics",
    "Cosmetic dentistry",
    "Imaging & diagnostics",
    "NHS & payment",
  ];
  return order.map((cat) => ({
    category: cat,
    entries: DENTAL_GLOSSARY.filter((e) => e.category === cat),
  }));
}
