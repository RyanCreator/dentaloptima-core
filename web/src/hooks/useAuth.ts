import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getTenantOrNull } from "@/lib/tenantBranding";
import type { Session, User } from "@supabase/supabase-js";

// practice_member fields the booking app actually reads. The full row has
// more (rotas, permissions, etc.) but for auth gating we only need these.
export interface MemberRow {
  id: string;
  practice_id: string;
  user_id: string;
  role: "OWNER" | "ADMIN" | "DENTIST" | "HYGIENIST" | "NURSE" | "RECEPTIONIST";
  full_name: string | null;
  email: string;
  is_active: boolean;
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  member: MemberRow | null;
  // True when ALL of: session exists, member row found, member.is_active,
  // member.practice_id matches the hostname's practice. Use this for routing
  // instead of checking session alone.
  isAuthenticated: boolean;
}

// Subscribes to auth changes and resolves the matching practice_member row
// for the current hostname's practice. RLS guarantees we only see members
// of the caller's own practice — so the lookup either finds the row or
// finds nothing (cross-tenant attempt).
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    member: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    let active = true;

    async function resolveMember(session: Session | null) {
      if (!session) {
        if (active) {
          setState({
            loading: false,
            session: null,
            user: null,
            member: null,
            isAuthenticated: false,
          });
        }
        return;
      }

      const tenant = getTenantOrNull();
      if (!tenant) {
        // Bootstrap hasn't finished yet — wait for the auth state change to
        // refire after PracticeBootstrap completes. Shouldn't normally
        // happen because RequireAuth is rendered inside PracticeBootstrap.
        if (active) {
          setState({
            loading: false,
            session,
            user: session.user,
            member: null,
            isAuthenticated: false,
          });
        }
        return;
      }

      const { data: memberRows, error } = await supabase
        .from("practice_member")
        .select("id, practice_id, user_id, role, full_name, email, is_active")
        .eq("user_id", session.user.id)
        .limit(1);

      if (!active) return;

      if (error) {
        console.error("[useAuth] practice_member lookup failed", error);
        setState({
          loading: false,
          session,
          user: session.user,
          member: null,
          isAuthenticated: false,
        });
        return;
      }

      const member = (memberRows?.[0] ?? null) as MemberRow | null;
      const matchesHostnamePractice = member?.practice_id === tenant.practice.id;
      const authenticated = Boolean(member && member.is_active && matchesHostnamePractice);

      setState({
        loading: false,
        session,
        user: session.user,
        member,
        isAuthenticated: authenticated,
      });
    }

    supabase.auth.getSession().then(({ data: { session } }) => resolveMember(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveMember(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

// Convenience for sign-out: cleans the supabase session and routes to /login.
export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };
}

// Legacy compat: many lifted pages call useRequireAuth() to get { session,
// user, loading }. Routing-level guards already redirect via <RequireAuth>,
// so this hook just exposes the auth state without any side-effects. The
// shape matches what the lifted code expects.
export function useRequireAuth() {
  const auth = useAuth();
  return {
    session: auth.session,
    user: auth.user,
    loading: auth.loading,
  };
}
