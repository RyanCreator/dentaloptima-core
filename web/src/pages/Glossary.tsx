import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { GLOSSARY, type GlossaryEntry } from "@/lib/glossary";
import { Search, BookOpen } from "lucide-react";

// Full glossary reference. Linked from the Cmd+K palette and from the
// "Full glossary →" link inside every inline GlossaryTerm popover.
//
// Search runs against title + body so "fillings" finds the Band entry
// even though "fillings" isn't a glossary term itself. Grouping is by
// category so the page reads as a small reference doc rather than an
// undifferentiated alphabetical list.

const CATEGORY_ORDER: GlossaryEntry["category"][] = [
  "Regulatory",
  "GDPR",
  "NHS",
  "Clinical",
  "Practice operations",
];

export default function Glossary() {
  const [query, setQuery] = useState("");

  const entries = useMemo(() => Object.entries(GLOSSARY), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(([key, entry]) =>
      key.toLowerCase().includes(q) ||
      entry.title.toLowerCase().includes(q) ||
      entry.body.toLowerCase().includes(q),
    );
  }, [entries, query]);

  // Group by category, preserving the explicit order so regulatory /
  // GDPR rules surface first (the bits most likely to need clarification).
  const grouped = useMemo(() => {
    const out: Partial<Record<GlossaryEntry["category"], Array<[string, GlossaryEntry]>>> = {};
    filtered.forEach(([key, entry]) => {
      const cat = entry.category;
      (out[cat] ||= []).push([key, entry]);
    });
    // Sort each category alphabetically by title for readability.
    Object.values(out).forEach((rows) =>
      rows!.sort(([, a], [, b]) => a.title.localeCompare(b.title)),
    );
    return out;
  }, [filtered]);

  return (
    <Layout
      title="Glossary"
      description="Plain-English explanations of the dental, NHS, and regulatory terms used in the app."
    >
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a term or topic..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">No terms match "{query}"</p>
            <p className="text-sm mt-1">Try a different keyword.</p>
          </div>
        ) : (
          CATEGORY_ORDER.map((category) => {
            const rows = grouped[category];
            if (!rows || rows.length === 0) return null;
            return (
              <section key={category} className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {category}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rows.map(([key, entry]) => (
                    <article
                      key={key}
                      className="rounded-lg border bg-card p-4 space-y-1"
                    >
                      <h3 className="font-semibold text-sm">{entry.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {entry.body}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </Layout>
  );
}
