import {
  Calendar,
  Smile,
  ScanFace,
  ClipboardList,
  Sparkles,
  BellRing,
  Stars,
  type LucideIcon,
} from "lucide-react";
import { practice } from "@/config/practice.config";

// Content for the patient-journey landing experience: an auto-rotating hero
// slider up top, then a sequence of scroll-revealed "journey" sections. All of
// it leans on the practice config so it re-skins per tenant.

const BOOK = { label: "Book an appointment", to: "/book" };

// ---- Hero slider ----------------------------------------------------------

export interface HeroSlide {
  id: string;
  image: string;
  imageAlt: string;
  kicker: string;
  title: string;
  sub: string;
  primaryCta: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
}

export const heroSlides: HeroSlide[] = [
  {
    id: "welcome",
    image: practice.hero.image,
    imageAlt: practice.hero.imageAlt,
    kicker: practice.hero.kicker ?? "Dentistry done properly",
    title: practice.hero.headline,
    sub: practice.hero.subheading,
    primaryCta: BOOK,
    secondaryCta: { label: "Take the tour", to: "#journey-start" },
  },
  {
    id: "cosmetic",
    image: practice.about.image ?? practice.hero.image,
    imageAlt: "A bright, confident smile",
    kicker: "Cosmetic & smile design",
    title: "Love the smile you see in the mirror",
    sub: "Whitening, Invisalign and natural-looking makeovers, planned around your face and tailored to you.",
    primaryCta: { label: "Explore treatments", to: "/services" },
    secondaryCta: { label: "Book a consultation", to: "/book" },
  },
  {
    id: "nhs",
    image: practice.hero.imageMobile ?? practice.hero.image,
    imageAlt: "A reassuring dental team",
    kicker: "NHS & same-day care",
    title: "Here when you need us most",
    sub: "NHS and private lists side by side, with same-day emergency appointments for when it just can't wait.",
    primaryCta: BOOK,
    secondaryCta: { label: "See our fees", to: "/services" },
  },
];

// ---- Scroll-revealed journey sections -------------------------------------

export type SectionTheme = "dark" | "light" | "soft" | "brand";
export type SectionLayout = "split" | "showcase" | "final";

export interface JourneyStep {
  id: string;
  theme: SectionTheme;
  layout: SectionLayout;
  stepLabel?: string;
  kicker?: string;
  title: string;
  body: string;
  bullets?: string[];
  icon?: LucideIcon;
  image?: string;
  imageAlt?: string;
  stat?: { value: string; label: string };
  primaryCta?: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
}

export const journeySteps: JourneyStep[] = [
  {
    id: "book",
    theme: "light",
    layout: "split",
    stepLabel: "01",
    kicker: "Getting started",
    title: "Booking that fits around your life",
    body: "No phone queues, no waiting for opening hours. Choose a real, live appointment time online in under a minute — day or night — and we'll confirm it instantly.",
    bullets: [
      "See genuine live availability, not a callback request",
      "NHS & private lists, side by side",
      "Same-day emergency slots when you need them",
    ],
    icon: Calendar,
    stat: { value: "<60s", label: "to book online" },
    primaryCta: BOOK,
  },
  {
    id: "welcome-in",
    theme: "soft",
    layout: "split",
    stepLabel: "02",
    kicker: "Your first visit",
    title: "A warm welcome from the moment you arrive",
    body: "Step into a calm, modern practice and a friendly, no-judgement team. Whether it's been six months or six years, you'll feel at ease straight away.",
    bullets: [
      "A relaxed, unhurried first appointment",
      "Time to talk through any worries",
      "Anxious patients are our speciality",
    ],
    icon: Smile,
    image: practice.about.image,
    imageAlt: "Inside the practice",
  },
  {
    id: "understand",
    theme: "light",
    layout: "split",
    stepLabel: "03",
    kicker: "Understanding your smile",
    title: "A clear picture, explained simply",
    body: "Digital scans and a thorough examination give us — and you — a complete view of your oral health. We'll show you exactly what we see, in plain English.",
    bullets: [
      "Gentle digital X-rays & intra-oral scans",
      "Screening for decay, gum disease & oral cancer",
      "Everything shown on screen and explained",
    ],
    icon: ScanFace,
    stat: { value: "3D", label: "digital scanning" },
  },
  {
    id: "plan",
    theme: "soft",
    layout: "split",
    stepLabel: "04",
    kicker: "Your personalised plan",
    title: "A plan built around you — and your budget",
    body: "We set out your options with transparent pricing, so there are never any surprises. You choose what's right for you, at a pace that suits you.",
    bullets: [
      "Clear, itemised costs up front",
      "NHS, private & finance options",
      "No pressure — the plan is yours to approve",
    ],
    icon: ClipboardList,
    stat: { value: "£0", label: "hidden fees" },
  },
  {
    id: "treatment",
    theme: "light",
    layout: "split",
    stepLabel: "05",
    kicker: "Treatment day",
    title: "Gentle, modern, genuinely comfortable care",
    body: "From a simple clean to a full smile makeover, our clinicians use the latest techniques to keep treatment calm and comfortable — at every appointment.",
    bullets: [
      "Modern, minimally-invasive techniques",
      "Comfort breaks and numbing whenever you need",
      "Cosmetic, restorative & routine care under one roof",
    ],
    icon: Sparkles,
  },
  {
    id: "aftercare",
    theme: "soft",
    layout: "split",
    stepLabel: "06",
    kicker: "Looking after you",
    title: "We keep you smiling, long after you leave",
    body: "Healthy smiles are built over time. We'll remind you when a check-up or hygiene visit is due, so staying on top of your care is effortless.",
    bullets: [
      "Automatic recall reminders by text & email",
      "Easy re-booking in a couple of taps",
      "A dedicated team who know you by name",
    ],
    icon: BellRing,
  },
  {
    id: "results",
    theme: "dark",
    layout: "showcase",
    kicker: "Real results",
    title: "Smiles we're proud of",
    body: "From confidence-restoring whitening to life-changing makeovers — see the difference modern, caring dentistry makes.",
    icon: Stars,
    image: practice.hero.image,
    imageAlt: "Happy patient smiling",
    stat: { value: "4.9★", label: "average patient rating" },
  },
];

// ---- Social proof + before/after -----------------------------------------

export const trust = {
  rating: "4.9",
  ratingLabel: "Rated by 500+ patients",
  avatars: ["/team/sarah-chen.svg", "/team/maya-hughes.svg", "/team/james-patel.svg"],
  stats: [
    { value: "4.9★", label: "Average rating" },
    { value: "500+", label: "Happy patients" },
    { value: "10 yrs", label: "Caring for Halifax" },
    { value: "Same-day", label: "Emergency slots" },
  ],
  badges: ["NHS & Private", "CQC Registered", "GDC Clinicians"],
};

export const beforeAfter = {
  // One image, rendered dulled (before) vs vibrant (after) so the comparison
  // reads as a real transformation even before clinical photos are dropped in.
  image: practice.hero.image,
  alt: "Smile transformation",
};

export const finalCta: JourneyStep = {
  id: "begin",
  theme: "brand",
  layout: "final",
  kicker: "Your journey starts here",
  title: "Ready to begin?",
  body: `Book your first visit at ${practice.name} today — it takes less than a minute.`,
  primaryCta: BOOK,
  secondaryCta: {
    label: `Call ${practice.contact.phone}`,
    to: `tel:${practice.contact.phone.replace(/\s/g, "")}`,
  },
};
