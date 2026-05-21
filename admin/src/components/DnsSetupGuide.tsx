import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Practice } from "@/hooks/useTenants";

// Infrastructure boundaries. Hardcoded because they're our hosting layout,
// not per-tenant config. If we move hosting providers, change here.
const CNAME_TARGET = "app.dentaloptima.co.uk"; // booking app hostname
// SiteGround's nameservers — practices in NS-delegation mode point their
// domain at these, then we manage the DNS records via SiteGround's panel.
const NAMESERVER_HOSTS = [
  "ns1.siteground.net",
  "ns2.siteground.net",
];

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const CHECK_TIMEOUT_MS = 5000;
// localStorage key prefix for the per-tenant delegation-mode choice. We
// persist so the operator doesn't reselect every time they open the page.
const MODE_STORAGE_PREFIX = "dns-mode:";

type DelegationMode = "ns" | "cname";

// All checks reduce to a yes/no/issue tri-state per phase. We track each
// phase independently, then derive the overall pill from the worst one.
// `null` = check not run yet (idle / hasn't completed for this mode).
type Tri = "ok" | "fail" | "wrong" | null;

interface CheckResult {
  // NS at the apex of `custom_hostname` resolves to our nameservers.
  // Only meaningful in `ns` mode; null in `cname` mode.
  ns: Tri;
  nsActual?: string[];
  // CNAME for `custom_hostname` points at CNAME_TARGET. Meaningful in both
  // modes — in `ns` mode, this confirms WE added the record correctly;
  // in `cname` mode, it confirms the practice did.
  cname: Tri;
  cnameActual?: string;
  // HTTPS reachable. Meaningful in both modes; failure usually means SSL
  // provisioning hasn't finished.
  https: Tri;
  // Set when something blew up unrelated to configuration (DoH down, network).
  error?: string;
  // True while a check is in flight.
  checking: boolean;
}

const INITIAL_RESULT: CheckResult = {
  ns: null,
  cname: null,
  https: null,
  checking: false,
};

interface DnsSetupGuideProps {
  practice: Practice;
}

export function DnsSetupGuide({ practice }: DnsSetupGuideProps) {
  const hostname = practice.custom_hostname;

  if (!hostname) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-4">
        <div className="flex items-start gap-3">
          <Globe className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">No booking hostname assigned</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Until a hostname is set and DNS propagates, this practice's apps
              won't load. Click <span className="font-medium">Edit</span> above
              to assign one (e.g.{" "}
              <code className="bg-background px-1 py-0.5 rounded">
                app.optimadental.co.uk
              </code>
              ).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DnsSetupGuideForHostname
      hostname={hostname}
      practiceId={practice.id}
    />
  );
}

function DnsSetupGuideForHostname({
  hostname,
  practiceId,
}: {
  hostname: string;
  practiceId: string;
}) {
  // Special case: when the tenant's hostname IS the canonical booking-app
  // host (e.g. our own dog-fooding tenant lives at app.dentaloptima.co.uk),
  // there are no DNS records to add — the host already serves the app
  // directly. Branch happens BEFORE any hooks so React's hook-order rules
  // aren't broken by the conditional return.
  const isCanonicalHost =
    hostname.replace(/\.$/, "").toLowerCase() === CNAME_TARGET.toLowerCase();
  if (isCanonicalHost) {
    return <CanonicalHostPanel hostname={hostname} />;
  }

  return <DnsSetupGuideEditable hostname={hostname} practiceId={practiceId} />;
}

