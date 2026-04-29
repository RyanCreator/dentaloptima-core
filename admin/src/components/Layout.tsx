import type { ReactNode } from "react";

// Per-page Layout: renders a title + description header with the page body
// underneath. The app shell (sidebar, mobile bar) is in AppShell.tsx and is
// applied once at the App level.
//
// This signature matches the legacy admin's Layout so lifted pages work
// without code changes: <Layout title="..." description="..."><body /></Layout>
export function Layout({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
