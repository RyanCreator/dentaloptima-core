#!/usr/bin/env node
// =============================================================================
// Build-time SEO file generator
// =============================================================================
// Reads the active practice.config.ts (lightly — just as text, parsing the
// fields we need), then writes sitemap.xml, robots.txt, and llms.txt into
// public/ so they ship with the Vite build.
//
// Deliberately no TS imports — this runs before `vite build`, so we can't rely
// on Vite's TS transpile yet. Keeping it a plain Node ESM script also means
// no extra deps.
// =============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const configPath = join(root, "src", "config", "practice.config.ts");
const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });

const configSrc = readFileSync(configPath, "utf8");

// Load .env.local so VITE_PRACTICE_* overrides applied at build time
// flow into the generated SEO files (otherwise sitemap/robots/llms would
// embed the demo Orion defaults from practice.config.ts even when a real
// client's env says otherwise).
function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const buildEnv = { ...loadEnvLocal(), ...process.env };
const envOr = (envKey, fallback) =>
  (buildEnv[envKey] && buildEnv[envKey].trim()) || fallback;

// Multi-line tolerant: matches both `key: "default"` and the new
// `key: env.X || "default"` (possibly wrapped over multiple lines).
function extract(key) {
  const re = new RegExp(`${key}\\s*:[\\s\\S]*?["'\`]([^"'\`]+)["'\`]`);
  const m = configSrc.match(re);
  return m ? m[1] : null;
}

const bookingHostname = envOr(
  "VITE_PRACTICE_BOOKING_HOSTNAME",
  extract("bookingHostname")
);
if (!bookingHostname) {
  console.error(
    "[generate-seo-files] Could not read contact.bookingHostname from practice.config.ts or VITE_PRACTICE_BOOKING_HOSTNAME"
  );
  process.exit(1);
}

const siteName = envOr("VITE_PRACTICE_NAME", extract("name") || "Our Practice");
const homeTitle = envOr(
  "VITE_PRACTICE_SEO_HOME_TITLE",
  extract("homeTitle") || siteName
);
const homeDescription = envOr(
  "VITE_PRACTICE_SEO_HOME_DESCRIPTION",
  extract("homeDescription") || ""
);
const city = envOr("VITE_PRACTICE_ADDR_CITY", extract("city") || "");

// Parse services (slug + name pairs). Shallow but good enough for sitemap +
// llms.txt.
const services = [];
const serviceBlock = configSrc.match(/services:\s*\[([\s\S]*?)\]/);
if (serviceBlock) {
  const entries = serviceBlock[1].matchAll(/slug:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"/g);
  for (const entry of entries) services.push({ slug: entry[1], name: entry[2] });
}

const SITE = `https://${bookingHostname}`;
const today = new Date().toISOString().slice(0, 10);

// ----- sitemap.xml -----
const staticRoutes = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/services", priority: "0.9", changefreq: "monthly" },
  { loc: "/about", priority: "0.8", changefreq: "monthly" },
  { loc: "/book", priority: "0.9", changefreq: "monthly" },
  { loc: "/contact", priority: "0.7", changefreq: "yearly" },
  // Glossary — evergreen content, long-tail SEO target. Refreshed
  // less often than services but still worth crawling regularly.
  { loc: "/glossary", priority: "0.6", changefreq: "monthly" },
  { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "/cookies", priority: "0.3", changefreq: "yearly" },
];
const serviceRoutes = services.map((s) => ({
  loc: `/services/${s.slug}`,
  priority: "0.8",
  changefreq: "monthly",
}));

const allRoutes = [...staticRoutes, ...serviceRoutes];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(
    (r) => `  <url>
    <loc>${SITE}${r.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(join(publicDir, "sitemap.xml"), sitemapXml, "utf8");

// ----- robots.txt -----
const robots = `# ${siteName}
# https://${bookingHostname}

User-agent: *
Allow: /
Crawl-delay: 1

# Search engines
User-agent: Googlebot
Allow: /
User-agent: Bingbot
Allow: /

# LLM / AI crawlers — explicit allow so this practice is discoverable via
# AI search tools. Remove any you'd rather opt out of.
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: CCBot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
writeFileSync(join(publicDir, "robots.txt"), robots, "utf8");

// ----- llms.txt -----
const llms = `# ${siteName}

> ${homeDescription}

## About

${siteName} is a dental practice based in ${city || "the UK"}. This website is
the public-facing site for booking appointments, learning about treatments,
and getting in touch. The practice management software and patient records
are run on Dentaloptima (https://dentaloptima.co.uk).

## Key pages

- [Home](${SITE}/) — overview + hero
- [Services](${SITE}/services) — full list of treatments
- [About](${SITE}/about) — team + story
- [Contact](${SITE}/contact) — phone, email, hours, address
- [Book](${SITE}/book) — online appointment request form
- [Dental glossary](${SITE}/glossary) — plain-English explanations of common dental terms

## Services

${services.map((s) => `- [${s.name}](${SITE}/services/${s.slug})`).join("\n")}

## Business info

- Name: ${siteName}
- Website: ${SITE}
- Category: Dental practice
`;
writeFileSync(join(publicDir, "llms.txt"), llms, "utf8");

console.log(
  `[generate-seo-files] wrote sitemap.xml (${allRoutes.length} URLs), robots.txt, llms.txt`
);
