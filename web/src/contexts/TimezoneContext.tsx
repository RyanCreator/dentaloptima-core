import { createContext, useContext, useEffect, ReactNode } from "react";
import { setClinicTimezone } from "@/lib/constants";
import { getTenantOrNull } from "@/lib/tenantBranding";

// Timezone now comes from the practice row resolved at bootstrap by
// PracticeBootstrap, not from the legacy `app_settings` table. We expose
// it through the same context-shaped API the lifted code expects.
//
// During the brief moment before PracticeBootstrap completes, getTenant
// returns null — we fall back to Europe/London. As soon as the tenant
// resolves, the provider re-reads on its first effect tick.

interface TimezoneContextType {
  timezone: string;
  loading: boolean;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: "Europe/London",
  loading: true,
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  // Read directly from the module-level tenant cache. PracticeBootstrap
  // populates this before any of its descendants render, so by the time
  // any component reads useTimezone, it's set.
  const tenant = getTenantOrNull();
  const timezone = tenant?.practice.timezone ?? "Europe/London";

  // Push into the constants cache for non-React callers.
  useEffect(() => {
    if (timezone) setClinicTimezone(timezone);
  }, [timezone]);

  return (
    <TimezoneContext.Provider value={{ timezone, loading: false }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error("useTimezone must be used within TimezoneProvider");
  }
  return context.timezone;
}
