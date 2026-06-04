import { useEffect, useMemo, useState } from "react";
import { practice } from "@/config/practice.config";
import { Container } from "@/components/Container";
import { AnimatedSection } from "@/components/AnimatedSection";
import { FinalCta } from "@/components/sections/FinalCta";
import { useSeo, breadcrumbJsonLd } from "@/lib/seo";
import {
  DENTAL_GLOSSARY,
  groupedByCategory,
  type DentalGlossaryEntry,
} from "@/lib/dentalGlossary";

// Patient-facing dental glossary. Three jobs:
//   1. Help worried patients understand what their dentist meant
//   2. Give the practice site SEO surface area — "dental crown explained"
//      and similar long-tail queries land here
//   3. Build trust — looking educational beats looking salesy
//
// Single-page approach (no per-term routes) — each term has an anchor
// (`#crown`, `#root-canal`) so URLs deep-link cleanly without exploding
// into 50+ tiny pages.

export default function Glossary() {
  const siteUrl = `https://${practice.contact.bookingHostname}`;
  const [query, setQuery] = useState("");

  // Schema.org DefinedTermSet — tells Google "this page is a glossary
  // about dental terms" so it can render rich results / passage-level
  // ranking for individual terms.
  const definedTermJsonLd = useMemo(() => {
    return {
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      "@id": `${siteUrl}/glossary#termset`,
      name: "Dental glossary",
      description:
        "Plain-English explanations of common dental terms — anatomy, treatments, NHS bands, and more.",
      hasDefinedTerm: DENTAL_GLOSSARY.map((e) => ({
        "@type": "DefinedTerm",
        "@id": `${siteUrl}/glossary#${e.slug}`,
        name: e.term,
        description: e.short,
        inDefinedTermSet: `${siteUrl}/glossary#termset`,
      })),
    } as Record<string, unknown>;
  }, [siteUrl]);

  useSeo({
    title: `Dental glossary | ${practice.seo.siteTitle}`,
    description:
      "Plain-English explanations of common dental terms — from fillings and crowns to NHS bands and implants. Built by " +
      practice.name +
      " so you can understand exactly what your dentist is recommending.",
    path: "/glossary",
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Home", url: `${siteUrl}/` },
        { name: "Dental glossary", url: `${siteUrl}/glossary` },
      ]),
      definedTermJsonLd,
    ],
  });

  // Scroll to the anchor target when the page loads with a hash. Useful
  // for inbound search-result links (?q=crown lands at /glossary#crown).
  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    // Defer to next paint so the layout has settled.
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DENTAL_GLOSSARY;
    return DENTAL_GLOSSARY.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.short.toLowerCase().includes(q) ||
        (e.more ?? "").toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    if (!query.trim()) return groupedByCategory();
    // When filtering, regroup the filtered set so empty categories drop out.
    const filteredSlugs = new Set(filtered.map((e) => e.slug));
    return groupedByCategory()
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => filteredSlugs.has(e.slug)),
      }))
      .filter((g) => g.entries.length > 0);
  }, [filtered, query]);

  return (
    <>
      <section className="pt-32 md:pt-40 pb-10 bg-brand/[0.04]">
        <Container>
          <AnimatedSection className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand mb-3">
              Patient resources
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Dental glossary
            </h1>
            <p className="mt-4 text-base md:text-lg text-slate-600 leading-relaxed">
              Plain-English explanations of common dental terms — from
              fillings and crowns to NHS bands and implants. Written so you
              can understand exactly what we're recommending and why.
            </p>
          </AnimatedSection>
        </Container>
      </section>

      <section className="py-10 border-b border-slate-200 sticky top-16 bg-white/95 backdrop-blur z-20">
        <Container>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a term — e.g. crown, gingivitis, implant…"
              className="w-full md:max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            {/* Quick jumps for the desktop user who knows what they want. */}
            {!query && (
              <div className="hidden md:flex flex-wrap gap-1.5 text-xs">
                {groupedByCategory().map((g) => (
                  <a
                    key={g.category}
                    href={`#cat-${slugify(g.category)}`}
                    className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    {g.category}
                  </a>
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="py-12 md:py-16">
        <Container>
          {grouped.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <p className="text-lg">Nothing matches "{query}".</p>
              <p className="text-sm mt-1">Try a different term, or clear the search.</p>
            </div>
          ) : (
            <div className="space-y-12">
              {grouped.map(({ category, entries }) => (
                <section
                  key={category}
                  id={`cat-${slugify(category)}`}
                  className="scroll-mt-32"
                >
                  <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-6">
                    {category}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {entries.map((entry) => (
                      <Entry key={entry.slug} entry={entry} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Container>
      </section>

      <FinalCta />
    </>
  );
}

interface EntryProps { entry: DentalGlossaryEntry }
function Entry({ entry }: EntryProps) {
  return (
    <article
      id={entry.slug}
      className="scroll-mt-32 rounded-lg border border-slate-200 bg-white p-5"
    >
      <h3 className="text-lg font-semibold tracking-tight">
        <a href={`#${entry.slug}`} className="hover:text-brand">
          {entry.term}
        </a>
      </h3>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">
        {entry.short}
      </p>
      {entry.more && (
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          {entry.more}
        </p>
      )}
      {entry.also && entry.also.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.also.map((slug) => {
            const related = DENTAL_GLOSSARY.find((e) => e.slug === slug);
            if (!related) return null;
            return (
              <a
                key={slug}
                href={`#${slug}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-brand/10 text-brand hover:bg-brand/20"
              >
                {related.term}
              </a>
            );
          })}
        </div>
      )}
    </article>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
