// Single source of truth shape for everything a practice configures.
// Each client has their own practice.config.ts built from this type.

export type WeekdayHours =
  | { closed: true }
  | { closed?: false; open: string; close: string };

export interface PracticeConfig {
  // Company / legal
  name: string;
  legalName: string;
  tagline: string;

  // Contact
  contact: {
    phone: string;
    email: string;
    bookingHostname: string; // public-facing hostname of the website itself
  };

  address: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    country: string;
    /** Used for JSON-LD geo + optional embedded map */
    coords?: { lat: number; lng: number };
  };

  hours: {
    mon: WeekdayHours;
    tue: WeekdayHours;
    wed: WeekdayHours;
    thu: WeekdayHours;
    fri: WeekdayHours;
    sat: WeekdayHours;
    sun: WeekdayHours;
  };

  // Visual brand + per-client CSS variables
  branding: {
    primaryRgb: string; // "15 118 110"
    primaryFgRgb: string; // "255 255 255"
    primarySoftRgb: string; // "204 251 241"
    accentRgb: string;
    accentFgRgb: string;
    logoUrl: string; // light logo (on dark backgrounds)
    logoDarkUrl?: string; // dark logo (on light backgrounds) — falls back to logoUrl
    faviconUrl: string;
    ogImageUrl: string;
  };

  // Hero (homepage)
  hero: {
    image: string; // full-resolution hero image
    imageMobile?: string; // optional smaller variant for mobile
    imageAlt: string;
    kicker?: string;
    headline: string;
    subheading: string;
    primaryCta: { label: string; to: string };
    secondaryCta?: { label: string; to: string };
  };

  about: {
    headline: string;
    body: string; // supports basic HTML: <p>, <strong>, <em>
    image?: string;
  };

  services: ServiceEntry[];
  team: TeamMember[];
  testimonials: Testimonial[];
  gallery?: GalleryItem[];

  // Optional toggles for big sections
  features: {
    guides: boolean;
    showGalleryOnHome: boolean;
    showTestimonials: boolean;
    /** When false, the /contact page shows Call + Email CTAs + info tiles
     *  (recommended for most practices). When true, renders a general
     *  enquiry form posting to contact-form-submit. Default: false. */
    contactForm: boolean;
  };

  social: {
    facebook?: string;
    instagram?: string;
    google?: string;
    twitter?: string;
    linkedin?: string;
  };

  // Target tenant Supabase for the real booking form + contact form
  supabase: {
    url: string;
    anonKey: string;
  };

  // Root SEO defaults (pages can override)
  seo: {
    siteTitle: string; // used as suffix in per-page titles, e.g. "Services | ORION"
    homeTitle: string;
    homeDescription: string;
    keywords: string[];
  };
}

export interface ServiceEntry {
  slug: string;
  name: string;
  shortDescription: string;
  /** Long-form body for the detail page (plain text or simple HTML) */
  body: string;
  keyInfo: Array<{ label: string; value: string }>;
  cardImage: string;
  heroImage?: string;
  galleryImages?: string[];
  faqs?: Array<{ question: string; answer: string }>;
}

export interface TeamMember {
  name: string;
  role: string;
  gdcNumber?: string;
  photo: string;
  bio?: string;
}

export interface Testimonial {
  quote: string;
  author: string;
  authorRole?: string;
  rating?: number; // 1-5
}

export interface GalleryItem {
  image: string;
  caption?: string;
}

/** Static site routes — used by the sitemap generator. */
export const STATIC_ROUTES = [
  "/",
  "/services",
  "/about",
  "/contact",
  "/book",
  "/privacy",
  "/cookies",
] as const;
