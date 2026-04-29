import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

type NotificationType =
  | "enquiry_received"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "request_rejected"
  | "waitlist_added";

interface SendNotificationParams {
  type: NotificationType;
  patient_id: string;
  appointment_id?: string;
  booking_request_id?: string;
  additional_data?: {
    cancellation_reason?: string;
    rejection_reason?: string;
    date?: string;
    time?: string;
    service_name?: string;
    staff_name?: string;
    old_date?: string;
    old_time?: string;
    new_date?: string;
    new_time?: string;
  };
}

/**
 * Hook for sending status change notifications to patients
 */
export function useNotifications() {
  /**
   * Send a notification email to a patient
   * @param params Notification parameters
   * @returns Promise<boolean> - true if notification was sent successfully
   */
  const sendNotification = async (params: SendNotificationParams): Promise<boolean> => {
    try {
      logger.info(`Sending ${params.type} notification for patient ${params.patient_id}`);

      const { data, error } = await supabase.functions.invoke("send-status-notification", {
        body: params,
      });

      if (error) {
        logger.error(`Failed to send ${params.type} notification`, error, {
          patient_id: params.patient_id,
          type: params.type,
        });
        // Don't throw error - notification failure shouldn't block the main operation
        return false;
      }

      if (data?.success) {
        logger.info(`Successfully sent ${params.type} notification`, {
          patient_id: params.patient_id,
          message_id: data.message_id,
        });
        return true;
      }

      // Notification was disabled or patient has no email
      logger.info(data?.message || "Notification not sent", {
        patient_id: params.patient_id,
        type: params.type,
      });
      return false;
    } catch (err) {
      logger.error(`Exception sending ${params.type} notification`, err, {
        patient_id: params.patient_id,
      });
      return false;
    }
  };

  /**
   * Send enquiry received notification
   */
  const sendEnquiryReceivedNotification = async (
    patient_id: string,
    booking_request_id: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "enquiry_received",
      patient_id,
      booking_request_id,
    });
  };

  /**
   * Send appointment confirmed notification
   */
  const sendAppointmentConfirmedNotification = async (
    patient_id: string,
    appointment_id: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "appointment_confirmed",
      patient_id,
      appointment_id,
    });
  };

  /**
   * Send appointment cancelled notification
   */
  const sendAppointmentCancelledNotification = async (
    patient_id: string,
    appointment_id: string,
    cancellation_reason?: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "appointment_cancelled",
      patient_id,
      appointment_id,
      additional_data: cancellation_reason ? { cancellation_reason } : undefined,
    });
  };

  /**
   * Send request rejected notification
   */
  const sendRequestRejectedNotification = async (
    patient_id: string,
    booking_request_id: string,
    rejection_reason?: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "request_rejected",
      patient_id,
      booking_request_id,
      additional_data: rejection_reason ? { rejection_reason } : undefined,
    });
  };

  /**
   * Send waitlist added notification
   */
  const sendWaitlistAddedNotification = async (
    patient_id: string,
    booking_request_id?: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "waitlist_added",
      patient_id,
      booking_request_id,
    });
  };

  /**
   * Send appointment rescheduled notification
   */
  const sendAppointmentRescheduledNotification = async (
    patient_id: string,
    appointment_id: string,
    old_date: string,
    old_time: string,
    new_date: string,
    new_time: string
  ): Promise<boolean> => {
    return sendNotification({
      type: "appointment_rescheduled",
      patient_id,
      appointment_id,
      additional_data: {
        old_date,
        old_time,
        new_date,
        new_time,
      },
    });
  };

  return {
    sendNotification,
    sendEnquiryReceivedNotification,
    sendAppointmentConfirmedNotification,
    sendAppointmentCancelledNotification,
    sendRequestRejectedNotification,
    sendWaitlistAddedNotification,
    sendAppointmentRescheduledNotification,
  };
}
