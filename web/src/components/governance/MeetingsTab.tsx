import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Mic, Clock, FileText } from "lucide-react";
import { RecordMeetingSheet } from "./RecordMeetingSheet";

interface MeetingRow {
  id: string;
  title: string;
  meeting_type: string;
  status: string;
  occurred_at: string;
  duration_seconds: number;
}

const TYPE_LABEL: Record<string, string> = {
  TEAM: "Team", GOVERNANCE: "Governance", CLINICAL: "Clinical governance",
  TRAINING: "Training", OTHER: "Other",
};

function fmtDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m < 1 ? "<1 min" : `${m} min`;
}

export function MeetingsTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meeting")
      .select("id, title, meeting_type, status, occurred_at, duration_seconds")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });
    if (error) logger.error("Failed to load meetings", error);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(
    (r) =>
      (typeFilter === "all" || r.meeting_type === typeFilter) &&
      (search.trim() === "" || r.title.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings…"
              className="pl-8"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Record meeting
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Mic className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">No meetings yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Record a team huddle or governance meeting and it'll be minuted here.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setSheetOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Record meeting
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/governance/meetings/${m.id}`)}
              className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mic className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.title}</span>
                  {m.status === "FINAL" && (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                      Final
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{TYPE_LABEL[m.meeting_type] ?? m.meeting_type}</span>
                  <span>{format(parseISO(m.occurred_at), "d MMM yyyy, HH:mm")}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(m.duration_seconds)}
                  </span>
                </div>
              </div>
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            </button>
          ))}
        </div>
      )}

      <RecordMeetingSheet open={sheetOpen} onOpenChange={setSheetOpen} onCreated={load} />
    </div>
  );
}
