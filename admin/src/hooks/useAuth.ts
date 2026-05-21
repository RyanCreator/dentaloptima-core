import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabaseRegistry } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Two-DB architecture: operator auth lives in tenant-registry. The admin
// app authenticates against tenant-registry's auth.users; operator status
// is determined by a row in tenant-registry's `admin_user` table where
// `active = true`. There's no auth in dentaloptima-core for operators —
// cross-DB calls go through edge functions that verify this same JWT.

export interface AuthState {
  loading: boolean;
  session: Session | null;
  isOperator: boolean;
  // Snapshot of the admin_user row's id + email — handy for hooks that
  // need to attribute writes (e.g. claimed_by_email on support threads).
  operator: { id: string; email: string } | null;
}

let signOutInProgress = false;

export async function signOutCleanly() {
  signOutInProgress = true;
  try {
    await supabaseRegistry.auth.signOut();
  } finally {
    setTimeout(() => {
      signOutInProgress = false;
    }, 1000);
  }
}

// Subscribes to tenant-registry auth + checks the admin_user table to
// confirm operator status. Anyone signed in but without an active
// admin_user row is treated as unauthenticated for the admin app.
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    isOperator: false,
    operator: null,
  });

  useEffect(() => {
    let active = true;
    let hadSession = false;

    async function check(session: Session | null) {
      if (!session) {
        if (active)
          setState({ loading: false, session: null, isOperator: false, operator: null });
        return;
      }
      try {
        // admin_user is RLS-protected; operators can only see their own row.
        // user_id matches auth.users.id from tenant-registry's auth.
        const { data, error } = await supabaseRegistry
          .from("admin_user")
          .select("id, email, active")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .maybeSingle();

        if (error) throw error;

        if (active) {
          setState({
            loading: false,
            session,
            isOperator: !!data,
            operator: data ? { id: data.id, email: data.email } : null,
          });
        }
      } catch (err) {
        // Keep prior state on transient errors so a flaky network doesn't
        // kick the operator out mid-session.
        console.error(
          "[useAuth] admin_user lookup failed — keeping prior state",
          err,
        );
        if (active) {
          setState((prev) => ({
            loading: false,
            session,
            isOperator: prev.isOperator,
            operator: prev.operator,
          }));
        }
      }
    }

    supabaseRegistry.auth.getSession().then(({ data: { session } }) => {
      hadSession = !!session;
      check(session);
    });
    const {
      data: { subscription },
    } = supabaseRegistry.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && hadSession && !signOutInProgress) {
        toast.error("Your session expired — please sign in again.");
      }
      hadSession = !!session;
      check(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
