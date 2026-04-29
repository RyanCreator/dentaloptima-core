import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface DetailSheetProps {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  description?: string;
}

export const DetailSheet = ({
  trigger,
  title,
  children,
  open,
  onOpenChange,
  description,
}: DetailSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {/* Add SheetDescription for accessibility - hidden if no description provided */}
          <SheetDescription className={description ? "" : "sr-only"}>
            {description || "View and edit details"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
};
