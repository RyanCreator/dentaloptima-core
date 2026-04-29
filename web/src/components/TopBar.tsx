import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SupportBell } from "@/components/SupportBell";

interface TopBarProps {
  title: string;
  onBack?: () => void;
}

export const TopBar = ({ title, onBack }: TopBarProps) => {
  return (
    <header className="h-14 border-b bg-card flex items-center px-4 gap-3">
      <SidebarTrigger />
      <h1 className="text-xl font-semibold flex-1">{title}</h1>
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </Button>
      )}
      <SupportBell />
    </header>
  );
};