import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";
import { usePractice } from "@/contexts/PracticeContext";

// Onboarding signals — derived from row counts + practice flags so we
// don't carry a "first-run done" state in localStorage (which would be
// wrong on a fresh device). The check is cheap (HEAD counts + one row
// read), so it's safe to run each Dashboard load.

export interface ChecklistItem {
  key:
    | "hours"
    | "services"
    | "staff"
    | "staff_schedules"
    | "policies"
    | "nhs_performer"
    | "marketing_site";
  label: string;
  description: string;
  done: boolean;
  /** True if this step is conditional on practice context (e.g. NHS performer
   *  only matters once an NHS service exists). When `relevant` is false the
   *  step is hidden entirely. */
  relevant: boolean;
  href: string;
}

export interface OnboardingState {
  items: ChecklistItem[];
  /** Steps the practice still needs to complete. */
  outstanding: ChecklistItem[];
  /** True once we've loaded — used to gate the Dashboard render so we
   *  don't flash an empty/wrong checklist while data is in flight. */
  loaded: boolean;
}

const INITIAL: OnboardingState = { items: [], outstanding: [], loaded: false };

export function useOnboardingChecklist(): OnboardingState {
  const auth = useAuth();
  const tenant = usePractice();
  const [state, setState] = useState<OnboardingState>(INITIAL);

  useEffect(() => {
    if (!auth.member) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.member?.id, tenant.practice.id]);

  const load = async () => {
    const [
      hoursRes,
      servicesRes,
      nhsServicesRes,
      staffRes,
      staffSchedulesRes,
      policiesRes,
      nhsPerformerRes,
    ] = await Promise.all([
      supabase.from("practice_hours").select("id", { count: "exact", head: true }),
      supabase
        .from("service")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .is("deleted_at", null),
      // Detect "is this an NHS-doing practice?" by checking for active NHS
      // services. If none exist we hide the NHS performer step entirely.
      supabase
        .from("service")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_nhs", true)
        .is("deleted_at", null),
      supabase
        .from("practice_member")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      // At-least-one staff_availability row means *some* clinician has
      // their weekly schedule set — enough to unblock the booking form.
      // Granular per-clinician chasing is overkill for the checklist;
      // reception staff and nurses don't typically need a schedule.
      supabase
        .from("staff_availability")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("policy")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .is("deleted_at", null),
      // nhs_performer has no deleted_at column — soft-delete is just
      // is_active=false (or a past effective_to). Filtering on the
      // non-existent column returns 400 from PostgREST.
      supabase
        .from("nhs_performer")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

    if (hoursRes.error)          logger.error("hours count", hoursRes.error);
    if (servicesRes.error)       logger.error("services count", servicesRes.error);
    if (nhsServicesRes.error)    logger.error("nhs services count", nhsServicesRes.error);
    if (staffRes.error)          logger.error("staff count", staffRes.error);
    if (staffSchedulesRes.error) logger.error("staff schedules count", staffSchedulesRes.error);
    if (policiesRes.error)       logger.error("policies count", policiesRes.error);
    if (nhsPerformerRes.error)   logger.error("nhs performer count", nhsPerformerRes.error);

    const hasNhsServices = (nhsServicesRes.count ?? 0) > 0;
    const practice = tenant.practice as {
      marketing_site_enabled?: boolean;
      booking_app_enabled?: boolean;
    };

    const items: ChecklistItem[] = [
      {
        key: "hours",
        label: "Set your opening hours",
        description: "Without hours, patients can't book — the availability engine has nothing to work with.",
        done: (hoursRes.count ?? 0) > 0,
        relevant: true,
        href: "/settings",
      },
      {
        key: "services",
        label: "Add your services",
        description: "What appointments people can book — check-ups, examinations, hygiene, treatments.",
        done: (servicesRes.count ?? 0) > 0,
        relevant: true,
        href: "/settings",
      },
      {
        key: "staff",
        label: "Invite your team",
        description: "Clinicians, hygienists, nurses, reception. They each get their own login.",
        // Owner alone gets the practice running but most practices have >1.
        // We mark done at >= 2 active members.
        done: (staffRes.count ?? 0) >= 2,
        relevant: true,
        href: "/staff",
      },
      {
        key: "staff_schedules",
        label: "Set staff working hours",
        description:
          "Each clinician needs a weekly schedule before patients can be booked with them. Open their staff profile and add hours under Schedule.",
        // One row is enough — once any clinician has a schedule, the
        // availability engine works for that staff. The practice can fill
        // the rest in as they go.
        done: (staffSchedulesRes.count ?? 0) > 0,
        relevant: true,
        href: "/staff",
      },
      {
        key: "policies",
        label: "Publish your CQC policies",
        description: "Infection control, safeguarding, complaints, information governance — minimum 4 to be inspection-ready.",
        // We mark done at 4+ active policies — the CQC core set. Below
        // that the practice has started but isn't covered.
        done: (policiesRes.count ?? 0) >= 4,
        relevant: true,
        href: "/governance?tab=policies",
      },
      {
        key: "nhs_performer",
        label: "Register NHS performer numbers",
        description: "Required for FP17 claims. One per clinician who provides NHS care.",
        done: (nhsPerformerRes.count ?? 0) > 0,
        relevant: hasNhsServices,
        href: "/staff",
      },
      {
        key: "marketing_site",
        label: "Enable your booking website",
        description: "Optional — lets patients book online via your practice's public site.",
        done: Boolean(practice.marketing_site_enabled) || Boolean(practice.booking_app_enabled),
        relevant: true,
        href: "/settings",
      },
    ];

    const relevant = items.filter((i) => i.relevant);
    const outstanding = relevant.filter((i) => !i.done);

    setState({ items: relevant, outstanding, loaded: true });
  };

  return state;
}
