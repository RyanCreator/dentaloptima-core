import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { FileText, Plus, Search, Users, Lock } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createAdminDocument,
  useAdminDocuments,
  type AdminDocumentKind,
  type AdminDocumentSummary,
} from "@/hooks/useAdminDocuments";
import { cn } from "@/lib/utils";

// Two-group library: client-facing docs (what we share with practices)
// and internal docs (SOPs, runbooks, onboarding scripts). Same table,
// different `kind`. Grouping is by kind only — categorisation beyond that
// can come later when we have enough docs that flat lists feel cramped.

export default function Documents() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const { documents, loading, reload } = useAdminDocuments({ search: debouncedSearch });
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const client: AdminDocumentSummary[] = [];
    const internal: AdminDocumentSummary[] = [];
    for (const d of documents) {
      if (d.kind === "CLIENT_FACING") client.push(d);
      else internal.push(d);
    }
    return { client, internal };
  }, [documents]);

  async function handleCreate(kind: AdminDocumentKind) {
    if (creating) return;
    setCreating(true);
    try {
      const doc = await createAdminDocument({
        title: kind === "CLIENT_FACING" ? "New client document" : "New internal document",
        kind,
      });
      toast.success("Document created");
      reload();
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout
      title="Documents"
      description="Dentaloptima document library — client-facing deliverables and internal runbooks."
      actions={
        <>
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </>
      }
    >
      {loading && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-8">
          <DocumentGroup
            title="Client-facing"
            description="Deliverables we share with practices — onboarding packs, service breakdowns, guides."
            icon={Users}
            documents={groups.client}
            onCreate={() => handleCreate("CLIENT_FACING")}
            creating={creating}
            onOpen={(id) => navigate(`/documents/${id}`)}
            search={debouncedSearch}
          />
          <DocumentGroup
            title="Internal"
            description="Team-only — SOPs, runbooks, onboarding scripts."
            icon={Lock}
            documents={groups.internal}
            onCreate={() => handleCreate("INTERNAL")}
            creating={creating}
            onOpen={(id) => navigate(`/documents/${id}`)}
            search={debouncedSearch}
          />
        </div>
      )}
    </Layout>
  );
}

function DocumentGroup({
  title,
  description,
  icon: Icon,
  documents,
  onCreate,
  creating,
  onOpen,
  search,
}: {
  title: string;
  description: string;
  icon: typeof FileText;
  documents: AdminDocumentSummary[];
  onCreate: () => void;
  creating: boolean;
  onOpen: (id: string) => void;
  search: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
            <span className="text-xs text-muted-foreground/70 tabular-nums normal-case tracking-normal">
              {documents.length}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onCreate} disabled={creating}>
          <Plus className="h-4 w-4 mr-1.5" />
          New {title.toLowerCase()} doc
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <FileText className="h-7 w-7 mx-auto mb-2 opacity-60" />
          <p className="text-sm">
            {search.trim() ? "No matches in this group." : `No ${title.toLowerCase()} documents yet.`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {documents.map((d) => (
            <button
              key={d.id}
              onClick={() => onOpen(d.id)}
              className="w-full text-left flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{d.title}</p>
                {d.slug && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">/{d.slug}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={d.status} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(d.updated_at), "d MMM")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: "DRAFT" | "PUBLISHED" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        status === "PUBLISHED"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
      )}
    >
      {status === "PUBLISHED" ? "Published" : "Draft"}
    </span>
  );
}
