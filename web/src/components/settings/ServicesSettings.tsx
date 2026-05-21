import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ChevronRight, Search, ArrowUp, ArrowDown, GripVertical, Upload } from "lucide-react";
import { useServiceManagement } from "@/hooks/useServiceManagement";
import { formatPrice } from "@/types/entities";
import { ImportServicesSheet } from "./ImportServicesSheet";

type SortMode = "display_order" | "name" | "duration" | "price";
type StatusFilter = "all" | "active" | "inactive";

// Create + edit have moved to /settings/services/new and
// /settings/services/:serviceId — full-page forms instead of a cramped
// slide-out sheet. This component is now read-only navigation: list,
// filter, reorder, and link through.
export function ServicesSettings() {
  const navigate = useNavigate();
  const { services, saving, reorderService } = useServiceManagement();

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("display_order");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importOpen, setImportOpen] = useState(false);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = services.filter((s) => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.treatment_type ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortMode === "duration") return a.duration_minutes - b.duration_minutes;
      if (sortMode === "price") return (a.price_pence ?? 0) - (b.price_pence ?? 0);
      if (sortMode === "name") return a.name.localeCompare(b.name);
      // display_order — the one the patient-facing page uses. Ties fall back
      // to name for determinism.
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [services, search, sortMode, statusFilter]);

  const canReorder = sortMode === "display_order" && !search && statusFilter === "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="display_order">Display order</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="duration">Sort: Duration</SelectItem>
              <SelectItem value="price">Sort: Price</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:ml-auto flex gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload CSV
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/settings/services/new")}
            className="flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        </div>
      </div>

      <div className="divide-y border rounded-lg bg-card">
        {services.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No services yet. Add your first service to get started.
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No services match the current filter.
          </div>
        ) : (
          filteredServices.map((service, index) => (
            <div
              key={service.id}
              className="w-full flex items-center gap-2 p-4 hover:bg-muted/50 transition-colors"
            >
              {/* Reorder affordance — only when sorting by display_order and
                  no filters are narrowing the list, so up/down corresponds
                  to what the user sees on screen. */}
              {canReorder && (
                <div
                  className="flex flex-col gap-0.5 shrink-0"
                  title="Drag order by clicking up/down"
                >
                  <button
                    type="button"
                    onClick={() => reorderService(service.id, "up")}
                    disabled={index === 0 || saving}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => reorderService(service.id, "down")}
                    disabled={index === filteredServices.length - 1 || saving}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate(`/settings/services/${service.id}`)}
                className="flex-1 min-w-0 flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{service.name}</h4>
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        service.is_active ? "bg-green-500" : "bg-red-500"
                      }`}
                      title={service.is_active ? "Active" : "Inactive"}
                    />
                    {service.is_nhs && (
                      <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        NHS{service.nhs_band ? ` ${service.nhs_band.replace("_", " ")}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{service.duration_minutes} min</span>
                    {service.price_pence != null && service.price_pence > 0 && (
                      <span>&middot; {formatPrice(service.price_pence)}</span>
                    )}
                    {service.treatment_type && (
                      <span className="capitalize">
                        &middot; {service.treatment_type.replace(/_/g, " ").toLowerCase()}
                      </span>
                    )}
                    {service.recall_months && <span>&middot; {service.recall_months}mo recall</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            </div>
          ))
        )}

        {canReorder && filteredServices.length > 1 && (
          <div className="px-4 py-2.5 bg-muted/20 text-xs text-muted-foreground flex items-center gap-1.5">
            <GripVertical className="h-3 w-3" />
            Use the arrows to set the order patients see on the booking page.
          </div>
        )}
      </div>

      <ImportServicesSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
