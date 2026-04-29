import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnreadInboundCount } from "@/hooks/useSupport";

export function SupportBell() {
  const navigate = useNavigate();
  const unread = useUnreadInboundCount();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/support")}
      aria-label={unread > 0 ? `${unread} new support messages` : "Support inbox"}
      className="relative"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold text-white bg-red-500 rounded-full">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );
}
