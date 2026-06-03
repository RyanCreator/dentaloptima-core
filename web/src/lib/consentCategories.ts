// Single source of truth for consent_template.category — the colour
// palette + display labels used by the editor list, the appointment
// detail badge, and the patient overview pill.

export interface CategoryMeta {
  value: string;
  label: string;
  /** Tailwind classes for the inline badge — kept in one place so the
   *  same colour shows up on the list row, the editor, and the patient
   *  overview without each consumer reinventing the palette. */
  badge: string;
  /** Subtle accent colour for the section header. */
  accent: string;
}

export const CONSENT_CATEGORIES: CategoryMeta[] = [
  {
    value: "CLINICAL_ROUTINE",
    label: "Clinical (routine)",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
    accent: "text-slate-700 dark:text-slate-300",
  },
  {
    value: "SURGICAL",
    label: "Surgical",
    badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    accent: "text-red-700 dark:text-red-300",
  },
  {
    value: "RESTORATIVE",
    label: "Restorative",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    accent: "text-blue-700 dark:text-blue-300",
  },
  {
    value: "COSMETIC",
    label: "Cosmetic",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
    accent: "text-pink-700 dark:text-pink-300",
  },
  {
    value: "ORTHODONTIC",
    label: "Orthodontic",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    accent: "text-purple-700 dark:text-purple-300",
  },
  {
    value: "PAEDIATRIC",
    label: "Paediatric",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    accent: "text-amber-800 dark:text-amber-200",
  },
  {
    value: "REGULATORY",
    label: "Regulatory",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "OTHER",
    label: "Other",
    badge: "bg-muted text-muted-foreground",
    accent: "text-muted-foreground",
  },
];

const CATEGORY_BY_VALUE = new Map(CONSENT_CATEGORIES.map((c) => [c.value, c]));

/** Returns the metadata for a category code; falls back to OTHER for
 *  unknown values so a typo in the DB doesn't crash the UI. */
export function categoryMeta(value: string | null | undefined): CategoryMeta {
  if (!value) return CATEGORY_BY_VALUE.get("OTHER")!;
  return CATEGORY_BY_VALUE.get(value) ?? CATEGORY_BY_VALUE.get("OTHER")!;
}

// Best-effort default category for each starter code we ship. Keyed by
// the consent_template.code values in lib/consentTemplateStarters.ts so
// imports get sensible categories out of the box.
export const STARTER_CATEGORY_DEFAULTS: Record<string, string> = {
  EXAMINATION_AND_TREATMENT: "CLINICAL_ROUTINE",
  RADIOGRAPHS: "CLINICAL_ROUTINE",
  LOCAL_ANAESTHETIC: "CLINICAL_ROUTINE",
  PERIODONTAL_TREATMENT: "CLINICAL_ROUTINE",
  EXTRACTION_SIMPLE: "SURGICAL",
  EXTRACTION_SURGICAL: "SURGICAL",
  SEDATION: "SURGICAL",
  ROOT_CANAL: "RESTORATIVE",
  CROWN_BRIDGE: "RESTORATIVE",
  DENTURES: "RESTORATIVE",
  DENTAL_IMPLANTS: "RESTORATIVE",
  TOOTH_WHITENING: "COSMETIC",
  VENEERS_BONDING: "COSMETIC",
  ORTHODONTICS_FIXED: "ORTHODONTIC",
  ORTHODONTICS_ALIGNERS: "ORTHODONTIC",
  PAEDIATRIC_PARENTAL: "PAEDIATRIC",
  CLINICAL_PHOTOGRAPHY: "REGULATORY",
  NHS_TERMS: "REGULATORY",
  MARKETING_COMMUNICATIONS: "REGULATORY",
  DATA_SHARING: "REGULATORY",
};
