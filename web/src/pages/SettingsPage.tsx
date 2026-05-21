import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useRequireAuth } from "@/hooks/useAuth";
import { ChevronRight } from "lucide-react";
import { PageLoading } from "@/components/PageLoading";
import { SETTINGS_ITEMS } from "@/lib/settingsItems";

// /settings landing page. Desktop users (≥md) get redirected straight to
// /settings/clinic — the rail in SettingsShell is the actual navigation,
// so dropping the user on a "pick a section" welcome panel was an extra
// click that did nothing useful. Mobile (<md) keeps the card-list as the
// landing page because there's no rail at that width, so drill-down is
// still the right pattern.

const DESKTOP_BREAKPOINT = 768; // matches Tailwind `md`

export default function SettingsPage() {
  const { loading } = useRequireAuth();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (loading) {
    return (
      <Layout title="Settings">
        <PageLoading />
      </Layout>
    );
  }

  // Desktop: skip the landing page entirely. `replace` so the back button
  // skips over /settings and goes to wherever the user came from.
  if (isDesktop) {
    return <Navigate to="/settings/clinic" replace />;
  }

  return (
    <Layout title="Settings">
      <p className="text-muted-foreground mb-3 text-sm">
        Configure clinic settings and preferences
      </p>
      <div className="divide-y bg-card rounded-lg border">
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/settings/${item.id}`)}
              className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
