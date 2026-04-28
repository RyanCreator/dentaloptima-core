import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTenants, type PracticeStatus } from "@/hooks/useTenants";
import { NewTenantSheet } from "@/components/NewTenantSheet";
import { format } from "date-fns";

const STATUS_STYLES: Record<PracticeStatus, string> = {
  TRIAL: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  ACTIVE: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  SUSPENDED: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  OFFBOARDED: "bg-stone-100 text-stone-700 hover:bg-stone-100",
};

export default function Tenants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: practices, isLoading, error } = useTenants();
  const [newOpen, setNewOpen] = useState(false);

  // Sidebar deep-links to /tenants?new=1 to open the create sheet directly
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewOpen(true);
      setSearchParams((p) => {
        p.delete("new");
        return p;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every dental practice on dentaloptima-core.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New tenant
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading practices…</div>
      )}

      {error && (
        <div className="text-sm text-destructive">
          Failed to load: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {!isLoading && practices && practices.length === 0 && (
        <div className="border rounded-lg p-12 text-center bg-card">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-base font-medium">No practices yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first practice to get started.
          </p>
          <Button onClick={() => setNewOpen(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            New tenant
          </Button>
        </div>
      )}

      {practices && practices.length > 0 && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Practice</th>
                <th className="text-left font-medium px-4 py-3">Slug</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Plan</th>
                <th className="text-left font-medium px-4 py-3">Trial ends</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {practices.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/tenants/${p.id}`)}
                  className="border-t hover:bg-secondary/30 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.primary_email && (
                      <div className="text-xs text-muted-foreground">{p.primary_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.slug}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_STYLES[p.status]} variant="secondary">
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.plan}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.trial_ends_at ? format(new Date(p.trial_ends_at), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(p.created_at), "d MMM yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewTenantSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => navigate(`/tenants/${id}`)}
      />
    </div>
  );
}
