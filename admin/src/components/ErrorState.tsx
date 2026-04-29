import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  error: Error | unknown;
  onRetry?: () => void;
}

// Consistent error display across list pages. Shows the message and offers
// a retry button when onRetry is provided (React Query's refetch fits
// perfectly here).
export function ErrorState({ title = "Something went wrong", error, onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="text-xs text-destructive/80 mt-0.5 break-words">{message}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
