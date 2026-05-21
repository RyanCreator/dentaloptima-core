import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePractice } from "@/contexts/PracticeContext";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";

const schema = z.object({
  name: z.string().min(2, "Please tell us your name").max(120),
  email: z.string().email("That doesn't look like a valid email").max(200),
  phone: z.string().max(40).optional(),
  subject: z.string().max(120).optional(),
  message: z
    .string()
    .min(10, "A few more words so we can help you properly")
    .max(3000, "That's a long message — can you trim it?"),
  // Honeypot (should stay empty)
  company: z.string().max(0).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContactForm() {
  const tenant = usePractice();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Time-of-mount — sub-2-second submits are almost always bots.
  const mountedAt = useRef(Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setError(null);

    // Bot heuristics
    if (data.company) return; // honeypot filled
    if (Date.now() - mountedAt.current < 2000) return; // too fast

    // Split full name into first/last (last_name is NOT NULL on
    // booking_request — fall back to first_name if no last name was given).
    const trimmedName = data.name.trim();
    const lastSpace = trimmedName.lastIndexOf(" ");
    const firstName = lastSpace >= 0 ? trimmedName.slice(0, lastSpace) : trimmedName;
    const lastName = lastSpace >= 0 ? trimmedName.slice(lastSpace + 1) : trimmedName;

    // Compose notes with subject as a header line — booking_request has
    // no dedicated subject column, but the practice will see this in the
    // ops dashboard.
    const notes = data.subject?.trim()
      ? `Subject: ${data.subject.trim()}\n\n${data.message.trim()}`
      : data.message.trim();

    setSubmitting(true);
    try {
      // Same RPC as the booking form. No service_id, no preferred date —
      // a contact-form submission is a generic enquiry; reception
      // triages and calls back.
      const { error } = await supabase.rpc("submit_public_booking_request", {
        p_practice_id: tenant.practice.id,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: data.email.trim(),
        p_phone: data.phone?.trim() || "",
        p_service_id: null,
        p_preferred_starts_at: null,
        p_alternative_times: null,
        p_notes: notes,
        p_is_new_patient: true,
        p_is_emergency: false,
        p_source_url:
          typeof window !== "undefined" ? window.location.href : null,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl bg-brand/5 border border-brand/20 p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-brand mx-auto mb-3" />
        <h3 className="font-display text-xl text-ink mb-2">Thank you</h3>
        <p className="text-ink/75 text-sm">
          Your message has been sent to the {tenant.practice.name} team. We'll
          get back to you as soon as we can, usually within one working day.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
      aria-label="Contact form"
    >
      {/* Honeypot — invisible to humans, catches bots */}
      <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register("company")}
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <Field name="name" label="Your name" error={errors.name?.message}>
          <input
            type="text"
            autoComplete="name"
            className={inputClass(!!errors.name)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-err" : undefined}
            {...register("name")}
          />
        </Field>
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
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <Field name="phone" label="Phone (optional)" error={errors.phone?.message}>
          <input
            type="tel"
            autoComplete="tel"
            className={inputClass(!!errors.phone)}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-err" : undefined}
            {...register("phone")}
          />
        </Field>
        <Field name="subject" label="Subject (optional)" error={errors.subject?.message}>
          <input
            type="text"
            className={inputClass(!!errors.subject)}
            aria-invalid={!!errors.subject}
            aria-describedby={errors.subject ? "subject-err" : undefined}
            {...register("subject")}
          />
        </Field>
      </div>

      <Field name="message" label="Message" error={errors.message?.message}>
        <textarea
          rows={6}
          className={cn(inputClass(!!errors.message), "h-auto py-3 resize-y")}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-err" : undefined}
          {...register("message")}
        />
      </Field>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          {error}
        </p>
      )}

      <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 border-t border-ink/5 mt-2">
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full sm:w-auto mt-5 sm:mt-5 shrink-0"
        >
          {submitting ? "Sending..." : "Send message"}
          {!submitting && <Send className="w-4 h-4" />}
        </Button>
        <p className="text-xs text-ink/55 leading-relaxed sm:mt-5">
          By submitting you agree to our privacy policy. We'll only use your
          details to reply.
        </p>
      </div>
    </form>
  );
}

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
