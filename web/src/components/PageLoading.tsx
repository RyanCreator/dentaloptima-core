// Shared loading state for full-page and inline loading. Replaces the
// scattered `<div>Loading...</div>` strings that used to bloom across the
// app — same look everywhere, no layout shift when text length changes.

interface PageLoadingProps {
  // "page": fills the main content area, vertically centred. Use inside
  // <Layout>{...}</Layout>.
  // "inline": small inline spinner. Use within a card or section.
  variant?: "page" | "inline";
  label?: string;
}

export function PageLoading({ variant = "page", label }: PageLoadingProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner />
        {label && <span>{label}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Spinner size="lg" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

function Spinner({ size = "md" }: { size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-7 w-7 border-[3px]" : "h-4 w-4 border-2";
  return (
    <div
      className={`${dim} animate-spin rounded-full border-primary border-t-transparent`}
      role="status"
      aria-label="Loading"
    />
  );
}
