import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  count?: number;
  className?: string;
}

export function LoadingState({ count = 3, className }: LoadingStateProps) {
  return (
    <div className={`space-y-3 ${className || ""}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function LoadingCard({ className }: { className?: string }) {
  return (
    <div className={`rounded-lg border bg-card p-6 ${className || ""}`}>
      <Skeleton className="h-6 w-1/3 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
