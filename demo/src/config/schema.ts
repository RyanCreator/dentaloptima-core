import { z } from "zod";

// Runtime validation for practice.config.ts. Runs once at app boot. A bad
// config is the #1 source of onboarding-pain — a typo in a slug or a missing
// image path produces confusing renders deep inside components, so we fail
// loud here with a precise field path instead.

const hoursEntrySchema = z.union([
  z.object({ closed: z.literal(true) }),
  z.object({
    closed: z.literal(false).optional(),
    open: z.string().regex(/^\d{2}:\d{2}$/, "hours must be HH:mm (e.g. 09:00)"),
    close: z.string().regex(/^\d{2}:\d{2}$/, "hours must be HH:mm (e.g. 17:30)"),
  }),
]);

const rgbTripletSchema = z
  .string()
  .regex(/^\d{1,3} \d{1,3} \d{1,3}$/, "must be three space-separated 0-255 numbers, e.g. '15 118 110'");

const urlPathSchema = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("/") || v.startsWith("http"), {
    message: "must be an absolute path (/foo) or full URL",
  });

const keyInfoSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const serviceSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, and hyphens only"),
  name: z.string().min(1),
  shortDescription: z.string().min(1),
  body: z.string().min(1),
  keyInfo: z.array(keyInfoSchema),
  cardImage: urlPathSchema,
  heroImage: urlPathSchema.optional(),
  galleryImages: z.array(urlPathSchema).optional(),
  faqs: z.array(faqSchema).optional(),
});

const teamMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  gdcNumber: z.string().optional(),
  photo: urlPathSchema,
  bio: z.string().optional(),
});

const testimonialSchema = z.object({
  quote: z.string().min(1),
  author: z.string().min(1),
  authorRole: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

const gallerySchema = z.object({
  image: urlPathSchema,
  caption: z.string().optional(),
});

export const practiceConfigSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().min(1),
  tagline: z.string().min(1),
  contact: z.object({
    phone: z.string().min(1),
    email: z.string().email(),
    bookingHostname: z
      .string()
      .regex(/^[a-z0-9.-]+$/i, "hostname only — no scheme or path (e.g. 'smile-co.co.uk')"),
  }),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    postcode: z.string().min(1),
    country: z.string().min(1),
    coords: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
  }),
  hours: z.object({
    mon: hoursEntrySchema,
    tue: hoursEntrySchema,
    wed: hoursEntrySchema,
    thu: hoursEntrySchema,
    fri: hoursEntrySchema,
    sat: hoursEntrySchema,
    sun: hoursEntrySchema,
  }),
  branding: z.object({
    primaryRgb: rgbTripletSchema,
    primaryFgRgb: rgbTripletSchema,
    primarySoftRgb: rgbTripletSchema,
    accentRgb: rgbTripletSchema,
    accentFgRgb: rgbTripletSchema,
    logoUrl: urlPathSchema,
    logoDarkUrl: urlPathSchema.optional(),
    faviconUrl: urlPathSchema,
    ogImageUrl: urlPathSchema,
  }),
  hero: z.object({
    image: urlPathSchema,
    imageMobile: urlPathSchema.optional(),
    imageAlt: z.string().min(1),
    kicker: z.string().optional(),
    headline: z.string().min(1),
    subheading: z.string().min(1),
    primaryCta: z.object({ label: z.string().min(1), to: z.string().min(1) }),
    secondaryCta: z.object({ label: z.string().min(1), to: z.string().min(1) }).optional(),
  }),
  about: z.object({
    headline: z.string().min(1),
    body: z.string().min(1),
    image: urlPathSchema.optional(),
  }),
  services: z.array(serviceSchema).min(1, "at least one service is required"),
  team: z.array(teamMemberSchema),
  testimonials: z.array(testimonialSchema),
  gallery: z.array(gallerySchema).optional(),
  features: z.object({
    guides: z.boolean(),
    showGalleryOnHome: z.boolean(),
    showTestimonials: z.boolean(),
    contactForm: z.boolean(),
  }),
  social: z.object({
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    google: z.string().optional(),
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
  }),
  supabase: z.object({
    url: z.string(),
    anonKey: z.string(),
  }),
  seo: z.object({
    siteTitle: z.string().min(1),
    homeTitle: z.string().min(1),
    homeDescription: z.string().min(1),
    keywords: z.array(z.string()),
  }),
});

export interface ValidationResult {
  ok: boolean;
  errors: Array<{ path: string; message: string }>;
}

/** Validate a config object. Returns structured errors rather than throwing
 *  so the caller can decide how to surface them (console + UI banner etc). */
export function validatePracticeConfig(value: unknown): ValidationResult {
  const result = practiceConfigSchema.safeParse(value);
  if (result.success) return { ok: true, errors: [] };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/** Dev-only warning: services[n].galleryImages / heroImage referenced from
 *  the config but no corresponding file in /public. We can't do a filesystem
 *  check at runtime — Vite bundles the config — but this is a placeholder
 *  for a future build-time check that greps for missing assets. */
export function assertConfigSane(value: unknown): void {
  const { ok, errors } = validatePracticeConfig(value);
  if (ok) return;
  // eslint-disable-next-line no-console
  console.error(
    "[practice.config] ❌ Config validation failed. Fix these before deploying:"
  );
  for (const err of errors) {
    // eslint-disable-next-line no-console
    console.error(`  • ${err.path || "(root)"}: ${err.message}`);
  }
}
