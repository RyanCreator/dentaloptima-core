export interface Patient {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  no_show_count: number;
  notes?: string | null;
  created_at?: string;
}

export interface Staff {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role?: string | null;
  colour_tag: string | null;
  active: boolean;
  available_for_booking: boolean;
  user_id?: string | null;
  created_at?: string;
}

export interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  colour_tag: string | null;
  active: boolean;
  all_staff_can_perform: boolean;
  price: number;
  requires_room?: boolean;
  room_capacity?: number | null;
  treatment_type?: string | null;
  is_nhs?: boolean;
  nhs_band?: number | null;
  recall_months?: number | null;
  display_order: number;
  created_at?: string;
}
