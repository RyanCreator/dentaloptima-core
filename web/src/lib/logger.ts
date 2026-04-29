/**
 * Error logging utility for consistent error handling across the application.
 * In production, errors should be sent to a monitoring service.
 * In development, errors are logged to console.
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  /**
   * Log an error message with optional context
   */
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, {
        error,
        context,
        timestamp: new Date().toISOString(),
      });
    }

    // TODO: In production, send to error monitoring service (e.g., Sentry)
    // if (!isDevelopment) {
    //   sendToMonitoringService({ message, error, context });
    // }
  },

  /**
   * Log a warning message with optional context
   */
  warn: (message: string, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, {
        context,
        timestamp: new Date().toISOString(),
      });
    }
  },

  /**
   * Log an info message (only in development)
   */
  info: (message: string, context?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.info(`[INFO] ${message}`, context);
    }
  },

  /**
   * Log a debug message (only in development)
   */
  debug: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, data);
    }
  },
};
