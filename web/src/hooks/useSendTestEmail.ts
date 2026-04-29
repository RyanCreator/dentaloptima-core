import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Admin-only: calls the send-test-email edge function. Renders the chosen
// template with sample placeholder values and delivers it to `to`. Used from
// Settings pages to verify the email pipeline without waiting on a real
// patient event to fire.
export type TestTemplateKey =
  | "enquiry_received"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "request_rejected"
  | "added_to_waitlist"
  | "first_reminder"
  | "second_reminder"
  | "post_appointment"
  | "recall_reminder";

export function useSendTestEmail() {
  const [sending, setSending] = useState(false);

  const send = async (params: {
    to: string;
    templateKey: TestTemplateKey;
  }): Promise<{ success: true; to: string } | { success: false; error: string }> => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: params.to, template_key: params.templateKey },
      });
      if (error) {
        // supabase-js wraps non-2xx responses; try to read the edge function's
        // detailed message from the response body if present.
        const fnMessage =
          (data as { error?: string } | null)?.error ?? error.message ?? "Unknown error";
        return { success: false, error: fnMessage };
      }
      if (!data?.success) {
        return { success: false, error: data?.error ?? "Test send failed" };
      }
      return { success: true, to: data.to };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    } finally {
      setSending(false);
    }
  };

  return { send, sending };
}
