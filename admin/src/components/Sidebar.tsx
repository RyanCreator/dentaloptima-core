import { NavLink, useNavigate } from "react-router-dom";
import { Building2, Activity, LogOut, Plus, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOutCleanly } from "@/hooks/useAuth";
import { toast } from "sonner";

const SECTIONS: {
  label: string | null;
  items: { to: string; label: string; icon: typeof Home; exact?: boolean }[];
}[] = [
  {
    label: null,
    items: [{ to: "/", label: "Overview", icon: Home, exact: true }],
  },
  {
    label: "Practices",
    items: [
      { to: "/tenants", label: "Tenants", icon: Building2 },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/audit", label: "Audit log", icon: Activity },
    ],
  },
];

interface SidebarProps {
  adminEmail: string | null;
  onNavigate?: () => void;
}

export function Sidebar({ adminEmail, onNavigate }: SidebarProps) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await signOutCleanly();
      onNavigate?.();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Failed to sign out");
    }
  }

  function handleNewTenant() {
    onNavigate?.();
    navigate("/tenants?new=1");
  }

  return (
    <div className="w-full h-full flex flex-col bg-card">
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
            D
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Dentaloptima</div>
            <div className="text-xs text-muted-foreground leading-tight">Core admin</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        <Button onClick={handleNewTenant} size="sm" className="w-full justify-start">
          <Plus className="h-4 w-4 mr-2" />
          New tenant
        </Button>

        {SECTIONS.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.label && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </div>
            )}
            {section.items.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                onClick={() => onNavigate?.()}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t space-y-2">
        {adminEmail && (
          <div className="px-3 py-1 text-xs text-muted-foreground truncate" title={adminEmail}>
            {adminEmail}
          </div>
        )}
        <Button
          onClick={handleLogout}
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
