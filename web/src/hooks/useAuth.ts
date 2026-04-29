import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, loading };
};

export const useRequireAuth = () => {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const [isStaffActive, setIsStaffActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!session) {
        navigate("/login");
        return;
      }

      // Check if user is active staff
      const checkStaffStatus = async () => {
        const { data, error } = await supabase
          .from("app_staff")
          .select("active")
          .eq("user_id", user?.id)
          .single();

        if (error || !data?.active) {
          navigate("/login");
          setIsStaffActive(false);
        } else {
          setIsStaffActive(true);
        }
      };

      checkStaffStatus();
    }
  }, [session, loading, navigate, user]);

  return { session, user, loading: loading || isStaffActive === null };
};