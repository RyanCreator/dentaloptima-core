import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Renders nothing while auth is in flight, redirects to /login if the user
// isn't signed in or isn't an operator. Children only mount after the check
// passes, so data-fetching hooks inside them never fire as anonymous.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!auth.session || !auth.isOperator) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
