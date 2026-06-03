import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Inbox, ShieldAlert, MessageSquare, Mail, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useNewEnquiriesCount } from "@/hooks/useNewEnquiriesCount";
import { useGovernanceAttention } from "@/hooks/useGovernanceAttention";
import { useSupportUnreadCount } from "@/hooks/useSupport";

// Top-bar notifications hub. Aggregates the actionable alerts from across
// the app into one popover that's reachable from every page — so you
// don't have to go back to the dashboard to see "what needs me".
//
// Each category reuses an existing count hook so we're not re-querying;
// the only new query is the queued patient-emails count (same source as
// the calendar's mail tray).

export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { count: enquiries } = useNewEnquiriesCount();
  const governance = useGovernanceAttention();
  const { unread: supportUnread } = useSupportUnreadCount();
  const emailsPending = useQueuedEmailCount();

  const governanceTotal =
    governance.incidentsOpen +
    governance.complaintsAwaitingAck +
    governance.safeguardingOpen +
    governance.policiesUnackedByMe +
    governance.policiesReviewOverdue +
    governance.retentionEligible;

  const total = enquiries + governanceTotal + supportUnread + emailsPending;

  const rows: AlertRow[] = [
    {
      key: "enquiries",
      icon: Inbox,
      label: "New enquiries",
      count: enquiries,
      to: "/enquiries",
    },
    {
      key: "governance",
      icon: ShieldAlert,
      label: "Governance attention",
      count: governanceTotal,
      to: "/governance",
    },
    {
      key: "support",
      icon: MessageSquare,
      label: "Support replies",
      count: supportUnread,
      to: "/support",
    },
    {
      key: "emails",
      icon: Mail,
      label: "Patient emails to send",
      count: emailsPending,
      to: "/calendar",
    },
  ];

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={total > 0 ? `${total} items need attention` : "Notifications"}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold text-white bg-red-500 rounded-full">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2.5 border-b">
          <p className="text-sm font-semibold">Needs attention</p>
        </div>
        <div className="divide-y">
          {rows.map((row) => (
            <button
              key={row.key}
              onClick={() => go(row.to)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                row.count === 0 && "opacity-55",
              )}
            >
              <row.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate">{row.label}</span>
              {row.count > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold shrink-0">
                  {row.count > 99 ? "99+" : row.count}
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
        <div className="px-3 py-2.5 border-t text-center">
          {total === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing needs you right now 👍</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Tap any item to jump straight to it.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface AlertRow {
  key: string;
  icon: React.ElementType;
  label: string;
  count: number;
  to: string;
}

// Count of appointments with a pending patient notification (reschedule /
// cancellation emails queued from the calendar but not yet sent). Same
// source as the calendar's mail tray; lightweight head-count query +
// realtime so the bell badge stays live.
function useQueuedEmailCount(): number {
  const [count, setCount] = useState(0);
  const channelId = useId();

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const { count: c, error } = await supabase
        .from("appointment")
        .select("*", { count: "exact", head: true })
        .not("notification_pending", "is", null)
        .is("deleted_at", null);
      if (!cancelled && !error && c !== null) setCount(c);
    };
    void fetchCount();

    const channel = supabase
      .channel(`notif-bell-queued-emails-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment" },
        () => void fetchCount(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [channelId]);

  return count;
}