function DnsSetupGuideEditable({
  hostname,
  practiceId,
}: {
  hostname: string;
  practiceId: string;
}) {
  // Per-tenant mode preference. Default to NS for full-package practices —
  // it's the path with the simplest practice-side workflow (one nameserver
  // change and we handle the rest).
  const [mode, setMode] = useState<DelegationMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_PREFIX + practiceId);
    return saved === "cname" || saved === "ns" ? saved : "ns";
  });
  const [result, setResult] = useState<CheckResult>(INITIAL_RESULT);

  const apex = useMemo(() => apexDomain(hostname), [hostname]);
  const subdomain = useMemo(() => cnameSubdomainLabel(hostname), [hostname]);
  const isApex = subdomain === "@";

  const setModePersistent = (next: DelegationMode) => {
    setMode(next);
    localStorage.setItem(MODE_STORAGE_PREFIX + practiceId, next);
    // Clear stale results so we don't show "OK" for a check that wasn't
    // relevant in the new mode.
    setResult(INITIAL_RESULT);
  };

  // Re-runs both DNS lookups (mode-dependent) and the HTTPS reachability
  // check in parallel. Each phase updates independently so the UI tells
  // the operator exactly which step is failing.
  const runCheck = useCallback(async () => {
    setResult({ ...INITIAL_RESULT, checking: true });
    try {
      const checks: Promise<Partial<CheckResult>>[] = [];

      if (mode === "ns") {
        checks.push(
          (async (): Promise<Partial<CheckResult>> => {
            const actual = await resolveNs(apex);
            if (actual.length === 0) return { ns: "fail" };
            const expected = new Set(
              NAMESERVER_HOSTS.map((h) => h.toLowerCase()),
            );
            const allMatch = actual.every((ns) =>
              expected.has(ns.replace(/\.$/, "").toLowerCase()),
            );
            return allMatch
              ? { ns: "ok", nsActual: actual }
              : { ns: "wrong", nsActual: actual };
          })(),
        );
      }

      checks.push(
        (async (): Promise<Partial<CheckResult>> => {
          const actual = await resolveCname(hostname);
          if (!actual) return { cname: "fail" };
          const normalised = actual.replace(/\.$/, "").toLowerCase();
          return normalised === CNAME_TARGET.toLowerCase()
            ? { cname: "ok", cnameActual: actual }
            : { cname: "wrong", cnameActual: actual };
        })(),
      );

      checks.push(
        (async (): Promise<Partial<CheckResult>> => {
          const reachable = await isHttpsReachable(hostname);
          return { https: reachable ? "ok" : "fail" };
        })(),
      );

      const settled = await Promise.allSettled(checks);
      const merged: CheckResult = { ...INITIAL_RESULT };
      for (const s of settled) {
        if (s.status === "fulfilled") {
          Object.assign(merged, s.value);
        } else {
          merged.error =
            s.reason instanceof Error ? s.reason.message : "Check failed";
        }
      }
      setResult(merged);
    } catch (err) {
      setResult({
        ...INITIAL_RESULT,
        error: err instanceof Error ? err.message : "Check failed",
      });
    }
  }, [mode, hostname, apex]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  // Overall pill state — derived from the per-phase results + mode.
  const overall = deriveOverallStatus(mode, result);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold">Booking hostname</h2>
          </div>
          <a
            href={`https://${hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-primary hover:underline break-all inline-flex items-center gap-1.5"
          >
            {hostname}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusPill overall={overall} />
          <Button
            variant="ghost"
            size="sm"
            onClick={runCheck}
            disabled={result.checking}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 mr-1",
                result.checking && "animate-spin",
              )}
            />
            Re-check
          </Button>
        </div>
      </div>

      {/* Mode toggle. Operator picks which delegation method this tenant
          uses. Persisted per practice in localStorage so we don't quiz
          them every visit. */}
      <ModeToggle mode={mode} onChange={setModePersistent} />

      {/* Apex-domain warning is mode-specific. CNAME at the apex is
          impossible at most registrars — but with NS delegation, we can
          point the apex at us via A or ALIAS records ourselves, so the
          warning only applies in CNAME mode. */}
      {mode === "cname" && isApex && (
        <Banner kind="warn">
          <strong>Apex domain detected.</strong> Most registrars don't allow
          CNAME records at the root (e.g.{" "}
          <code className="bg-background px-1 rounded">{hostname}</code>). The
          practice will need ALIAS / ANAME, or switch this tenant to{" "}
          <strong>Nameserver delegation</strong> mode above so we manage the
          apex directly.
        </Banner>
      )}

      {result.error && (
        <Banner kind="muted">
          Couldn't run the check: {result.error}. The DoH endpoint may be
          rate-limiting; try again in a few seconds.
        </Banner>
      )}

      {mode === "ns" ? (
        <NsModeSteps
          hostname={hostname}
          apex={apex}
          subdomain={subdomain}
          result={result}
        />
      ) : (
        <CnameModeSteps
          hostname={hostname}
          subdomain={subdomain}
          result={result}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  onChange,
}: {
  mode: DelegationMode;
  onChange: (next: DelegationMode) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-1 inline-flex gap-1">
      <ModeButton
        active={mode === "ns"}
        onClick={() => onChange("ns")}
        title="Practice changes nameservers; we own all DNS records and SSL"
      >
        Nameserver delegation
      </ModeButton>
      <ModeButton
        active={mode === "cname"}
        onClick={() => onChange("cname")}
        title="Practice keeps their nameservers and adds a CNAME themselves"
      >
        CNAME
      </ModeButton>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "text-xs font-medium px-3 py-1.5 rounded transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// NS-mode steps
// ---------------------------------------------------------------------------

function NsModeSteps({
  hostname,
  apex,
  subdomain,
  result,
}: {
  hostname: string;
  apex: string;
  subdomain: string;
  result: CheckResult;
}) {
  const nsDone = result.ns === "ok";
  const cnameDone = result.cname === "ok";
  const httpsDone = result.https === "ok";

  return (
    <div className="space-y-3">
      {/* NS misconfigured banner — operator-facing diagnostic */}
      {result.ns === "wrong" && result.nsActual && (
        <Banner kind="error">
          <strong>Nameservers point somewhere else.</strong>
          <RecordDiff
            label="Currently"
            value={result.nsActual.join(", ")}
          />
          <RecordDiff
            label="Should be"
            value={NAMESERVER_HOSTS.join(", ")}
          />
        </Banner>
      )}

      <Step
        number={1}
        title="Nameserver change at the registrar"
        done={nsDone}
        inProgress={result.checking && !nsDone}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Practice changes the nameservers on{" "}
          <code className="bg-background border px-1 rounded font-mono">
            {apex}
          </code>{" "}
          at their registrar (the only thing they need to do — we handle
          the rest):
        </p>
        {NAMESERVER_HOSTS.map((ns, i) => (
          <DnsRecordRow
            key={ns}
            label={`NS ${i + 1}`}
            value={ns}
            mono
            copyable
          />
        ))}
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Nameserver changes can take up to 48h to propagate, but usually
          finish in a few hours.
        </p>
      </Step>

      <Step
        number={2}
        title="DNS records (we add these)"
        done={cnameDone}
        inProgress={nsDone && !cnameDone}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Once nameservers are pointing at us, add this in our DNS console
          for the booking app:
        </p>
        <DnsRecordRow label="Type" value="CNAME" mono />
        <DnsRecordRow
          label="Name / Host"
          value={subdomain}
          mono
          copyable
        />
        <DnsRecordRow
          label="Target"
          value={CNAME_TARGET}
          mono
          copyable
        />
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          For the marketing site (if enabled), also add an A record on the
          apex/www pointing to our marketing host. The "Re-check" button
          confirms the booking-app CNAME resolves correctly.
        </p>
      </Step>

      <Step
        number={3}
        title="SSL provisioning (auto)"
        done={httpsDone}
        inProgress={cnameDone && !httpsDone}
      >
        <p className="text-xs text-muted-foreground">
          Let's Encrypt auto-provisions on our hosting once DNS resolves.
          Usually takes 5–15 minutes after the records appear.
        </p>
      </Step>

      <Step
        number={4}
        title="Verification"
        done={httpsDone}
        inProgress={false}
      >
        <p className="text-xs text-muted-foreground">
          {httpsDone ? (
            <>
              Tenant is live —{" "}
              <a
                href={`https://${hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                open the site
              </a>{" "}
              to confirm.
            </>
          ) : (
            <>
              When all the boxes above are ticked,{" "}
              <code className="bg-background border px-1 rounded font-mono">
                https://{hostname}
              </code>{" "}
              will load.
            </>
          )}
        </p>
      </Step>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CNAME-mode steps (the original flow)
