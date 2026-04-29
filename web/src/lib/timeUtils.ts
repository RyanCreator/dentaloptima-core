/**
 * Format time string to HH:mm (remove seconds)
 * @param time - Time string (e.g., "09:30:00" or "09:30")
 * @returns Formatted time string (e.g., "09:30")
 */
export const formatTime = (time: string): string => {
  return time.slice(0, 5);
};

/**
 * Format Date object to HH:mm
 * @param date - Date object
 * @returns Formatted time string (e.g., "09:30")
 */
export const formatTimeFromDate = (date: Date): string => {
  return date.toTimeString().slice(0, 5);
};

/**
 * Format time range
 * @param startTime - Start time string
 * @param endTime - End time string
 * @returns Formatted time range (e.g., "09:00 - 17:00")
 */
export const formatTimeRange = (startTime: string, endTime: string): string => {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
};
