import { useEffect } from "react";
import { practice } from "@/config/practice.config";

// Simple per-page SEO helper. Avoids pulling in react-helmet-async to keep
// the dependency tree lean — the app is small enough that a single hook that
// mutates document.head directly is plenty.

interface SeoOptions {
  title: string;
  description: string;
  path: string; // "/services", "/services/check-up", etc
  image?: string;
  jsonLd?: Array<Record<string, unknown>>;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function useSeo({ title, description, path, image, jsonLd }: SeoOptions) {
  useEffect(() => {
    const siteUrl = `https://${practice.contact.bookingHostname}`;
    const canonical = `${siteUrl}${path}`;
    const ogImage = image || `${siteUrl}${practice.branding.ogImageUrl}`;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertLink("canonical", canonical);

    // Open Graph
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:site_name", practice.name);
    upsertMeta("property", "og:locale", "en_GB");

    // Twitter
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);

    // JSON-LD — clear any stale page-level blocks, then write the new ones.
    // Organization + LocalBusiness (the site-wide ones) are handled elsewhere
    // so they don't flicker on navigation.
    document
      .querySelectorAll('script[data-page-jsonld="true"]')
      .forEach((el) => el.remove());
    jsonLd?.forEach((block, idx) => {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.dataset.pageJsonld = "true";
      el.id = `page-jsonld-${idx}`;
      el.textContent = JSON.stringify(block);
      document.head.appendChild(el);
    });
  }, [title, description, path, image, JSON.stringify(jsonLd)]);
}

/** Site-wide Organization + LocalBusiness JSON-LD. Written once at app boot. */
export function installSiteWideJsonLd() {
  const siteUrl = `https://${practice.contact.bookingHostname}`;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: practice.legalName,
    alternateName: practice.name,
    url: siteUrl,
    logo: `${siteUrl}${practice.branding.logoDarkUrl || practice.branding.logoUrl}`,
    sameAs: Object.values(practice.social).filter(Boolean),
  };

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "Dentist",
    name: practice.name,
    image: `${siteUrl}${practice.branding.ogImageUrl}`,
    url: siteUrl,
    telephone: practice.contact.phone,
    email: practice.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: [practice.address.line1, practice.address.line2]
        .filter(Boolean)
        .join(", "),
      addressLocality: practice.address.city,
      postalCode: practice.address.postcode,
      addressCountry: "GB",
    },
    ...(practice.address.coords && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: practice.address.coords.lat,
        longitude: practice.address.coords.lng,
      },
    }),
    openingHoursSpecification: openingHoursSchema(),
    priceRange: "££",
  };

  upsertJsonLd("site-organization-jsonld", organization);
  upsertJsonLd("site-localbusiness-jsonld", localBusiness);
}

function openingHoursSchema() {
  const map: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return Object.entries(practice.hours)
    .filter(([, h]) => !("closed" in h && h.closed))
    .map(([k, h]) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: map[k],
      opens: (h as { open: string }).open,
      closes: (h as { close: string }).close,
    }));
}

/** Breadcrumb JSON-LD helper for non-home pages. */
export function breadcrumbJsonLd(trail: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}
