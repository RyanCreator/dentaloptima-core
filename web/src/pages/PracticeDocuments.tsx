import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { PageLoading } from "@/components/PageLoading";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, FileText, Check, Eye } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAssignedDocuments, type AssignedDocumentSummary } from "@/hooks/useAssignedDocuments";
import { cn } from "@/lib/utils";

// /documents — practice-facing library of documents pushed by the
// Dentaloptima team. Read-only on this side; the operator owns the
// content. Practice members can mark docs as viewed (auto on open)
// and acknowledged (one-click).
export default function PracticeDocuments() {
  const { loading: authLoading } = useRequireAuth();
  const navigate = useNavigate();
  const { documents, loading } = useAssignedDocuments();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.title.toLowerCase().includes(q));
  }, [documents, query]);

  // Group by tracking state — unacked at the top so they're the
  // first thing the practice sees.
  const groups = useMemo(() => {
    const unread: AssignedDocumentSummary[] = [];
    const acked: AssignedDocumentSummary[] = [];
    for (const d of filtered) {
      if (d.acknowledged_at) acked.push(d);
      else unread.push(d);
    }
    return { unread, acked };
  }, [filtered]);

  if (authLoading) return <PageLoading />;

  return (
    <Layout
      title="Documents"
      description="Documents shared with your practice by the Dentaloptima team."
    >
      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No documents yet"
          body="When the Dentaloptima team shares a document with you, it will appear here."
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents match "{query}".</p>
      ) : (
        <div className="space-y-8">
          {groups.unread.length > 0 && (
            <DocumentGroup
              title="To review"
              description="Documents waiting for your acknowledgement."
              documents={groups.unread}
              onOpen={(id) => navigate(`/documents/${id}`)}
            />
          )}
          {groups.acked.length > 0 && (
            <DocumentGroup
              title="Acknowledged"
              description="Documents your practice has acknowledged."
              documents={groups.acked}
              onOpen={(id) => navigate(`/documents/${id}`)}
              muted
            />
          )}
        </div>
      )}
    </Layout>
  );
}

function DocumentGroup({
  title,
  description,
  documents,
  onOpen,
  muted = false,
}: {
  title: string;
  description: string;
  documents: AssignedDocumentSummary[];
  onOpen: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2
          className={cn(
            "text-sm font-semibold uppercase tracking-wider",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {title}
          <span className="ml-2 text-xs text-muted-foreground/70 tabular-nums normal-case tracking-normal">
            {documents.length}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {documents.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            className="w-full text-left flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors"
          >
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "font-semibold truncate",
                  !d.viewed_at && !d.acknowledged_at && "text-foreground",
                  muted && "text-muted-foreground",
                )}
              >
                {d.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Shared by Dentaloptima ·{" "}
                <span title={new Date(d.assigned_at).toLocaleString()}>
                  {formatDistanceToNow(new Date(d.assigned_at), { addSuffix: true })}
                  {" · "}
                  {format(new Date(d.assigned_at), "d MMM yyyy")}
                </span>
              </p>
            </div>
            <StatusBadge doc={d} />
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ doc }: { doc: AssignedDocumentSummary }) {
  if (doc.acknowledged_at) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0">
        <Check className="h-3 w-3" />
        Acknowledged
      </span>
    );
  }
  if (doc.viewed_at) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0">
        <Eye className="h-3 w-3" />
        Viewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0">
      New
    </span>
  );
}
