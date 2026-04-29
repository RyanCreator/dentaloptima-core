/**
 * Standardized Error Handling Utilities
 *
 * Provides consistent error handling patterns across the application.
 * All errors should be logged and displayed to users in a user-friendly way.
 */

import { toast } from "sonner";
import { logger } from "./logger";

/**
 * Error types for categorization
 */
export enum ErrorType {
  NETWORK = "NETWORK",
  VALIDATION = "VALIDATION",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  SERVER = "SERVER",
  UNKNOWN = "UNKNOWN",
}

/**
 * Standardized error object
 */
export interface AppError {
  type: ErrorType;
  message: string;
  userMessage: string;
  details?: unknown;
  code?: string;
}

/**
 * Categorize error based on error object or status code
 */
export function categorizeError(error: unknown): ErrorType {
  if (!error) return ErrorType.UNKNOWN;

  // Check for network errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return ErrorType.NETWORK;
  }

  // Check for Supabase errors
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;

    // Authentication errors
    if (err.code === "PGRST301" || err.message?.toString().includes("JWT")) {
      return ErrorType.AUTHENTICATION;
    }

    // Authorization errors
    if (err.code === "PGRST116" || err.code === "42501") {
      return ErrorType.AUTHORIZATION;
    }

    // Not found errors
    if (err.code === "PGRST116" || err.message?.toString().includes("not found")) {
      return ErrorType.NOT_FOUND;
    }

    // Conflict errors (409, unique constraint violations)
    if (
      err.code === "23505" || // Unique violation
      err.code === "23P01" || // Exclusion violation
      err.message?.toString().includes("overlaps") ||
      err.message?.toString().includes("conflict")
    ) {
      return ErrorType.CONFLICT;
    }

    // Validation errors
    if (
      err.code === "23502" || // Not null violation
      err.code === "23514" || // Check violation
      err.message?.toString().includes("invalid") ||
      err.message?.toString().includes("validation")
    ) {
      return ErrorType.VALIDATION;
    }

    // Server errors (5xx)
    if (err.code?.toString().startsWith("5")) {
      return ErrorType.SERVER;
    }
  }

  return ErrorType.UNKNOWN;
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyMessage(error: unknown, type: ErrorType): string {
  // Custom message from error object
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const msg = error.message;

    // Return custom messages for common errors
    if (msg.includes("overlaps")) {
      return "This time slot is already booked. Please choose a different time.";
    }
    if (msg.includes("duplicate")) {
      return "This record already exists. Please check your data.";
    }
    if (msg.includes("not found")) {
      return "The requested item could not be found.";
    }
  }

  // Default messages by type
  switch (type) {
    case ErrorType.NETWORK:
      return "Network error. Please check your internet connection and try again.";

    case ErrorType.VALIDATION:
      return "Please check your input and try again.";

    case ErrorType.AUTHENTICATION:
      return "Your session has expired. Please log in again.";

    case ErrorType.AUTHORIZATION:
      return "You don't have permission to perform this action.";

    case ErrorType.NOT_FOUND:
      return "The requested item could not be found.";

    case ErrorType.CONFLICT:
      return "This action conflicts with existing data. Please review and try again.";

    case ErrorType.SERVER:
      return "A server error occurred. Please try again later.";

    case ErrorType.UNKNOWN:
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

/**
 * Handle error with consistent logging and user notification
 *
 * @param error - The error object
 * @param context - Context about where the error occurred (e.g., "Creating appointment")
 * @param options - Additional options
 * @returns Categorized error object
 *
 * @example
 * try {
 *   await createAppointment(data);
 * } catch (error) {
 *   handleError(error, "Creating appointment");
 * }
 */
export function handleError(
  error: unknown,
  context: string,
  options?: {
    showToast?: boolean;
    customMessage?: string;
    logLevel?: "error" | "warn" | "info";
  }
): AppError {
  const showToast = options?.showToast ?? true;
  const logLevel = options?.logLevel ?? "error";

  // Categorize error
  const errorType = categorizeError(error);

  // Get user-friendly message
  const userMessage = options?.customMessage ?? getUserFriendlyMessage(error, errorType);

  // Extract error details
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Unknown error";

  const errorCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error.code as string)
      : undefined;

  // Log error
  const logMessage = `[${context}] ${errorType}: ${errorMessage}`;
  if (logLevel === "error") {
    logger.error(logMessage, error);
  } else if (logLevel === "warn") {
    logger.warn(logMessage, error);
  } else {
    logger.info(logMessage);
  }

  // Show toast notification
  if (showToast) {
    if (errorType === ErrorType.NETWORK) {
      toast.error(userMessage, {
        description: "Please check your connection and try again.",
      });
    } else if (errorType === ErrorType.VALIDATION) {
      toast.error(userMessage, {
        description: "Please review your input.",
      });
    } else {
      toast.error(userMessage);
    }
  }

  // Return standardized error object
  return {
    type: errorType,
    message: errorMessage,
    userMessage,
    details: error,
    code: errorCode,
  };
}

/**
 * Handle async operation with consistent error handling
 *
 * @param operation - Async function to execute
 * @param context - Context about the operation
 * @param options - Additional options
 * @returns Result or null if error
 *
 * @example
 * const result = await handleAsync(
 *   () => supabase.from('patients').select(),
 *   "Fetching patients"
 * );
 * if (!result) return; // Error was handled
 */
export async function handleAsync<T>(
  operation: () => Promise<T>,
  context: string,
  options?: {
    showToast?: boolean;
    customMessage?: string;
    onError?: (error: AppError) => void;
  }
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const appError = handleError(error, context, {
      showToast: options?.showToast,
      customMessage: options?.customMessage,
    });

    if (options?.onError) {
      options.onError(appError);
    }

    return null;
  }
}

/**
 * Wrap a function with error handling
 *
 * @example
 * const createPatient = withErrorHandling(
 *   async (data) => {
 *     return await supabase.from('patients').insert(data);
 *   },
 *   "Creating patient"
 * );
 */
export function withErrorHandling<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  context: string,
  options?: {
    showToast?: boolean;
    customMessage?: string;
  }
) {
  return async (...args: TArgs): Promise<TReturn | null> => {
    return handleAsync(() => fn(...args), context, options);
  };
}
