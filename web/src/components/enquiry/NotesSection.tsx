import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Note {
  id: string;
  body: string;
  created_at: string;
  staff: {
    full_name: string;
  };
}

interface NotesSectionProps {
  notes: Note[];
  entityType: string;
  entityId: string;
  userId: string;
  onNotesUpdated: () => void;
}

export function NotesSection({
  notes,
  entityType,
  entityId,
  userId,
  onNotesUpdated,
}: NotesSectionProps) {
  const [newNote, setNewNote] = useState("");

  const addNote = async () => {
    if (!newNote.trim()) return;

    const { data: staffData } = await supabase
      .from("app_staff")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!staffData) return;

    const { error } = await supabase.from("note").insert({
      entity_type: entityType,
      entity_id: entityId,
      staff_id: staffData.id,
      body: newNote,
    });

    if (error) {
      toast.error("Failed to add note");
    } else {
      setNewNote("");
      onNotesUpdated();
    }
  };

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold">Notes</h3>

      <div className="space-y-2">
        <Textarea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
        />
        <Button onClick={addNote} size="sm">
          Add Note
        </Button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {notes.map((note) => (
          <div key={note.id} className="bg-muted rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm flex-1">{note.body}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{note.staff.full_name}</span>
              <span>{format(new Date(note.created_at), "PPp")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
