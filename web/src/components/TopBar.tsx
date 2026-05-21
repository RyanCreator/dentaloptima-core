import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SupportBell } from "@/components/SupportBell";
import { HelpButton } from "@/components/help/HelpButton";

interface TopBarProps {
  title: string;
  description?: ReactNode;
  onBack?: () => void;
}

export const TopBar = ({ title, description, onBack }: TopBarProps) => {
  return (
    <header className="h-14 border-b bg-card flex items-center px-4 gap-3">
      <SidebarTrigger />
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back"
          className="h-8 w-8 p-0 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <div className="flex-1 min-w-0 leading-tight">
        <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>
      <HelpButton />
      <SupportBell />
    </header>
  );
};
