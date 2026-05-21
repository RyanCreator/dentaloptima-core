import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

// Tracks the patient profiles the current user has opened recently, so we
// can show a "recently viewed" strip above the calendar. localStorage-only
// (per device, per practice) — not synced across browsers, which is fine
// since this is a UX shortcut, not a record of access. The audit table
// captures real access.
//
// Stored as a per-practice key so a logged-in user who works across
// practices (rare, but possible for owners) doesn't see another practice's
// list leaked into the current one.

const STORAGE_KEY_PREFIX = "dentaloptima:recent_patients:";
const MAX_ENTRIES = 8;

export interface RecentPatient {
  id: string;
  full_name: string;
  /** Epoch ms — most-recent first when sorting. */
  last_seen: number;
}

function storageKey(practiceId: string | null | undefined): string | null {
  if (!practiceId) return null;
  return `${STORAGE_KEY_PREFIX}${practiceId}`;
}

function readList(practiceId: string | null | undefined): RecentPatient[] {
  const key = storageKey(practiceId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPatient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt JSON — toss it and start fresh.
    return [];
  }
}

function writeList(practiceId: string | null | undefined, list: RecentPatient[]): void {
  const key = storageKey(practiceId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage full / disabled — give up silently. This is a convenience
    // feature, not a guarantee.
  }
}

export function useRecentPatients() {
  const auth = useAuth();
  const practiceId = auth.member?.practice_id ?? null;
  const [recent, setRecent] = useState<RecentPatient[]>(() => readList(practiceId));

  // Re-read on practice change. (Member switching practices is rare but
  // possible — owners managing multiple sites.)
  useEffect(() => {
    setRecent(readList(practiceId));
  }, [practiceId]);

  const track = useCallback(
    (patient: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null }) => {
      if (!patient.id || !practiceId) return;
      const name =
        patient.full_name?.trim() ||
        [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim() ||
        "Unnamed";
      const entry: RecentPatient = { id: patient.id, full_name: name, last_seen: Date.now() };
      const current = readList(practiceId);
      const next = [entry, ...current.filter((p) => p.id !== entry.id)].slice(0, MAX_ENTRIES);
      writeList(practiceId, next);
      setRecent(next);
    },
    [practiceId],
  );

  const clear = useCallback(() => {
    if (!practiceId) return;
    writeList(practiceId, []);
    setRecent([]);
  }, [practiceId]);

  return { recent, track, clear };
}
