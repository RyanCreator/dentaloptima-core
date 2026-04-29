/**
 * Reusable hook for Supabase real-time subscriptions
 * Standardizes the subscription pattern and automatic cleanup
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface UseRealtimeSubscriptionOptions {
  /**
   * Name for the channel (must be unique per component)
   */
  channelName: string;

  /**
   * Database table to listen to
   */
  table: string;

  /**
   * Event type(s) to listen for
   * @default "*" (all events)
   */
  event?: PostgresChangeEvent;

  /**
   * Schema name
   * @default "public"
   */
  schema?: string;

  /**
   * Optional filter for specific rows
   * Example: { column: "id", value: "123" }
   */
  filter?: {
    column: string;
    value: string | number;
  };

  /**
   * Callback function when changes occur
   */
  onEvent: (payload: any) => void;

  /**
   * Whether the subscription is enabled
   * Useful for conditional subscriptions
   * @default true
   */
  enabled?: boolean;

  /**
   * Dependencies array for the useEffect
   * Pass dependencies that should trigger resubscription
   */
  dependencies?: any[];
}

/**
 * Hook for subscribing to real-time database changes
 * Automatically handles subscription lifecycle and cleanup
 *
 * @example
 * ```typescript
 * useRealtimeSubscription({
 *   channelName: "staff-changes",
 *   table: "app_staff",
 *   event: "*",
 *   onEvent: () => loadStaff(),
 *   enabled: !loading,
 * });
 * ```
 */
export function useRealtimeSubscription(options: UseRealtimeSubscriptionOptions) {
  const {
    channelName,
    table,
    event = "*",
    schema = "public",
    filter,
    onEvent,
    enabled = true,
    dependencies = [],
  } = options;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Don't subscribe if disabled
    if (!enabled) {
      return;
    }

    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    try {
      // Create subscription config
      const config: any = {
        event,
        schema,
        table,
      };

      // Add filter if provided
      if (filter) {
        config.filter = `${filter.column}=eq.${filter.value}`;
      }

      // Create and subscribe to channel
      const channel = supabase
        .channel(channelName)
        .on("postgres_changes", config, (payload) => {
          logger.debug(`Real-time event received on ${channelName}`, {
            event: payload.eventType,
            table: payload.table,
          });
          onEvent(payload);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            logger.debug(`Subscribed to ${channelName}`);
          } else if (status === "CLOSED") {
            logger.debug(`Subscription closed for ${channelName}`);
          } else if (status === "CHANNEL_ERROR") {
            logger.error(`Subscription error for ${channelName}`, { status });
          }
        });

      channelRef.current = channel;
    } catch (error) {
      logger.error(`Error setting up subscription for ${channelName}`, error);
    }

    // Cleanup function
    return () => {
      if (channelRef.current) {
        logger.debug(`Cleaning up subscription ${channelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, ...dependencies]);

  return null;
}

/**
 * Hook for subscribing to multiple tables
 * Useful when a component needs to listen to multiple data sources
 *
 * @example
 * ```typescript
 * useMultipleRealtimeSubscriptions([
 *   {
 *     channelName: "staff-changes",
 *     table: "app_staff",
 *     onEvent: () => loadStaff(),
 *   },
 *   {
 *     channelName: "appointment-changes",
 *     table: "appointment",
 *     onEvent: () => loadAppointments(),
 *   },
 * ]);
 * ```
 */
export function useMultipleRealtimeSubscriptions(
  subscriptions: Omit<UseRealtimeSubscriptionOptions, "dependencies">[]
) {
  subscriptions.forEach((subscription) => {
    useRealtimeSubscription(subscription);
  });
}
