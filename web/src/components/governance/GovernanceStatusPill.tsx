import { cn } from "@/lib/utils";

// Soft-color pill for governance statuses. Each enum (incident/complaint/etc)
// has its own progression of states, but the visual language is shared so
// users can scan a mixed-type list and immediately read "needs work" vs
// "closed" without learning N different palettes.

// Conceptually we collapse every status into one of four buckets:
//   open       — just filed, no action yet (red, demands attention)
//   active     — being worked (amber, in motion)
//   resolved   — work done but not yet archived (blue, almost there)
//   closed     — archived (gray, no action needed)
//   escalated  — went external (purple, needs awareness)

type Tone = "open" | "active" | "resolved" | "closed" | "escalated";

const TONE_STYLES: Record<Tone, string> = {
  open:      "bg-red-100 text-red-700",
  active:    "bg-amber-100 text-amber-700",
  resolved:  "bg-blue-100 text-blue-700",
  closed:    "bg-gray-100 text-gray-700",
  escalated: "bg-purple-100 text-purple-700",
};

// Status → tone maps. One per enum so we can add new statuses without
// touching call sites. Unknown values fall back to "closed" (neutral).
const INCIDENT: Record<string, Tone> = {
  REPORTED: "open",
  UNDER_INVESTIGATION: "active",
  ACTION_REQUIRED: "active",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

const COMPLAINT: Record<string, Tone> = {
  NEW: "open",
  ACKNOWLEDGED: "active",
  UNDER_INVESTIGATION: "active",
  RESPONDED: "active",
  RESOLVED: "resolved",
  ESCALATED_TO_OMBUDSMAN: "escalated",
  CLOSED: "closed",
};

const SAFEGUARDING: Record<string, Tone> = {
  IDENTIFIED: "open",
  INTERNAL_REVIEW: "active",
  REFERRED_LOCAL_AUTHORITY: "escalated",
  REFERRED_POLICE: "escalated",
  CLOSED_NO_ACTION: "closed",
  CLOSED_ACTIONED: "closed",
};

const PRESCRIPTION: Record<string, Tone> = {
  DRAFT: "open",
  ISSUED: "active",
  COLLECTED: "resolved",
  CANCELLED: "closed",
  EXPIRED: "closed",
};

const SEVERITY: Record<string, Tone> = {
  NO_HARM: "closed",
  LOW: "active",
  MODERATE: "active",
  SEVERE: "open",
  DEATH: "open",
};

const TONE_MAPS = {
  incident: INCIDENT,
  complaint: COMPLAINT,
  safeguarding: SAFEGUARDING,
  prescription: PRESCRIPTION,
  severity: SEVERITY,
} as const;

interface GovernanceStatusPillProps {
  kind: keyof typeof TONE_MAPS;
  value: string;
  className?: string;
}

export function GovernanceStatusPill({ kind, value, className }: GovernanceStatusPillProps) {
  const tone = TONE_MAPS[kind][value] ?? "closed";
  const label = value.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide",
        TONE_STYLES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
