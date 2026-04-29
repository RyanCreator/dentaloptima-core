// Compatibility stub for the legacy multi-tenant bootstrap.
// dentaloptima-core uses a single Supabase project, so there's no tenant
// resolution to do — the booking app authenticates a practice_member,
// and RLS scopes data to their practice automatically.

export interface TenantConfig {
  hostname: string;
  practiceName: string;
  contactEmail: string | null;
  supabaseUrl: string;
  supabaseAnonKey: string;
  branding: TenantBranding;
  active: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
}

export interface TenantBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "warning" | "critical";
  startsAt: string;
  endsAt: string | null;
}

export class TenantLoadError extends Error {
  constructor(public hostname: string, public status: number | undefined, message: string) {
    super(message);
    this.name = "TenantLoadError";
  }
}

export async function loadTenantConfig(): Promise<TenantConfig> {
  return {
    hostname: window.location.hostname,
    practiceName: "Dentaloptima",
    contactEmail: null,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    branding: {},
    active: true,
    trialEndsAt: null,
    paidUntil: null,
  };
}
