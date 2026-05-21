#!/usr/bin/env node
// Generates SVG placeholder images for the template's demo content.
// Runs idempotently — overwrites existing files. Real clients replace these
// with their own photos before going live.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Teal brand palette by default. The runtime brand is applied via CSS vars,
// so these baked-in colours are just placeholder aesthetics.
const palette = {
  deep: "#0F766E",
  mid: "#14B8A6",
  soft: "#CCFBF1",
  cream: "#F5FAF8",
  ink: "#0F172A",
  muted: "#64748B",
};

function write(path, content) {
  const full = join(publicDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
}

// ---- Hero (desktop + mobile) ------------------------------------------------

function hero(width, height, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.deep}"/>
      <stop offset="1" stop-color="#0B4A46"/>
    </linearGradient>
    <radialGradient id="r" cx="70%" cy="30%" r="60%">
      <stop offset="0" stop-color="${palette.mid}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${palette.mid}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="url(#r)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>
  <g transform="translate(${width * 0.68} ${height * 0.5})" opacity="0.12">
    <circle r="${Math.min(width, height) * 0.28}" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle r="${Math.min(width, height) * 0.22}" fill="none" stroke="#ffffff" stroke-width="2"/>
    <circle r="${Math.min(width, height) * 0.14}" fill="#ffffff" fill-opacity="0.5"/>
  </g>
  <text x="60" y="${height - 40}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#ffffff" fill-opacity="0.3" letter-spacing="2">${label}</text>
</svg>`;
}
write("hero/hero-desktop.svg", hero(1920, 1080, "HERO · DESKTOP"));
write("hero/hero-mobile.svg", hero(900, 1200, "HERO · MOBILE"));

// ---- Service cards + hero ---------------------------------------------------

const serviceAccents = [
  ["check-up-and-clean", palette.deep, "🦷", "Check-up"],
  ["hygienist", "#0369A1", "✨", "Hygienist"],
  ["teeth-whitening", "#B45309", "😁", "Whitening"],
  ["invisalign-clear-aligners", "#6D28D9", "🧊", "Invisalign"],
  ["emergency-appointments", "#B91C1C", "⚡", "Emergency"],
  ["new-patient-consultation", "#166534", "👋", "New patient"],
];

function serviceCard(width, height, colorFrom, emoji, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="gc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colorFrom}"/>
      <stop offset="1" stop-color="${palette.ink}"/>
    </linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.07"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#gc)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>
  <text x="${width / 2}" y="${height / 2 + 20}" text-anchor="middle" font-size="${Math.round(height * 0.4)}">${emoji}</text>
  <text x="${width / 2}" y="${height - 40}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="#ffffff" fill-opacity="0.8" letter-spacing="2">${label.toUpperCase()}</text>
</svg>`;
}

for (const [slug, accent, emoji, label] of serviceAccents) {
  write(`services/${slug}-card.svg`, serviceCard(800, 600, accent, emoji, label));
  write(`services/${slug}-hero.svg`, serviceCard(1920, 900, accent, emoji, label));
  // Gallery images for services with them
  for (let i = 1; i <= 3; i++) {
    write(
      `services/${slug}-${i}.svg`,
      serviceCard(800, 600, accent, emoji, `${label} · ${i}`)
    );
  }
}

// ---- Team portraits ---------------------------------------------------------

const teamMembers = [
  ["sarah-chen", "SC", "#0F766E"],
  ["james-patel", "JP", "#166534"],
  ["maya-hughes", "MH", "#B45309"],
];

function portrait(initials, bgColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bgColor}"/>
      <stop offset="1" stop-color="${palette.ink}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#pg)"/>
  <circle cx="400" cy="380" r="140" fill="#ffffff" fill-opacity="0.12"/>
  <ellipse cx="400" cy="820" rx="280" ry="200" fill="#ffffff" fill-opacity="0.12"/>
  <text x="400" y="420" text-anchor="middle" font-family="'Fraunces', Georgia, serif" font-size="120" fill="#ffffff" fill-opacity="0.85" font-weight="600">${initials}</text>
</svg>`;
}

for (const [slug, initials, color] of teamMembers) {
  write(`team/${slug}.svg`, portrait(initials, color));
}

// ---- Gallery + about --------------------------------------------------------

function galleryTile(seed, label) {
  const hues = [
    ["#0F766E", "#134E4A"],
    ["#0369A1", "#0C4A6E"],
    ["#B45309", "#7C2D12"],
    ["#6D28D9", "#312E81"],
  ];
  const [a, b] = hues[seed % hues.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <pattern id="gdots" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="800" height="800" fill="url(#gg)"/>
  <rect width="800" height="800" fill="url(#gdots)"/>
  <text x="400" y="430" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#ffffff" fill-opacity="0.55" letter-spacing="3">${label.toUpperCase()}</text>
</svg>`;
}
write("gallery/practice-1.svg", galleryTile(0, "Reception"));
write("gallery/practice-2.svg", galleryTile(1, "Treatment room"));
write("gallery/practice-3.svg", galleryTile(2, "Hygiene suite"));
write("gallery/practice-4.svg", galleryTile(3, "Waiting area"));

write("about/about-practice.svg", galleryTile(0, "Inside the practice"));

// ---- OG image ---------------------------------------------------------------

write(
  "og.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="og" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.deep}"/>
      <stop offset="1" stop-color="#0B4A46"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#og)"/>
  <circle cx="600" cy="240" r="90" fill="none" stroke="#ffffff" stroke-width="6" stroke-opacity="0.8"/>
  <circle cx="600" cy="240" r="32" fill="#ffffff"/>
  <text x="600" y="420" text-anchor="middle" font-family="'Fraunces', Georgia, serif" font-size="68" fill="#ffffff" font-weight="600">Orion Dental Practice</text>
  <text x="600" y="480" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" fill="#ffffff" fill-opacity="0.8">Modern, welcoming dental care in Halifax</text>
</svg>`
);

console.log("[generate-placeholders] wrote placeholder SVGs to public/");
