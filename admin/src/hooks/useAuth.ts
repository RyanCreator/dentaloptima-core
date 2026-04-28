import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface AuthState {
  loading: boolean;
  session: Session | null;
  isOperator: boolean;
}

// Tracks whether a sign-out is intentional (don't show "session expired" toast
// if user clicked sign out themselves).
let signOutInProgress = false;

export async function signOutCleanly() {
  signOutInProgress = true;
  try {
    await supabase.auth.signOut();
  } finally {
    setTimeout(() => {
      signOutInProgress = false;
    }, 1000);
  }
}

// Subscribes to auth + checks operator status via the is_operator() RPC.
// Anyone signed in but without the is_operator app_metadata flag is treated
// as unauthenticated for the admin app — they belong in the booking app.
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    isOperator: false,
  });

  useEffect(() => {
    let active = true;
    let hadSession = false;

    async function check(session: Session | null) {
      if (!session) {
        if (active) setState({ loading: false, session: null, isOperator: false });
        return;
      }
      try {
        const { data: isOperator, error } = await supabase.rpc("is_operator");
        if (error) throw error;
        if (active) {
          setState({ loading: false, session, isOperator: Boolean(isOperator) });
        }
      } catch (err) {
        // Keep prior isOperator value on transient errors so a flaky network
        // doesn't kick the operator out mid-session.
        console.error("[useAuth] is_operator RPC failed — keeping prior state", err);
        if (active) {
          setState((prev) => ({ loading: false, session, isOperator: prev.isOperator }));
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      hadSession = !!session;
      check(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
