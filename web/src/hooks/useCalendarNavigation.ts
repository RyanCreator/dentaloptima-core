import { useState } from "react";
import { addDays, addMonths, subDays, subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { UK_TIMEZONE } from "@/lib/constants";

export function useCalendarNavigation() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "month" | "day">("week");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [previousViewMode, setPreviousViewMode] = useState<"week" | "month">("week");

  const navigatePrevious = () => {
    if (viewMode === "week") {
      setCurrentDate(prev => addDays(prev, -7));
    } else {
      setCurrentDate(prev => subMonths(prev, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === "week") {
      setCurrentDate(prev => addDays(prev, 7));
    } else {
      setCurrentDate(prev => addMonths(prev, 1));
    }
  };

  const goToToday = () => {
    const today = toZonedTime(new Date(), UK_TIMEZONE);
    setCurrentDate(today);
    setSelectedDay(today);
    setViewMode("day");
  };

  const openDayView = (day: Date) => {
    if (viewMode === "week" || viewMode === "month") {
      setPreviousViewMode(viewMode);
    }
    setSelectedDay(day);
    setCurrentDate(day); // Sync currentDate with selectedDay
    setViewMode("day");
  };

  const backToCalendar = () => {
    setViewMode(previousViewMode);
    setSelectedDay(null);
  };

  const navigatePreviousDay = () => {
    if (selectedDay) {
      const newDay = subDays(selectedDay, 1);
      setSelectedDay(newDay);
      setCurrentDate(newDay); // Update currentDate so useAppointments reloads
    }
  };

  const navigateNextDay = () => {
    if (selectedDay) {
      const newDay = addDays(selectedDay, 1);
      setSelectedDay(newDay);
      setCurrentDate(newDay); // Update currentDate so useAppointments reloads
    }
  };

  return {
    currentDate,
    setCurrentDate,
    viewMode,
    setViewMode,
    selectedDay,
    setSelectedDay,
    navigatePrevious,
    navigateNext,
    navigatePreviousDay,
    navigateNextDay,
    goToToday,
    openDayView,
    backToCalendar,
  };
}