// ---------------------------------------------------------------------------

function CnameModeSteps({
  hostname,
  subdomain,
  result,
}: {
  hostname: string;
  subdomain: string;
  result: CheckResult;
}) {
  const cnameDone = result.cname === "ok";
  const httpsDone = result.https === "ok";

  return (
    <div className="space-y-3">
      {result.cname === "wrong" && result.cnameActual && (
        <Banner kind="error">
          <strong>DNS is pointing somewhere else.</strong>
          <RecordDiff label="Currently" value={result.cnameActual} />
          <RecordDiff label="Should be" value={CNAME_TARGET} />
        </Banner>
      )}

      <Step
        number={1}
        title="DNS at the registrar (practice does this)"
        done={cnameDone}
        inProgress={result.checking && !cnameDone}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Practice adds this CNAME at their domain host (123-reg, GoDaddy,
          Cloudflare, etc.):
        </p>
        <DnsRecordRow label="Type" value="CNAME" mono />
        <DnsRecordRow
          label="Name / Host"
          value={subdomain}
          mono
          copyable
        />
        <DnsRecordRow
          label="Target / Value"
          value={CNAME_TARGET}
          mono
          copyable
        />
        <DnsRecordRow label="TTL" value="3600 (or auto)" mono />
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Propagation usually takes a few minutes; up to 24h on the slower
          registrars.
        </p>
      </Step>

      <Step
        number={2}
        title="SSL on our hosting"
        done={httpsDone}
        inProgress={cnameDone && !httpsDone}
      >
        <p className="text-xs text-muted-foreground mb-2">
          Once DNS resolves, an operator adds{" "}
          <code className="bg-background border px-1 rounded font-mono">
            {hostname}
          </code>{" "}
          as a parked domain in our hosting console so Let's Encrypt
          provisions a certificate.
        </p>
        {!cnameDone && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Don't add the parked domain yet — DNS must point at us first or
            the SSL provision will fail.
          </p>
        )}
      </Step>

      <Step
        number={3}
        title="Verification"
        done={httpsDone}
        inProgress={false}
      >
        <p className="text-xs text-muted-foreground">
          {httpsDone ? (
            <>
              Tenant is live —{" "}
              <a
                href={`https://${hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                open the site
              </a>{" "}
              to confirm.
            </>
          ) : (
            <>
              When DNS resolves and SSL is provisioned, the booking app will
              load at{" "}
              <code className="bg-background border px-1 rounded font-mono">
                https://{hostname}
              </code>
              .
            </>
          )}
        </p>
      </Step>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

type OverallStatus =
  | "checking"
  | "live"
  | "ssl_pending"
  | "dns_issue"
  | "ns_issue"
  | "idle";

function deriveOverallStatus(
  mode: DelegationMode,
  r: CheckResult,
): OverallStatus {
  if (r.checking) return "checking";
  // NS-mode-specific: NS issue eclipses everything else.
  if (mode === "ns" && (r.ns === "fail" || r.ns === "wrong")) return "ns_issue";
  if (r.cname === "fail" || r.cname === "wrong") return "dns_issue";
  if (r.cname === "ok" && r.https !== "ok") return "ssl_pending";
  if (r.cname === "ok" && r.https === "ok") return "live";
  return "idle";
}

function StatusPill({ overall }: { overall: OverallStatus }) {
  if (overall === "checking") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Checking
      </span>
    );
  }
  if (overall === "live") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <CheckCircle2 className="h-2.5 w-2.5" /> Live
      </span>
    );
  }
  if (overall === "ssl_pending") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-1.5 py-0.5 rounded">
        SSL pending
      </span>
    );
  }
  if (overall === "ns_issue") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <AlertTriangle className="h-2.5 w-2.5" /> NS not set
      </span>
    );
  }
  if (overall === "dns_issue") {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
        <AlertTriangle className="h-2.5 w-2.5" /> DNS issue
      </span>
    );
  }
  return null;
}

function Step({
  number,
  title,
  done,
  inProgress,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  inProgress: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        done &&
          "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 dark:border-emerald-900/40",
        !done &&
          inProgress &&
          "border-amber-200 bg-amber-50/40 dark:bg-amber-950/10",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center",
            done
              ? "bg-emerald-500 text-white"
              : inProgress
                ? "bg-amber-500 text-white"
                : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium mb-1">{title}</h3>
          {children}
        </div>
      </div>
    </div>
  );
}

function DnsRecordRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied "${label.toLowerCase()}"`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't access clipboard");
    }
  };
  return (
    <div className="grid grid-cols-[110px,1fr,auto] gap-2 items-center text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("break-all", mono && "font-mono")}>{value}</span>
      {copyable && (
        <button
          type="button"
          onClick={onCopy}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const palette = {
    error: "border-red-200 bg-red-50/60 dark:bg-red-950/20 text-red-900 dark:text-red-200",
    warn: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200",
    muted: "border bg-muted/40 text-muted-foreground",
  }[kind];
  const Icon = kind === "muted" ? null : AlertTriangle;
  return (
    <div className={cn("rounded-md border p-3 text-xs", palette)}>
      <div className="flex items-start gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 mt-0.5" />}
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}

function RecordDiff({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="opacity-80">{label}:</span>{" "}
      <code className="bg-background px-1 rounded font-mono">{value}</code>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function resolveCname(hostname: string): Promise<string | null> {
  const json = await dohQuery(hostname, 5);
  // Type 5 = CNAME per RFC 1035.
  return json.Answer?.find((a) => a.type === 5)?.data ?? null;
}

async function resolveNs(hostname: string): Promise<string[]> {
  const json = await dohQuery(hostname, 2);
  // Type 2 = NS per RFC 1035.
  return (json.Answer ?? [])
    .filter((a) => a.type === 2)
    .map((a) => a.data);
}

interface DohResponse {
  Status?: number;
  Answer?: Array<{ name: string; type: number; data: string }>;
}

async function dohQuery(hostname: string, recordType: number): Promise<DohResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${recordType}`;
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`DoH returned ${res.status}`);
    }
    return (await res.json()) as DohResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function isHttpsReachable(hostname: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    await fetch(`https://${hostname}/`, {
      mode: "no-cors",
      signal: ctrl.signal,
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Public second-level domains where the apex is THREE labels rather than two.
// Covers the UK market plus common ones we'll likely see. Not a full PSL —
// when a practice hits an SLD we missed, they can correct in their registrar
// (the records still need adding manually anyway). If this list grows past
// ~30 entries, swap for the publicsuffix-list npm package.
const TWO_LABEL_PUBLIC_SUFFIXES = new Set<string>([
  // UK
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "nhs.uk",
  "ac.uk", "gov.uk", "sch.uk",
  // Australia / NZ
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "net.nz", "org.nz",
  // Common Commonwealth + EU
  "co.in", "co.za", "com.br", "com.mx", "com.tr", "com.sg",
]);

// Rendered when the tenant's hostname IS our canonical booking-app host —
// the dog-foodi case where we use our own infrastructure as a tenant. No
// DNS records to add (it'd be circular), no nameservers to verify, no SSL
// to provision (already done for the booking app itself). Just a one-line
// status saying "this is us, you're done".
function CanonicalHostPanel({ hostname }: { hostname: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <h2 className="text-sm font-semibold">Booking hostname</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Live
            </span>
          </div>
          <a
            href={`https://${hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-primary hover:underline break-all inline-flex items-center gap-1.5"
          >
            {hostname}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
        This is our canonical booking-app hostname — the same address other
        tenants CNAME their subdomains at. No DNS records to add for this
        tenant; the booking app is already live at this URL. Use this
        practice for internal testing / dog-fooding.
      </div>
    </div>
  );
}

// "app.example.co.uk" → "example.co.uk"
// "app.example.com"   → "example.com"
// "example.co.uk"     → "example.co.uk"  (already apex)
function apexDomain(hostname: string): string {
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) return hostname;
  // Check for a 2-label public suffix (e.g. "co.uk").
  if (labels.length >= 3) {
    const lastTwo = labels.slice(-2).join(".");
    if (TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
      return labels.slice(-3).join(".");
    }
  }
  return labels.slice(-2).join(".");
}

// "Name / Host" field at most registrars wants just the subdomain label,
// not the full FQDN. "@" is the convention for the apex record.
function cnameSubdomainLabel(hostname: string): string {
  const apex = apexDomain(hostname);
  if (apex === hostname) return "@";
  // hostname ends with ".apex" — strip the apex (and the joining dot).
  return hostname.slice(0, hostname.length - apex.length - 1);
}
