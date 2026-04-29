export interface StaffSchedule {
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string | null;
  effective_to: string | null;
}

export interface StaffBreak {
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string | null;
  effective_to: string | null;
}

export interface TimeOffPeriod {
  starts_at: string;
  ends_at: string;
}

export interface BlockedTime {
  starts_at: string;
  ends_at: string;
  reason: string;
}

export interface Appointment {
  starts_at: string;
  ends_at: string;
  service_id?: string | null;
  staff_id?: string;
}

export interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  active: boolean;
}

export interface AvailableSlot {
  date: Date;
  time: string;
  availableMinutes: number;
  fitsAllServices: boolean;
  fitsLimitedServices: boolean;
}

export interface PracticeHours {
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface PracticeClosure {
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}

export interface StaffAvailabilityData {
  schedules: StaffSchedule[];
  breaks: StaffBreak[];
  timeOff: TimeOffPeriod[];
  blockedTime: BlockedTime[];
  appointments: Appointment[];
  practiceHours?: PracticeHours[];
  practiceClosures?: PracticeClosure[];
}
