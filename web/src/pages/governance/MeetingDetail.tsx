import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { usePractice } from "@/contexts/PracticeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Clock, Calendar as CalendarIcon, Lock, LockOpen, Save, Trash2, Plus, ListTodo,
} from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  TEAM: "Team", GOVERNANCE: "Governance", CLINICAL: "Clinical governance",
  TRAINING: "Training", OTHER: "Other",
};

interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  status: string;
  occurred_at: string;
  duration_seconds: number;
  transcript: string;
  attendees: { name: string }[];
}

interface Action {
  id: string;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  status: string;
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const practiceId = usePractice().practice.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [transcript, setTranscript] = useState("");
  const [attendeesText, setAttendeesText] = useState("");

  // New-action draft
  const [newAction, setNewAction] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDue, setNewDue] = useState("");

  const isFinal = meeting?.status === "FINAL";

  const load = useCallback(async (mid: string) => {
    setLoading(true);
    const [mRes, aRes] = await Promise.all([
      supabase.from("meeting")
        .select("id, title, meeting_type, status, occurred_at, duration_seconds, transcript, attendees")
        .eq("id", mid).is("deleted_at", null).maybeSingle(),
      supabase.from("meeting_action")
        .select("id, description, owner_name, due_date, status")
        .eq("meeting_id", mid).is("deleted_at", null).order("created_at", { ascending: true }),
    ]);
    if (mRes.error || !mRes.data) {
      logger.error("Failed to load meeting", mRes.error);
      setMeeting(null);
    } else {
      const m = mRes.data as unknown as Meeting;
      setMeeting(m);
      setTranscript(m.transcript ?? "");
      setAttendeesText((m.attendees ?? []).map((a) => a.name).join(", "));
      setActions((aRes.data as Action[] | null) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (id) void load(id); }, [id, load]);

  const saveDetails = async () => {
    if (!meeting) return;
    setSaving(true);
    const attendees = attendeesText
      .split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
    const { error } = await supabase.from("meeting")
      .update({ transcript: transcript.trim(), attendees })
      .eq("id", meeting.id);
    setSaving(false);
    if (error) { logger.error("Save meeting failed", error); toast.error("Couldn't save"); return; }
    toast.success("Saved");
    setMeeting({ ...meeting, transcript: transcript.trim(), attendees });
  };

  const setStatus = async (status: "DRAFT" | "FINAL") => {
    if (!meeting) return;
    const { error } = await supabase.from("meeting").update({ status }).eq("id", meeting.id);
    if (error) { logger.error("Status change failed", error); toast.error("Couldn't update"); return; }
    setMeeting({ ...meeting, status });
    toast.success(status === "FINAL" ? "Meeting finalised" : "Reopened for editing");
  };

  const removeMeeting = async () => {
    if (!meeting) return;
    const { error } = await supabase.from("meeting")
      .update({ deleted_at: new Date().toISOString() }).eq("id", meeting.id);
    if (error) { logger.error("Delete meeting failed", error); toast.error("Couldn't delete"); return; }
    toast.success("Meeting deleted");
    navigate("/governance?tab=meetings");
  };

  const addAction = async () => {
    if (!meeting || !newAction.trim()) return;
    const { data, error } = await supabase.from("meeting_action")
      .insert({
        practice_id: practiceId,
        meeting_id: meeting.id,
        description: newAction.trim(),
        owner_name: newOwner.trim() || null,
        due_date: newDue || null,
      })
      .select("id, description, owner_name, due_date, status")
      .single();
    if (error || !data) { logger.error("Add action failed", error); toast.error("Couldn't add action"); return; }
    setActions((prev) => [...prev, data as Action]);
    setNewAction(""); setNewOwner(""); setNewDue("");
  };

  const toggleAction = async (a: Action) => {
    const next = a.status === "DONE" ? "OPEN" : "DONE";
    const { error } = await supabase.from("meeting_action")
      .update({ status: next, completed_at: next === "DONE" ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (error) { logger.error("Toggle action failed", error); toast.error("Couldn't update"); return; }
    setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
  };

  const deleteAction = async (a: Action) => {
    const { error } = await supabase.from("meeting_action")
      .update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { logger.error("Delete action failed", error); toast.error("Couldn't remove"); return; }
    setActions((prev) => prev.filter((x) => x.id !== a.id));
  };

  if (loading) {
    return (
      <Layout title="Meeting">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!meeting) {
    return (
      <Layout title="Meeting">
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">This meeting couldn't be found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/governance?tab=meetings")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to meetings
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={meeting.title}>
      <div className="mx-auto max-w-3xl space-y-5">
        <button
          onClick={() => navigate("/governance?tab=meetings")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Meetings
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{TYPE_LABEL[meeting.meeting_type] ?? meeting.meeting_type}</span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(parseISO(meeting.occurred_at), "d MMM yyyy, HH:mm")}
              </span>
              {meeting.duration_seconds > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.max(1, Math.round(meeting.duration_seconds / 60))} min
                </span>
              )}
              {isFinal && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  Final
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFinal ? (
              <Button variant="outline" size="sm" onClick={() => setStatus("DRAFT")}>
                <LockOpen className="mr-1.5 h-4 w-4" /> Reopen
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStatus("FINAL")}>
                <Lock className="mr-1.5 h-4 w-4" /> Finalise
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The minuted record and its action items will be removed. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={removeMeeting}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Attendees */}
        <div className="space-y-1.5">
          <Label htmlFor="attendees">Attendees</Label>
          <Input
            id="attendees"
            value={attendeesText}
            onChange={(e) => setAttendeesText(e.target.value)}
            placeholder="Comma-separated names, e.g. Dr Chen, Maya, James"
            disabled={isFinal}
          />
        </div>

        {/* Transcript */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="transcript">Transcript / minutes</Label>
            {!isFinal && (
              <Button size="sm" variant="outline" onClick={saveDetails} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" /> Save
              </Button>
            )}
          </div>
          <Textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="min-h-[260px] font-mono text-sm leading-relaxed"
            disabled={isFinal}
            placeholder="No transcript captured."
          />
        </div>

        {/* Action items */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Action items</h2>
            <span className="text-xs text-muted-foreground">
              ({actions.filter((a) => a.status === "OPEN").length} open)
            </span>
          </div>

          {actions.length > 0 && (
            <div className="divide-y rounded-lg border">
              {actions.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={a.status === "DONE"}
                    onCheckedChange={() => toggleAction(a)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${a.status === "DONE" ? "text-muted-foreground line-through" : ""}`}>
                      {a.description}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {a.owner_name && <span>{a.owner_name}</span>}
                      {a.due_date && <span>Due {format(parseISO(a.due_date), "d MMM yyyy")}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAction(a)}
                    aria-label="Remove action"
                    className="text-muted-foreground/60 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!isFinal && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">New action</Label>
                <Input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="What needs doing?" />
              </div>
              <div className="space-y-1 sm:w-36">
                <Label className="text-xs">Owner</Label>
                <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Name" />
              </div>
              <div className="space-y-1 sm:w-40">
                <Label className="text-xs">Due</Label>
                <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
              </div>
              <Button onClick={addAction} disabled={!newAction.trim()} aria-label="Add action">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
