import { Fragment, useEffect, useRef, useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  CheckCircle2,
  Sun,
  Sunset,
  Moon,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { supabase } from "@/lib/supabase";
import { usePractice } from "@/contexts/PracticeContext";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";

// Shape returned by the public.list_public_services RPC. The shared DB's
// `service` table is the source of truth for what's actually bookable —
// keeping this decoupled from the marketing-content services in
// practice.config.ts means the two can evolve independently.
interface BookableService {
  id: string;
  name: string;
  duration_minutes: number;
  is_nhs: boolean | null;
  nhs_band: string | null;
  // Renamed for backwards-compat with the existing rendering code. Pence on
  // the DB side, normalised to pounds for display.
  price: number | null;
  price_pence: number | null;
}

// Preferences are a list so the patient can offer up to 3 date/time options.
// Index 0 is primary (sent as requested_date to the edge function); 1 and 2
// are backups that we pack into the message body for the practice to see.
const preferenceSchema = z.object({
  date: z.string().min(1),
  time: z.string().min(1),
});

const schema = z.object({
  patient_name: z.string().min(2, "Please tell us your name").max(120),
  phone: z.string().min(7, "Phone looks too short").max(40),
  email: z.string().email("That doesn't look like a valid email").max(200),
  service_id: z.string().min(1, "Please pick a service"),
  preferences: z
    .array(preferenceSchema)
    .min(1, "Pick at least one preferred day and time")
    .max(3),
  message: z.string().max(1500).optional(),
});

type FormValues = z.infer<typeof schema>;
type Preference = z.infer<typeof preferenceSchema>;
type Step = 1 | 2 | 3 | 4;
const FINAL_STEP: Step = 4;
const MAX_PREFERENCES = 3;

const TIME_SLOTS = [
  { value: "Morning (9am – 12pm)", label: "Morning", hint: "9am – 12pm", icon: Sun },
  { value: "Afternoon (12pm – 5pm)", label: "Afternoon", hint: "12pm – 5pm", icon: Sunset },
  { value: "Evening (5pm – 7pm)", label: "Evening", hint: "5pm – 7pm", icon: Moon },
] as const;
const DEFAULT_TIME_VALUE = TIME_SLOTS[0].value;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Service" },
  { id: 2, label: "Date & time" },
  { id: 3, label: "Your details" },
  { id: 4, label: "Review" },
];

// Per-step field list used by trigger() to gate forward navigation. The
// final step has no fields of its own — it's a review of the prior steps.
const STEP_FIELDS: Record<Step, FieldPath<FormValues>[]> = {
  1: ["service_id"],
  2: ["preferences"],
  3: ["patient_name", "phone", "email", "message"],
  4: [],
};

