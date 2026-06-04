import type { PracticeConfig } from "./types";

// =============================================================================
// Orion Dental Practice — demo config for the template
// =============================================================================
// Fictional practice used when the template is shown standalone or in demos.
//
// For a real client deployment, two options:
//   1. Copy this file into client-sites/clients/<slug>/src/config/ and
//      edit it directly (recommended for nested content like services,
//      team, testimonials).
//   2. Override the simple top-level fields via .env.local — see
//      .env.example for the supported VITE_PRACTICE_* names. Anything
//      env-driven below falls back to the Orion default if the env var
//      is empty/unset, so existing demos keep working unchanged.
// =============================================================================

const env = import.meta.env;
const numEnv = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const lat = numEnv(env.VITE_PRACTICE_ADDR_LAT);
const lng = numEnv(env.VITE_PRACTICE_ADDR_LNG);

export const practice: PracticeConfig = {
  name: env.VITE_PRACTICE_NAME || "Orion Dental Practice",
  legalName: env.VITE_PRACTICE_LEGAL_NAME || "Orion Dental Ltd",
  tagline:
    env.VITE_PRACTICE_TAGLINE ||
    "Modern, welcoming dental care in the heart of Yorkshire",

  contact: {
    // Demo defaults route to Dentaloptima's own contact channels so any
    // enquiry from a prospect browsing the demo lands with us. The
    // VITE_PRACTICE_* envs let real client deployments override per-tenant.
    phone: env.VITE_PRACTICE_PHONE || "01422 728022",
    email: env.VITE_PRACTICE_EMAIL || "demo@dentaloptima.co.uk",
    bookingHostname:
      env.VITE_PRACTICE_BOOKING_HOSTNAME || "app.demo.dentaloptima.co.uk",
  },

  address: {
    line1: env.VITE_PRACTICE_ADDR_LINE1 || "Horley Green House",
    line2: env.VITE_PRACTICE_ADDR_LINE2 || undefined,
    city: env.VITE_PRACTICE_ADDR_CITY || "Halifax",
    postcode: env.VITE_PRACTICE_ADDR_POSTCODE || "HX3 6AS",
    country: env.VITE_PRACTICE_ADDR_COUNTRY || "United Kingdom",
    // Halifax — Horley Green Lane area. Approximate; precise coords aren't
    // critical because the embedded map uses the textual address as its
    // search query rather than these.
    coords:
      lat !== undefined && lng !== undefined
        ? { lat, lng }
        : { lat: 53.7267, lng: -1.8644 },
  },

  // Demo hours mirror Dentaloptima's office hours (Mon–Fri 9–5, closed
  // weekends) so prospects calling the listed number reach us. Real
  // client practices override this with their actual opening hours.
  hours: {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" },
    thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
    sat: { closed: true },
    sun: { closed: true },
  },

  branding: {
    primaryRgb: env.VITE_PRACTICE_PRIMARY_RGB || "15 118 110", // teal demo
    primaryFgRgb: env.VITE_PRACTICE_PRIMARY_FG_RGB || "255 255 255",
    primarySoftRgb: env.VITE_PRACTICE_PRIMARY_SOFT_RGB || "204 251 241",
    accentRgb: env.VITE_PRACTICE_ACCENT_RGB || "20 184 166",
    accentFgRgb: env.VITE_PRACTICE_ACCENT_FG_RGB || "255 255 255",
    logoUrl: "/logo-light.svg",
    logoDarkUrl: "/logo-dark.svg",
    faviconUrl: "/favicon.svg",
    ogImageUrl: "/og.svg",
  },

  hero: {
    image: "/hero/hero-desktop.webp",
    imageMobile: "/hero/hero-mobile.webp",
    imageAlt: "A patient smiling in the warm evening light",
    kicker: "Dentistry done properly",
    headline: "Gentle, modern dental care your whole family will love",
    subheading:
      "NHS and private appointments at Orion Dental. Same-day emergency slots. Book online in under a minute, any time of day.",
    primaryCta: { label: "Book an appointment", to: "/book" },
    secondaryCta: { label: "See our services", to: "/services" },
  },

  about: {
    headline: "A calm, modern practice, built around you.",
    body:
      "<p>We've been looking after Halifax families since 2014. Our team of GDC-registered clinicians combine modern techniques with a friendly, no-judgement atmosphere — so whether it's a routine check-up, a cosmetic makeover, or a long-overdue return visit, you'll feel at ease from the moment you walk in.</p><p>We run private and NHS lists side by side, so you can choose what suits your family best.</p>",
    image: "/about/about-practice.webp",
  },

  services: [
    {
      slug: "check-up-and-clean",
      name: "Check-up & Clean",
      shortDescription:
        "A full oral health exam with scale and polish. The foundation of a healthy smile.",
      body:
        "<p>Every visit starts with a thorough examination by one of our dentists. We check each tooth and your gums, take digital X-rays where needed, and screen for early signs of decay, gum disease, and oral cancer. A hygienist-led scale and polish leaves you feeling refreshed and squeaky-clean.</p><p>We recommend check-ups every 6 months for most adults, or more often if your dentist suggests it.</p>",
      keyInfo: [
        { label: "Duration", value: "30 minutes" },
        { label: "From", value: "£45 private / NHS band 1" },
        { label: "Recall", value: "Every 6 months" },
      ],
      cardImage: "/services/check-up-and-clean-card.svg",
      heroImage: "/services/check-up-and-clean-hero.svg",
      galleryImages: [
        "/services/check-up-and-clean-1.svg",
        "/services/check-up-and-clean-2.svg",
        "/services/check-up-and-clean-3.svg",
      ],
      faqs: [
        {
          question: "How often should I come for a check-up?",
          answer:
            "Most adults should see a dentist every 6 months, though your dentist may suggest more or less frequent visits based on your oral health.",
        },
        {
          question: "Is the clean painful?",
          answer:
            "The scale and polish is usually very comfortable. If you're anxious, just let your hygienist know — we can take breaks and use a numbing gel if helpful.",
        },
      ],
    },
    {
      slug: "hygienist",
      name: "Hygienist",
      shortDescription:
        "A deeper clean to remove plaque and stains, and personalised home-care advice.",
      body:
        "<p>Our hygienists are the guardians of your gum health. A typical visit includes a thorough ultrasonic clean, stain removal, personalised brushing and interdental advice, and fluoride application.</p><p>Regular hygienist visits are proven to reduce the risk of gum disease, bad breath, and tooth loss — they're a small investment with a big long-term payoff.</p>",
      keyInfo: [
        { label: "Duration", value: "45 minutes" },
        { label: "From", value: "£80 private" },
        { label: "Recall", value: "Every 6 months" },
      ],
      cardImage: "/services/hygienist-card.svg",
      heroImage: "/services/hygienist-hero.svg",
      galleryImages: ["/services/hygienist-1.svg", "/services/hygienist-2.svg"],
    },
    {
      slug: "teeth-whitening",
      name: "Teeth Whitening",
      shortDescription:
        "Safe, dentist-prescribed home whitening for a naturally brighter smile.",
      body:
        "<p>We use dentist-prescribed home whitening kits tailored to your teeth. Custom-fit trays plus professional-grade gel deliver noticeable results in around 2 weeks, safely and gently.</p><p>Your dentist will assess your suitability and explain what to expect before we start.</p>",
      keyInfo: [
        { label: "Duration", value: "2 visits + 2-3 weeks at home" },
        { label: "From", value: "£295" },
        { label: "Results", value: "2-8 shades brighter" },
      ],
      cardImage: "/services/teeth-whitening-card.svg",
      heroImage: "/services/teeth-whitening-hero.svg",
    },
    {
      slug: "invisalign-clear-aligners",
      name: "Invisalign & Clear Aligners",
      shortDescription:
        "Straighten your teeth discreetly with virtually invisible aligners.",
      body:
        "<p>Invisalign uses a series of clear, removable aligners to straighten teeth over a period of 6-18 months. No metal wires, no ugly brackets, and you can take them out to eat.</p><p>A free initial consultation includes a digital smile scan so you can see your expected outcome before committing.</p>",
      keyInfo: [
        { label: "Treatment time", value: "6-18 months typically" },
        { label: "From", value: "£1,995" },
        { label: "Consultation", value: "Free" },
      ],
      cardImage: "/services/invisalign-clear-aligners-card.svg",
      heroImage: "/services/invisalign-clear-aligners-hero.svg",
    },
    {
      slug: "emergency-appointments",
      name: "Emergency Appointments",
      shortDescription:
        "Same-day slots for dental pain, knocked-out teeth, and urgent issues.",
      body:
        "<p>Toothache, a broken tooth, or a lost filling can't wait. We hold same-day emergency slots for existing and new patients — call us in the morning and we'll find you a slot.</p><p>Out of hours, NHS 111 can direct you to the nearest emergency dentist.</p>",
      keyInfo: [
        { label: "Duration", value: "30 minutes" },
        { label: "From", value: "£75" },
        { label: "Booking", value: "Phone us — same-day slots" },
      ],
      cardImage: "/services/emergency-appointments-card.svg",
    },
    {
      slug: "new-patient-consultation",
      name: "New Patient Consultation",
      shortDescription:
        "A gentle first visit to get to know you, your smile, and your goals.",
      body:
        "<p>Haven't been to the dentist in a while? We'll take the time to get to know you properly. A full health history, digital X-rays, a thorough exam, and an open conversation about what you'd like from your dental care — all with zero pressure.</p>",
      keyInfo: [
        { label: "Duration", value: "60 minutes" },
        { label: "From", value: "£95" },
        { label: "Includes", value: "Full exam + X-rays + plan" },
      ],
      cardImage: "/services/new-patient-consultation-card.svg",
    },
  ],

  team: [
    {
      name: "Dr Sarah Chen",
      role: "Principal Dentist",
      gdcNumber: "245678",
      photo: "/team/sarah-chen.svg",
      bio:
        "Sarah qualified at the University of Sheffield in 2010 and has since built a calm, patient-first practice. She has a particular interest in cosmetic dentistry and Invisalign.",
    },
    {
      name: "Dr James Patel",
      role: "Associate Dentist",
      gdcNumber: "312940",
      photo: "/team/james-patel.svg",
      bio:
        "James loves nothing more than restoring a tooth to full health. He's our go-to for fillings, crowns, and root canals, and his chair-side manner is legendary.",
    },
    {
      name: "Maya Hughes",
      role: "Hygienist",
      gdcNumber: "189205",
      photo: "/team/maya-hughes.svg",
      bio:
        "Maya is passionate about prevention. Her hygiene appointments are as informative as they are relaxing — you'll leave knowing exactly how to keep your smile healthy at home.",
    },
  ],

  testimonials: [
    {
      quote:
        "Honestly the nicest dental practice we've ever been to. Our kids actually ask when their next check-up is.",
      author: "Emma B.",
      authorRole: "Private patient",
      rating: 5,
    },
    {
      quote:
        "After years of avoiding the dentist I finally went to Orion. Sarah was so patient, no judgement, just a clear plan. I actually look forward to my visits now.",
      author: "David R.",
      authorRole: "New patient",
      rating: 5,
    },
    {
      quote:
        "Booked online at 11pm on a Sunday for a Wednesday morning slot — confirmation the next morning, reminders via email, perfectly smooth.",
      author: "Priya S.",
      authorRole: "NHS patient",
      rating: 5,
    },
  ],

  gallery: [
    { image: "/gallery/practice-1.svg", caption: "Our welcoming reception" },
    { image: "/gallery/practice-2.svg", caption: "Modern treatment rooms" },
    { image: "/gallery/practice-3.svg" },
    { image: "/gallery/practice-4.svg" },
  ],

  features: {
    guides: false, // flip to true when the practice wants a /guides section
    showGalleryOnHome: true,
    showTestimonials: true,
    // Most practices do NOT want a generic enquiry form competing with the
    // booking form — phone + email on the Contact page covers it. Flip to
    // true if a specific client wants one.
    contactForm: false,
  },

  social: {
    facebook: "",
    instagram: "",
    google: "",
  },

  supabase: {
    // Demo values — real clients swap these for their tenant's.
    // Leaving empty in demo means the booking form shows a preview state.
    url: env.VITE_SUPABASE_URL || "",
    anonKey: env.VITE_SUPABASE_ANON_KEY || "",
  },

  seo: {
    siteTitle: env.VITE_PRACTICE_SEO_TITLE || "Orion Dental Practice",
    homeTitle:
      env.VITE_PRACTICE_SEO_HOME_TITLE ||
      "Orion Dental Practice | Modern, friendly dental care in Halifax",
    homeDescription:
      env.VITE_PRACTICE_SEO_HOME_DESCRIPTION ||
      "Orion Dental Practice offers calm, modern dental care in Halifax. NHS and private. Book online 24/7. Same-day emergency slots.",
    keywords: [
      "dentist Halifax",
      "NHS dentist Halifax",
      "private dentist Halifax",
      "Invisalign Halifax",
      "teeth whitening Halifax",
      "family dentist",
      "emergency dentist",
    ],
  },
};
