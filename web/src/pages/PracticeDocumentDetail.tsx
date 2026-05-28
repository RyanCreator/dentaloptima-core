import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Layout } from "@/components/Layout";
import { useRequireAuth, useAuth } from "@/hooks/useAuth";
import { PageLoading } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Check, Download } from "lucide-react";
import { toast } from "sonner";
import {
  useAssignedDocument,
  markDocumentViewed,
  acknowledgeDocument,
} from "@/hooks/useAssignedDocuments";
import { generateDocumentPdf } from "@/lib/generateDocumentPdf";

// /documents/:id — single-document reader for practice members. Auto-marks
// the doc as viewed on first open; offers a one-click "Acknowledge" button
// that records the practice's sign-off (one ack per practice — first
// member to click does it on behalf of the whole practice).

export default function PracticeDocumentDetail() {
  const { loading: authLoading } = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { doc, loading, reload } = useAssignedDocument(id);
  const [acking, setAcking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Auto-mark as viewed on first open. No-op if already viewed.
  useEffect(() => {
    if (doc && !doc.viewed_at) {
      void markDocumentViewed(doc.id).then(() => reload());
    }
  }, [doc, reload]);

  if (authLoading || (loading && !doc)) return <PageLoading />;

  if (!doc) {
    return (
      <Layout title="Document" description="Not found">
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>This document doesn't exist or has been withdrawn.</p>
          <Button variant="outline" className="mt-3" onClick={() => navigate("/documents")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to library
          </Button>
        </div>
      </Layout>
    );
  }

  const memberId = auth.member?.id ?? null;

  async function handleAcknowledge() {
    if (!memberId) {
      toast.error("Couldn't identify you as a practice member — try refreshing.");
      return;
    }
    if (!doc) return;
    setAcking(true);
    try {
      await acknowledgeDocument(doc.id, memberId);
      toast.success("Acknowledged on behalf of the practice");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to acknowledge");
    } finally {
      setAcking(false);
    }
  }

  async function handleDownloadPdf() {
    if (!doc) return;
    setDownloading(true);
    try {
      await generateDocumentPdf({
        title: doc.title,
        bodyMarkdown: doc.body_markdown,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Layout
      title={doc.title}
      description={`Shared by Dentaloptima · ${formatDistanceToNow(new Date(doc.assigned_at), { addSuffix: true })} · ${format(new Date(doc.assigned_at), "d MMM yyyy")}`}
      onBack={() => navigate("/documents")}
    >
      {/* Top action bar — the booking-app Layout has no `actions` slot
          on its TopBar (unlike admin), so we render the Library back
          link + Download button inside the content area. The Library
          button duplicates the TopBar's back arrow with an explicit
          label, which patients on mobile find easier to spot. */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/documents")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Library
        </Button>
        <Button onClick={handleDownloadPdf} disabled={downloading}>
          <Download className="h-4 w-4 mr-1.5" />
          {downloading ? "Generating…" : "Download PDF"}
        </Button>
      </div>

      {/* Acknowledgement banner — sticky at the top so it's always reachable
          without scrolling back. Hides once acked, replaced by a confirmation
          tag in the same slot so the visual position doesn't jump. */}
      <div className="mb-6 print:hidden">
        {doc.acknowledged_at ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-4 py-3 flex items-center gap-3">
            <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">
                Acknowledged
              </p>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
                Your practice acknowledged this on {format(new Date(doc.acknowledged_at), "d MMM yyyy 'at' HH:mm")}.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm min-w-0">
              <p className="font-medium">Please acknowledge once your practice has read this.</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                One acknowledgement per practice — the Dentaloptima team will see it.
              </p>
            </div>
            <Button size="sm" onClick={handleAcknowledge} disabled={acking || !memberId}>
              <Check className="h-4 w-4 mr-1.5" />
              {acking ? "Acknowledging…" : "Acknowledge"}
            </Button>
          </div>
        )}
      </div>

      {/* The doc body. The booking app already has @tailwindcss/typography
          installed — wrap in `prose` for sensible default styling without
          maintaining a parallel stylesheet here. */}
      <article
        data-print-target="true"
        className="prose prose-sm dark:prose-invert max-w-none print:max-w-none print:prose-base"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body_markdown}</ReactMarkdown>
      </article>
    </Layout>
  );
}
