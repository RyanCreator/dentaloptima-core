import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setClinicTimezone } from "@/lib/constants";

interface TimezoneContextType {
  timezone: string;
  loading: boolean;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: "Europe/London",
  loading: true,
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezone] = useState("Europe/London");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimezone();
  }, []);

  const loadTimezone = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("timezone")
      .single();

    if (!error && data?.timezone) {
      setTimezone(data.timezone);
      // Cache timezone for use in non-React code
      setClinicTimezone(data.timezone);
    }
    setLoading(false);
  };

  return (
    <TimezoneContext.Provider value={{ timezone, loading }}>
      {children}
    </TimezoneContext.Provider>
  );
}

/**
 * Hook to get the configured clinic timezone
 * Returns the timezone from settings, defaults to Europe/London
 */
export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error("useTimezone must be used within TimezoneProvider");
  }
  return context.timezone;
}

