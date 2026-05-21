import { Globe } from "lucide-react";

// Shown when the current hostname has no `practice.custom_hostname` row.
// Either the operator hasn't assigned a hostname yet, or the visitor mistyped
// the URL. We keep this generic — no info about whether it's a typo or
// genuinely unprovisioned, because exposing that would leak which hostnames
// are tenants.
export default function DomainNotConfigured({ hostname }: { hostname: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted">
          <Globe className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Booking app not configured</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono break-all">{hostname}</span> isn't yet set up as a Dentaloptima booking domain.
        </p>
        <p className="text-sm text-muted-foreground">
          If you're a practice owner who's just signed up, ask your Dentaloptima contact to finish DNS + SSL setup. Otherwise check the URL.
        </p>
      </div>
    </div>
  );
}
