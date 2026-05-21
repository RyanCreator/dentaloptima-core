import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BookingAppDisabled from "@/pages/status/BookingAppDisabled";

// Wraps protected routes. Three flows:
//   1. Auth state still loading → render nothing (avoids flash of /login).
//   2. No session OR member missing OR member.practice_id ≠ hostname's
//      practice → sign out and redirect to /login.
//   3. Session + matching member + is_active → render children.
//
// The "wrong domain for this account" case (member exists but for a
// different practice) is detected via isAuthenticated returning false. We
// proactively sign the user out and toast the reason — otherwise they'd
// land on /login with no context for why their previous session vanished.
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const tenant = usePractice();

  useEffect(() => {
    // Already authenticated, no-op.
    if (auth.loading || auth.isAuthenticated) return;

    // Has a session but couldn't authenticate against THIS hostname's
    // practice — most common cause is logging in via the wrong domain.
    if (auth.session && !auth.isAuthenticated) {
      const reason =
        auth.member && !auth.member.is_active
          ? "This account is not active. Contact your practice admin."
          : auth.member
          ? "This account belongs to a different practice. Use the booking app for your practice."
          : "Your account isn't linked to this practice.";
      toast.error(reason);
      supabase.auth.signOut();
    }
  }, [auth.loading, auth.isAuthenticated, auth.session, auth.member]);

  if (auth.loading) return null;
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Post-login wall for practices on the website-only plan. Auth still
  // succeeds — this lets the operator see in audit logs that someone tried
  // to use the booking app — but the rest of the app is hidden behind
  // the wall page until the operator flips booking_app_enabled back on.
  if (!tenant.practice.booking_app_enabled) {
    return <BookingAppDisabled />;
  }

  return <>{children}</>;
}
