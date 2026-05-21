import { useCallback, useEffect, useState } from "react";
import { getRegistryClient } from "@/lib/registryClient";
import { usePractice } from "@/contexts/PracticeContext";

// Fetches active platform announcements that target this practice.
// Calls the registry's `list_announcements_for_practice` RPC, which
// applies audience filtering server-side. Polls every 5 minutes so a
// freshly-posted maintenance notice surfaces without a manual refresh.

export type PlatformSeverity = "info" | "warning" | "critical";

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string | null;
  severity: PlatformSeverity;
  starts_at: string;
  ends_at: string | null;
}

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function usePlatformAnnouncements() {
  const tenant = usePractice();
  const practiceId = tenant.practice.id;
  const status = tenant.practice.status;

  const [items, setItems] = useState<PlatformAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const client = getRegistryClient();
    if (!client) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await client.rpc("list_announcements_for_practice", {
      p_practice_id: practiceId,
      p_status: status,
    });
    if (error) {
      // Soft-fail — we don't want a registry hiccup to break the booking app.
      // eslint-disable-next-line no-console
      console.warn("[announcements] fetch failed", error);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as PlatformAnnouncement[]);
    setLoading(false);
  }, [practiceId, status]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    // Re-fetch when the tab regains focus — operators leaving a tab open
    // overnight should pick up overnight notices when they come back.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { items, loading, refresh };
}