export function BookingForm() {
  const tenant = usePractice();
  const prefersReducedMotion = useReducedMotion();
  const [services, setServices] = useState<BookableService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  // Locked briefly after arriving at the final step so any stray submit from
  // the step 3 → 4 transition can't auto-send the request before the patient
  // has seen the review screen.
  const [submitLocked, setSubmitLocked] = useState(false);
  const mountedAt = useRef(Date.now());
  // Held in a ref so event handlers always see the live step without needing
  // to be re-bound. Keeps the Enter-key guard honest across renders.
  const stepRef = useRef<Step>(1);
  stepRef.current = step;
  const submitLockedRef = useRef(false);
  submitLockedRef.current = submitLocked;

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      patient_name: "",
      phone: "",
      email: "",
      service_id: "",
      preferences: [],
      message: "",
    },
  });

  const values = watch();
  const selectedServiceId = values.service_id;
  const preferences = values.preferences ?? [];

  useEffect(() => {
    (async () => {
      try {
        // public.list_public_services is a SECURITY DEFINER RPC that exposes
        // a deliberately-narrow public-safe slice (id, name, duration, NHS
        // flags, price_pence) of the shared `service` table — anon-callable.
        const { data, error } = await supabase.rpc("list_public_services", {
          p_practice_id: tenant.practice.id,
        });
        if (error) throw error;
        // Normalise price_pence → price (pounds) for the existing render code.
        const rows = ((data as unknown as Array<{
          id: string;
          name: string;
          duration_minutes: number;
          is_nhs: boolean | null;
          nhs_band: string | null;
          price_pence: number | null;
        }>) ?? []).map((r) => ({
          ...r,
          price:
            typeof r.price_pence === "number" ? r.price_pence / 100 : null,
        }));
        setServices(rows);
      } catch (err) {
        setServicesError(
          err instanceof Error ? err.message : "Could not load services"
        );
      } finally {
        setLoadingServices(false);
      }
    })();
  }, [tenant.practice.id]);

  // Blur any focused element on step change — prevents an in-place button
  // reconcile (Next → Confirm) from retaining focus on the submit button.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === "function") el.blur();
  }, [step]);

  // Hold the submit lock for a short window after arriving at the review
  // step, absorbing any click/keypress that was in flight during the
  // transition.
  useEffect(() => {
    if (step === FINAL_STEP) {
      setSubmitLocked(true);
      const t = setTimeout(() => setSubmitLocked(false), 350);
      return () => clearTimeout(t);
    }
    setSubmitLocked(false);
  }, [step]);

  const goNext = async (e?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const fields = STEP_FIELDS[stepRef.current];
    const ok = fields.length === 0 ? true : await trigger(fields);
    if (!ok) return;
    setDirection(1);
    setStep((s) => (Math.min(FINAL_STEP, s + 1) as Step));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => (Math.max(1, s - 1) as Step));
  };

  const jumpTo = (target: Step) => {
    if (target === stepRef.current) return;
    setDirection(target > stepRef.current ? 1 : -1);
    setStep(target);
  };

  // Prevent Enter from submitting the form early. Without this, pressing
  // Enter inside any input short-circuits the wizard and fires onSubmit —
  // which can silently skip the Review step if prior fields happen to pass
  // validation. Textareas still accept Enter for newlines.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (stepRef.current < FINAL_STEP) {
      e.preventDefault();
      void goNext();
    }
  };

  const onSubmit = async (data: FormValues) => {
    // Defensive gate 1: if we're not on the final step, treat as Next.
    if (stepRef.current !== FINAL_STEP) {
      void goNext();
      return;
    }
    // Defensive gate 2: ignore submits during the lock window right after
    // arriving at the final step. The patient has to actually click
    // "Confirm & send" — once the lock releases, this gate lets them through.
    if (submitLockedRef.current) {
      return;
    }

    setError(null);
    if (Date.now() - mountedAt.current < 2000) return; // sub-2s = bot

    // Split the patient's full name into first/last for booking_request.
    // We split on the last whitespace to handle multi-word first names
    // (e.g. "Mary Jane Smith" → "Mary Jane" + "Smith").
    const trimmedName = data.patient_name.trim();
    const lastSpace = trimmedName.lastIndexOf(" ");
    const firstName = lastSpace >= 0 ? trimmedName.slice(0, lastSpace) : trimmedName;
    const lastName = lastSpace >= 0 ? trimmedName.slice(lastSpace + 1) : "";

    // Normalise phone: strip spaces, hyphens, parens. Server-side, the
    // RPC trims/length-caps but doesn't enforce digits-only, so we keep
    // the cleanup client-side for nicer-looking records.
    const normalisedPhone = data.phone.replace(/[\s()-]/g, "");

    // Primary preference becomes preferred_starts_at (ISO). 09:00 local is
    // the canonical "morning" anchor — the patient picked a time-of-day
    // band, not a slot, so the practice will follow up with a specific time.
    const primary = data.preferences[0];
    const TIME_BAND_HOUR: Record<string, string> = {
      "Morning (9am – 12pm)": "09:00:00",
      "Afternoon (12pm – 5pm)": "13:00:00",
      "Evening (5pm – 7pm)": "17:30:00",
    };
    const primaryHour = primary ? TIME_BAND_HOUR[primary.time] ?? "09:00:00" : null;
    const preferredStartsAt =
      primary?.date && primaryHour
        ? new Date(`${primary.date}T${primaryHour}`).toISOString()
        : null;

    // Backup preferences (#2 and #3) get folded into alternative_times so
    // the practice can see every option the patient picked. Booking_request
    // doesn't model multiple slot preferences as first-class.
    const alternativeTimes =
      data.preferences.length > 1
        ? data.preferences
            .slice(1)
            .map((p, i) => `Backup ${i + 1}: ${formatDateLong(p.date)} · ${p.time}`)
            .join("\n")
        : null;

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_public_booking_request", {
        p_practice_id: tenant.practice.id,
        p_first_name: firstName,
        p_last_name: lastName || firstName, // last_name is NOT NULL — fall back to first
        p_email: data.email.trim(),
        p_phone: normalisedPhone,
        p_service_id: data.service_id || null,
        p_preferred_starts_at: preferredStartsAt,
        p_alternative_times: alternativeTimes,
        p_notes: data.message?.trim() || null,
        p_is_new_patient: true,
        p_is_emergency: false,
        p_source_url:
          typeof window !== "undefined" ? window.location.href : null,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't send your request — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl bg-brand/5 border border-brand/20 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-brand mx-auto mb-3" />
        <h3 className="font-display text-2xl text-ink mb-2">Request received</h3>
        <p className="text-ink/75 text-sm max-w-md mx-auto">
          Thanks! We've received your request and the {tenant.practice.name} team
          will confirm by email as soon as it's approved — usually within one
          working day.
        </p>
      </div>
    );
  }

  const chosenService = services.find((s) => s.id === selectedServiceId);

  // Transition variants. Full-motion users get an x-slide so the direction
  // (forward/back) is unambiguous. prefers-reduced-motion users get a fade.
  const slideVariants: Variants = {
    enter: (dir: number) => ({ x: dir * 32, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -32, opacity: 0 }),
  };
  const fadeVariants: Variants = {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 },
  };
  const variants = prefersReducedMotion ? fadeVariants : slideVariants;

  // Visible feedback when handleSubmit's validation rejects on the review
  // step. Without this, clicking "Confirm & send" with an invalid field
  // (e.g. a preference that lost its time) does nothing and the patient is
  // stuck — no error, no submit. Map RHF's error tree into one human line.
  const onInvalid = (errs: typeof errors) => {
    const labels: Record<string, string> = {
      patient_name: "Your name",
      phone: "Phone",
      email: "Email",
      service_id: "Service",
      preferences: "Preferred date and time",
    };
    const fields = Object.keys(errs);
    if (fields.length === 0) return;
    const friendly = fields
      .map((f) => labels[f] ?? f)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    setError(
      `Some details are missing: ${friendly.join(", ")}. Please go back through the steps and check.`,
    );
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      onKeyDown={onFormKeyDown}
      noValidate
      className="space-y-8"
      aria-label="Appointment request form"
    >
      {/* Hidden inputs keep react-hook-form wired to the pickers */}
      <input type="hidden" {...register("service_id")} />

      <StepProgress current={step} onJump={jumpTo} />

      {/* Animated step body. min-h keeps the surrounding layout stable while
          contents slide in/out, so the whole page doesn't jump. */}
      <div className="relative min-h-[420px]">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {step === 1 && (
              <StepService
                services={services}
                loading={loadingServices}
                servicesError={servicesError}
                selectedServiceId={selectedServiceId}
                setValue={setValue}
                errors={errors}
              />
            )}

            {step === 2 && (
              <StepWhen
                preferences={preferences}
                setValue={setValue}
                errors={errors}
              />
            )}

            {step === 3 && (
              <StepDetails register={register} errors={errors} />
            )}

            {step === 4 && (
              <StepReview
                values={values}
                chosenService={chosenService}
                onEdit={jumpTo}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          {error}
        </p>
      )}

      {/* Nav bar. Back appears from step 2 onward. Next/Confirm swap at
          final step. Explicit keys on the two Button branches prevent React
          from reconciling them as the same DOM node — otherwise the
          type="button" → type="submit" attribute flip mid-click can trigger
          the browser's form-submit default action. */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 pt-5 border-t border-ink/5">
        {step > 1 ? (
          <Button
            key="nav-back"
            type="button"
            variant="secondary"
            size="lg"
            onClick={goBack}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        ) : (
          <p className="text-xs text-ink/55 leading-relaxed sm:mr-auto">
            Your request goes straight to {tenant.practice.name}. We'll confirm
            by email once it's approved, usually within one working day.
          </p>
        )}

        {step < FINAL_STEP ? (
          <Button
            key="nav-next"
            type="button"
            size="lg"
            onClick={(e) => {
              e.preventDefault();
              void goNext(e);
            }}
            className="w-full sm:w-auto sm:ml-auto"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            key="nav-submit"
            type="submit"
            size="lg"
            disabled={submitting || submitLocked}
            className="w-full sm:w-auto sm:ml-auto"
          >
            <Check className="w-4 h-4" />
            {submitting ? "Sending..." : "Confirm & send"}
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Progress indicator ─────────────────────────────────────────────────
// Numbered bullets with connectors. Completed steps are clickable so the
// patient can jump back to edit without using the Back button repeatedly.
function StepProgress({
  current,
  onJump,
}: {
  current: Step;
  onJump: (s: Step) => void;
}) {
  return (
    <nav aria-label="Booking progress" className="flex items-center">
      {STEPS.map((s, i) => {
        const active = current === s.id;
        const done = current > s.id;
        const clickable = done;
        return (
          <Fragment key={s.id}>
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onJump(s.id) : undefined}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2",
                clickable && "cursor-pointer hover:text-brand"
              )}
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors shrink-0",
                  active && "bg-brand text-brand-fg ring-2 ring-brand/20",
                  done && "bg-brand/15 text-brand",
                  !active && !done && "bg-ink/5 text-ink/40"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : s.id}
              </span>
              <span
                className={cn(
                  "hidden md:inline text-sm font-medium transition-colors",
                  active && "text-ink",
                  done && "text-ink/70",
                  !active && !done && "text-ink/40"
                )}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "flex-1 h-px mx-2 sm:mx-3 transition-colors",
                  current > s.id ? "bg-brand/40" : "bg-ink/10"
                )}
                aria-hidden
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

// ─── Step 1 · Service ───────────────────────────────────────────────────
function StepService({
  services,
  loading,
  servicesError,
  selectedServiceId,
  setValue,
  errors,
}: {
  services: BookableService[];
  loading: boolean;
  servicesError: string | null;
  selectedServiceId: string;
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-display text-2xl text-ink leading-tight">
          What would you like?
        </h3>
        <p className="text-sm text-ink/55 mt-1">
          Pick the treatment that fits you best.
        </p>
      </header>

      {loading ? (
        <div className="h-24 rounded-xl border border-ink/10 bg-ink/[0.02] flex items-center justify-center text-sm text-ink/50">
          Loading services...
        </div>
      ) : servicesError ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          {servicesError}
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Service"
          aria-invalid={!!errors.service_id}
          aria-describedby={errors.service_id ? "service_id-err" : undefined}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {services.map((s) => {
            const active = selectedServiceId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setValue("service_id", s.id, { shouldValidate: true })
                }
                className={cn(
                  "group text-left p-4 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                  active
                    ? "border-brand bg-brand/[0.06] ring-1 ring-brand/30 shadow-card"
                    : "border-ink/10 bg-white hover:border-brand/40 hover:bg-brand/[0.02]"
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <span
                    className={cn(
                      "font-display text-base leading-tight",
                      active ? "text-brand" : "text-ink"
                    )}
                  >
                    {s.name}
                  </span>
                  {s.is_nhs && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand bg-brand/10 px-2 py-0.5 rounded-full shrink-0">
                      NHS
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-ink/60">
                  <span>{s.duration_minutes} min</span>
                  {typeof s.price === "number" && s.price > 0 && (
                    <>
                      <span className="text-ink/25">·</span>
                      <span className="tabular-nums">
                        from £{Number(s.price).toFixed(0)}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {errors.service_id && (
        <p
          id="service_id-err"
          className="text-xs text-red-600 mt-2"
          role="alert"
        >
          {errors.service_id.message}
        </p>
      )}
    </div>
  );
}

// ─── Step 2 · Date & time ───────────────────────────────────────────────
// Multi-select calendar: click up to 3 dates to add them as preferred
// options. Each selected date gets a row below with its own morning /
// afternoon / evening pill group. The first preference is primary; the
// rest are backups we surface to the practice.
function StepWhen({
  preferences,
  setValue,
  errors,
}: {
  preferences: Preference[];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  const toggleDate = (iso: string) => {
    const existingIndex = preferences.findIndex((p) => p.date === iso);
    if (existingIndex >= 0) {
      const next = preferences.filter((_, i) => i !== existingIndex);
      setValue("preferences", next, { shouldValidate: true });
      return;
    }
    if (preferences.length >= MAX_PREFERENCES) return;
    const next = [...preferences, { date: iso, time: DEFAULT_TIME_VALUE }];
    setValue("preferences", next, { shouldValidate: true });
  };

  const setTime = (index: number, time: string) => {
    const next = preferences.map((p, i) => (i === index ? { ...p, time } : p));
    setValue("preferences", next, { shouldValidate: true });
  };

  const removeAt = (index: number) => {
    const next = preferences.filter((_, i) => i !== index);
    setValue("preferences", next, { shouldValidate: true });
  };

  const atCap = preferences.length >= MAX_PREFERENCES;

  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-display text-2xl text-ink leading-tight">
          When works for you?
        </h3>
        <p className="text-sm text-ink/55 mt-1">
          Pick up to {MAX_PREFERENCES} preferred days — we'll offer the
          earliest one that opens up.
        </p>
      </header>

      <CalendarPicker
        preferences={preferences}
        onToggleDate={toggleDate}
        atCap={atCap}
      />

      <div className="space-y-3">
        {preferences.length === 0 ? (
          <p className="text-sm text-ink/55 bg-ink/[0.02] border border-dashed border-ink/15 rounded-xl p-4 text-center">
            Click a date above to add your first preference.
          </p>
        ) : (
          preferences.map((p, i) => (
            <PreferenceRow
              key={`${p.date}-${i}`}
              index={i}
              preference={p}
              onTimeChange={(time) => setTime(i, time)}
              onRemove={() => removeAt(i)}
            />
          ))
        )}

        {preferences.length > 0 && !atCap && (
          <p className="text-xs text-ink/50 text-center">
            You can add {MAX_PREFERENCES - preferences.length} more option
            {MAX_PREFERENCES - preferences.length === 1 ? "" : "s"} — click
            another date above.
          </p>
        )}
        {atCap && (
          <p className="text-xs text-ink/50 text-center">
            That's all {MAX_PREFERENCES} options. Click a selected date to
            swap it.
          </p>
        )}
      </div>

      {errors.preferences && (
        <p className="text-xs text-red-600" role="alert">
          {errors.preferences.message || "Please pick at least one option."}
        </p>
      )}
    </div>
  );
}

// Single preference row: shows its rank, the chosen date, a time-of-day
// pill group, and a remove button.
function PreferenceRow({
  index,
  preference,
  onTimeChange,
  onRemove,
}: {
  index: number;
  preference: Preference;
  onTimeChange: (time: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-7 h-7 rounded-full bg-brand/15 text-brand text-xs font-semibold flex items-center justify-center tabular-nums">
            {index + 1}
          </span>
          <span className="font-display text-base text-ink truncate">
            {formatDateLong(preference.date)}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove option ${index + 1}`}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink/50 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label={`Time of day for option ${index + 1}`}
        className="grid grid-cols-3 gap-2"
      >
        {TIME_SLOTS.map(({ value, label, hint, icon: Icon }) => {
          const active = preference.time === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onTimeChange(value)}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                active
                  ? "border-brand bg-brand/[0.08] text-brand"
                  : "border-ink/10 bg-white text-ink hover:border-brand/40 hover:bg-brand/[0.02]"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-brand" : "text-ink/55")} />
              <span className="text-xs sm:text-sm font-medium leading-none">
                <span className="sm:inline">{label}</span>
                <span className="hidden lg:inline text-ink/40 ml-1.5">
                  · {hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3 · Your details ──────────────────────────────────────────────
function StepDetails({
  register,
  errors,
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-display text-2xl text-ink leading-tight">
          Your details
        </h3>
        <p className="text-sm text-ink/55 mt-1">
          So we can get back to you. All kept securely.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-5">
        <Field name="patient_name" label="Your name" error={errors.patient_name?.message}>
          <input
            type="text"
            autoComplete="name"
            className={inputClass(!!errors.patient_name)}
            aria-invalid={!!errors.patient_name}
            aria-describedby={
              errors.patient_name ? "patient_name-err" : undefined
            }
            {...register("patient_name")}
          />
        </Field>
        <Field name="phone" label="Phone" error={errors.phone?.message}>
          <input
            type="tel"
            autoComplete="tel"
            className={inputClass(!!errors.phone)}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-err" : undefined}
            {...register("phone")}
          />
        </Field>
      </div>

      <Field name="email" label="Email" error={errors.email?.message}>
        <input
          type="email"
          autoComplete="email"
          className={inputClass(!!errors.email)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-err" : undefined}
          {...register("email")}
        />
      </Field>

      <Field
        name="message"
        label="Anything we should know? (optional)"
        error={errors.message?.message}
      >
        <textarea
          rows={4}
          className={cn(inputClass(!!errors.message), "h-auto py-3 resize-y")}
          placeholder="E.g. 'I'm a nervous patient', or 'previous dentist was Dr X at…'"
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-err" : undefined}
          {...register("message")}
        />
      </Field>
    </div>
  );
}

// ─── Step 4 · Review & send ─────────────────────────────────────────────
function StepReview({
  values,
  chosenService,
  onEdit,
}: {
  values: FormValues;
  chosenService?: BookableService;
  onEdit: (step: Step) => void;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-display text-2xl text-ink leading-tight">
          Review your request
        </h3>
        <p className="text-sm text-ink/55 mt-1">
          Double-check everything looks right, then confirm to send it to the
          practice.
        </p>
      </header>

      <div className="rounded-2xl border border-ink/10 bg-ink/[0.015] overflow-hidden">
        <SummaryGroup title="Service" onEdit={() => onEdit(1)}>
          <SummaryRow label="Treatment" value={chosenService?.name ?? "—"} />
          {chosenService && (
            <SummaryRow
              label="Duration"
              value={`${chosenService.duration_minutes} min${
                typeof chosenService.price === "number" && chosenService.price > 0
                  ? ` · from £${Number(chosenService.price).toFixed(0)}`
                  : ""
              }${chosenService.is_nhs ? " · NHS" : ""}`}
            />
          )}
        </SummaryGroup>

        <div className="border-t border-ink/5" />

        <SummaryGroup title="Preferred times" onEdit={() => onEdit(2)}>
          {values.preferences.length === 0 ? (
            <SummaryRow label="—" value="No preference selected" />
          ) : (
            values.preferences.map((p, i) => (
              <SummaryRow
                key={`${p.date}-${i}`}
                label={i === 0 ? "1st choice" : i === 1 ? "2nd choice" : "3rd choice"}
                value={`${formatDateLong(p.date)} · ${p.time}`}
              />
            ))
          )}
        </SummaryGroup>

        <div className="border-t border-ink/5" />

        <SummaryGroup title="Your details" onEdit={() => onEdit(3)}>
          <SummaryRow label="Name" value={values.patient_name || "—"} />
          <SummaryRow label="Phone" value={values.phone || "—"} />
          <SummaryRow label="Email" value={values.email || "—"} />
          {values.message?.trim() && (
            <SummaryRow label="Notes" value={values.message.trim()} multiline />
          )}
        </SummaryGroup>
      </div>

      <p className="text-xs text-ink/55 leading-relaxed">
        By confirming, you're asking the practice to get in touch to offer a
        specific time. This isn't a guaranteed booking — the practice will
        confirm by email, usually within one working day.
      </p>
    </div>
  );
}

function SummaryGroup({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-display text-sm text-ink/80 uppercase tracking-wide">
          {title}
        </h4>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </div>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-3 items-baseline">
      <dt className="text-xs text-ink/50">{label}</dt>
      <dd
        className={cn(
          "text-sm text-ink",
          multiline ? "whitespace-pre-wrap" : ""
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Calendar picker (multi-select) ─────────────────────────────────────
// Inline month-grid picker. Renders 6 rows × 7 cols (Mon-first week). Past
// dates and closed weekdays are disabled. Selected dates show a numbered
// badge indicating preference rank (1st, 2nd, 3rd).
const PRACTICE_CLOSED_WEEKDAYS: number[] = [0]; // 0 = Sunday

function CalendarPicker({
  preferences,
  onToggleDate,
  atCap,
}: {
  preferences: Preference[];
  onToggleDate: (iso: string) => void;
  atCap: boolean;
}) {
  const todayStart = startOfDay(new Date());
  const initial = preferences[0]?.date ? parseISO(preferences[0].date) : todayStart;
  const [viewMonth, setViewMonth] = useState(startOfMonth(initial));

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Can't go back past the current month.
  const prevDisabled = !isBefore(todayStart, monthStart);

  // Build a quick lookup: ISO date → rank (1-based) for badge rendering.
  const rankMap = new Map<string, number>();
  preferences.forEach((p, i) => rankMap.set(p.date, i + 1));

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          disabled={prevDisabled}
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          aria-label="Previous month"
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
            prevDisabled
              ? "text-ink/20 cursor-not-allowed"
              : "text-ink/70 hover:text-brand hover:bg-brand/5"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-display text-base text-ink tabular-nums">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink/70 hover:text-brand hover:bg-brand/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span
            key={d}
            className="text-center text-[10px] uppercase tracking-wide text-ink/40 py-1.5"
          >
            {d.slice(0, 1)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid">
        {days.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, viewMonth);
          const rank = rankMap.get(iso);
          const selected = !!rank;
          const today = isToday(day);
          const past = isBefore(day, todayStart);
          const closed = PRACTICE_CLOSED_WEEKDAYS.includes(day.getDay());
          const atCapAndUnselected = atCap && !selected;
          const disabled = past || closed || atCapAndUnselected;
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onToggleDate(iso)}
              className={cn(
                "relative h-10 rounded-lg text-sm flex items-center justify-center transition-all tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                selected && "bg-brand text-brand-fg font-semibold shadow-card",
                !selected && !disabled && inMonth && "text-ink hover:bg-brand/10",
                !selected && !disabled && !inMonth && "text-ink/30 hover:bg-brand/5",
                disabled && "text-ink/20 cursor-not-allowed",
                today && !selected && "ring-1 ring-brand/40"
              )}
            >
              {format(day, "d")}
              {rank && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-brand text-brand text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {rank}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-ink/50 mt-4 text-center">
        {preferences.length === 0
          ? "Tap a day to add it as your first option."
          : preferences.length === 1
          ? "Nice. Want to add a backup? Tap another day."
          : preferences.length === 2
          ? "Two options locked in. One more backup?"
          : "All three options set. Tap a selected day to swap it out."}
      </p>
    </div>
  );
}

// ─── Shared form bits ───────────────────────────────────────────────────
function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink/85 mb-2 block">{label}</span>
      {children}
      {error && (
        <span
          id={`${name}-err`}
          className="text-xs text-red-600 mt-1.5 block"
          role="alert"
        >
          {error}
        </span>
      )}
    </label>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full h-12 px-3.5 rounded-xl border bg-white text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors",
    hasError ? "border-red-300" : "border-ink/15"
  );
}

function formatDateLong(iso: string) {
  try {
    return format(parseISO(iso), "EEEE d MMMM yyyy");
  } catch {
    return iso;
  }
}
