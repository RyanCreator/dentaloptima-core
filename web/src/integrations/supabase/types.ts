export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment: {
        Row: {
          arrived_at: string | null
          booking_request_id: string | null
          booking_source: Database["public"]["Enums"]["booking_source"]
          cancellation_notes: string | null
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by_staff_id: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          no_show_recorded_at: string | null
          patient_id: string
          post_appointment_followup_sent_at: string | null
          practice_id: string
          recall_created: boolean
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          rescheduled_from_id: string | null
          rescheduled_to_id: string | null
          staff_id: string
          started_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          treatment_summary: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          arrived_at?: string | null
          booking_request_id?: string | null
          booking_source?: Database["public"]["Enums"]["booking_source"]
          cancellation_notes?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by_staff_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          no_show_recorded_at?: string | null
          patient_id: string
          post_appointment_followup_sent_at?: string | null
          practice_id: string
          recall_created?: boolean
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_id?: string | null
          staff_id: string
          started_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_summary?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          arrived_at?: string | null
          booking_request_id?: string | null
          booking_source?: Database["public"]["Enums"]["booking_source"]
          cancellation_notes?: string | null
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by_staff_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          no_show_recorded_at?: string | null
          patient_id?: string
          post_appointment_followup_sent_at?: string | null
          practice_id?: string
          recall_created?: boolean
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_id?: string | null
          staff_id?: string
          started_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          treatment_summary?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_completed_by_staff_id_fkey"
            columns: ["completed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_rescheduled_to_id_fkey"
            columns: ["rescheduled_to_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_service: {
        Row: {
          appointment_id: string
          created_at: string
          display_order: number
          duration_minutes_snapshot: number
          id: string
          practice_id: string
          price_pence_snapshot: number | null
          service_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          display_order?: number
          duration_minutes_snapshot: number
          id?: string
          practice_id: string
          price_pence_snapshot?: number | null
          service_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          display_order?: number
          duration_minutes_snapshot?: number
          id?: string
          practice_id?: string
          price_pence_snapshot?: number | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_service_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_service_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_service_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
        ]
      }
      audit: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          after_data: Json | null
          before_data: Json | null
          context: string | null
          entity_id: string
          entity_type: string
          id: string
          performed_at: string
          performed_by_email: string | null
          performed_by_id: string | null
          practice_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          context?: string | null
          entity_id: string
          entity_type: string
          id?: string
          performed_at?: string
          performed_by_email?: string | null
          performed_by_id?: string | null
          practice_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          context?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          performed_at?: string
          performed_by_email?: string | null
          performed_by_id?: string | null
          practice_id?: string | null
        }
        Relationships: []
      }
      billing_item: {
        Row: {
          amount_paid_pence: number
          appointment_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          exemption_evidence_seen: boolean
          id: string
          is_nhs: boolean
          nhs_band: Database["public"]["Enums"]["nhs_band"] | null
          nhs_exemption_category: Database["public"]["Enums"]["nhs_exemption_category"]
          patient_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          practice_id: string
          quantity: number
          service_id: string | null
          total_pence: number
          treatment_plan_item_id: string | null
          unit_price_pence: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_paid_pence?: number
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          exemption_evidence_seen?: boolean
          id?: string
          is_nhs?: boolean
          nhs_band?: Database["public"]["Enums"]["nhs_band"] | null
          nhs_exemption_category?: Database["public"]["Enums"]["nhs_exemption_category"]
          patient_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          practice_id: string
          quantity?: number
          service_id?: string | null
          total_pence: number
          treatment_plan_item_id?: string | null
          unit_price_pence: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_paid_pence?: number
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          exemption_evidence_seen?: boolean
          id?: string
          is_nhs?: boolean
          nhs_band?: Database["public"]["Enums"]["nhs_band"] | null
          nhs_exemption_category?: Database["public"]["Enums"]["nhs_exemption_category"]
          patient_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          practice_id?: string
          quantity?: number
          service_id?: string | null
          total_pence?: number
          treatment_plan_item_id?: string | null
          unit_price_pence?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_item_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_treatment_plan_item_id_fkey"
            columns: ["treatment_plan_item_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_item_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_time: {
        Row: {
          block_type: Database["public"]["Enums"]["blocked_time_type"]
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          practice_id: string
          staff_id: string | null
          starts_at: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_type?: Database["public"]["Enums"]["blocked_time_type"]
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          practice_id: string
          staff_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_type?: Database["public"]["Enums"]["blocked_time_type"]
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          practice_id?: string
          staff_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_time_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_time_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_time_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_time_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_request: {
        Row: {
          alternative_times: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          ip_address: unknown
          is_emergency: boolean
          is_new_patient: boolean
          last_name: string
          notes: string | null
          patient_id: string | null
          phone: string | null
          practice_id: string
          preferred_dentist_id: string | null
          preferred_ends_at: string | null
          preferred_starts_at: string | null
          reason: string | null
          rejection_reason: string | null
          responded_at: string | null
          responded_by: string | null
          resulting_appointment_id: string | null
          service_id: string | null
          service_text: string | null
          source: Database["public"]["Enums"]["booking_source"]
          source_url: string | null
          status: Database["public"]["Enums"]["booking_request_status"]
          updated_at: string
          updated_by: string | null
          user_agent: string | null
          viewed_at: string | null
          viewed_by: string | null
        }
        Insert: {
          alternative_times?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          ip_address?: unknown
          is_emergency?: boolean
          is_new_patient?: boolean
          last_name: string
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          practice_id: string
          preferred_dentist_id?: string | null
          preferred_ends_at?: string | null
          preferred_starts_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          responded_at?: string | null
          responded_by?: string | null
          resulting_appointment_id?: string | null
          service_id?: string | null
          service_text?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Update: {
          alternative_times?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          ip_address?: unknown
          is_emergency?: boolean
          is_new_patient?: boolean
          last_name?: string
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          practice_id?: string
          preferred_dentist_id?: string | null
          preferred_ends_at?: string | null
          preferred_starts_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          responded_at?: string | null
          responded_by?: string | null
          resulting_appointment_id?: string | null
          service_id?: string | null
          service_text?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_request_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_preferred_dentist_id_fkey"
            columns: ["preferred_dentist_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_resulting_appointment_id_fkey"
            columns: ["resulting_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_viewed_by_fkey"
            columns: ["viewed_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_audit: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          after_data: Json | null
          before_data: Json | null
          context: string | null
          entity_id: string
          entity_type: string
          id: string
          patient_id: string | null
          performed_at: string
          performed_by_email: string | null
          performed_by_id: string | null
          practice_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          context?: string | null
          entity_id: string
          entity_type: string
          id?: string
          patient_id?: string | null
          performed_at?: string
          performed_by_email?: string | null
          performed_by_id?: string | null
          practice_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          context?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          patient_id?: string | null
          performed_at?: string
          performed_by_email?: string | null
          performed_by_id?: string | null
          practice_id?: string | null
        }
        Relationships: []
      }
      complaint: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          complainant_email: string | null
          complainant_name: string
          complainant_phone: string | null
          complainant_relation: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          detail: string
          escalated_to_ombudsman: boolean
          id: string
          investigation_lead: string | null
          investigation_notes: string | null
          ombudsman_outcome: string | null
          ombudsman_reference: string | null
          patient_id: string | null
          practice_id: string
          received_at: string
          received_by: string | null
          received_via: Database["public"]["Enums"]["complaint_method"]
          resolution_summary: string | null
          resolved_at: string | null
          responded_at: string | null
          response_summary: string | null
          staff_named: string[] | null
          status: Database["public"]["Enums"]["complaint_status"]
          summary: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          complainant_email?: string | null
          complainant_name: string
          complainant_phone?: string | null
          complainant_relation?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail: string
          escalated_to_ombudsman?: boolean
          id?: string
          investigation_lead?: string | null
          investigation_notes?: string | null
          ombudsman_outcome?: string | null
          ombudsman_reference?: string | null
          patient_id?: string | null
          practice_id: string
          received_at: string
          received_by?: string | null
          received_via: Database["public"]["Enums"]["complaint_method"]
          resolution_summary?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          response_summary?: string | null
          staff_named?: string[] | null
          status?: Database["public"]["Enums"]["complaint_status"]
          summary: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          complainant_email?: string | null
          complainant_name?: string
          complainant_phone?: string | null
          complainant_relation?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail?: string
          escalated_to_ombudsman?: boolean
          id?: string
          investigation_lead?: string | null
          investigation_notes?: string | null
          ombudsman_outcome?: string | null
          ombudsman_reference?: string | null
          patient_id?: string | null
          practice_id?: string
          received_at?: string
          received_by?: string | null
          received_via?: Database["public"]["Enums"]["complaint_method"]
          resolution_summary?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          response_summary?: string | null
          staff_named?: string[] | null
          status?: Database["public"]["Enums"]["complaint_status"]
          summary?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_investigation_lead_fkey"
            columns: ["investigation_lead"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_record: {
        Row: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          consent_version: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          granted_at: string
          granted_by_patient: boolean
          granted_method: Database["public"]["Enums"]["consent_method"]
          guardian_name: string | null
          guardian_relation: string | null
          id: string
          patient_id: string
          practice_id: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          updated_at: string
          updated_by: string | null
          valid_until: string | null
          witnessed_by: string | null
        }
        Insert: {
          consent_text: string
          consent_type: Database["public"]["Enums"]["consent_type"]
          consent_version: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          granted_at?: string
          granted_by_patient?: boolean
          granted_method: Database["public"]["Enums"]["consent_method"]
          guardian_name?: string | null
          guardian_relation?: string | null
          id?: string
          patient_id: string
          practice_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          witnessed_by?: string | null
        }
        Update: {
          consent_text?: string
          consent_type?: Database["public"]["Enums"]["consent_type"]
          consent_version?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          granted_at?: string
          granted_by_patient?: boolean
          granted_method?: Database["public"]["Enums"]["consent_method"]
          guardian_name?: string | null
          guardian_relation?: string | null
          id?: string
          patient_id?: string
          practice_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          witnessed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_record_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_record_witnessed_by_fkey"
            columns: ["witnessed_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_size_bytes: number
          id: string
          mime_type: string
          patient_id: string | null
          practice_id: string
          storage_bucket: string
          storage_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_size_bytes: number
          id?: string
          mime_type: string
          patient_id?: string | null
          practice_id: string
          storage_bucket?: string
          storage_path: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number
          id?: string
          mime_type?: string
          patient_id?: string | null
          practice_id?: string
          storage_bucket?: string
          storage_path?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_report: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          external_body_name: string | null
          external_reference: string | null
          id: string
          immediate_action_taken: string | null
          incident_type: Database["public"]["Enums"]["incident_type"]
          investigation_lead: string | null
          investigation_notes: string | null
          location: string | null
          occurred_at: string
          patient_id: string | null
          practice_id: string
          preventive_action: string | null
          reported_at: string
          reported_by: string
          reported_to_external_body: boolean
          resolved_at: string | null
          resolved_by: string | null
          root_cause: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          staff_involved: string[] | null
          status: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at: string
          updated_by: string | null
          witnesses: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          external_body_name?: string | null
          external_reference?: string | null
          id?: string
          immediate_action_taken?: string | null
          incident_type: Database["public"]["Enums"]["incident_type"]
          investigation_lead?: string | null
          investigation_notes?: string | null
          location?: string | null
          occurred_at: string
          patient_id?: string | null
          practice_id: string
          preventive_action?: string | null
          reported_at?: string
          reported_by: string
          reported_to_external_body?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          staff_involved?: string[] | null
          status?: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at?: string
          updated_by?: string | null
          witnesses?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          external_body_name?: string | null
          external_reference?: string | null
          id?: string
          immediate_action_taken?: string | null
          incident_type?: Database["public"]["Enums"]["incident_type"]
          investigation_lead?: string | null
          investigation_notes?: string | null
          location?: string | null
          occurred_at?: string
          patient_id?: string | null
          practice_id?: string
          preventive_action?: string | null
          reported_at?: string
          reported_by?: string
          reported_to_external_body?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          staff_involved?: string[] | null
          status?: Database["public"]["Enums"]["incident_status"]
          summary?: string
          updated_at?: string
          updated_by?: string | null
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_report_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_investigation_lead_fkey"
            columns: ["investigation_lead"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_report_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_alert: {
        Row: {
          alert_type: Database["public"]["Enums"]["medical_alert_type"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          detail: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          patient_id: string
          practice_id: string
          severity: Database["public"]["Enums"]["severity"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["medical_alert_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          patient_id: string
          practice_id: string
          severity?: Database["public"]["Enums"]["severity"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["medical_alert_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detail?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          patient_id?: string
          practice_id?: string
          severity?: Database["public"]["Enums"]["severity"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_alert_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_alert_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_alert_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_alert_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_history_entry: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          entry_type: Database["public"]["Enums"]["medical_history_entry_type"]
          id: string
          is_active: boolean
          notes: string | null
          onset_date: string | null
          patient_id: string
          practice_id: string
          recorded_at: string
          resolved_date: string | null
          severity: Database["public"]["Enums"]["severity"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          entry_type: Database["public"]["Enums"]["medical_history_entry_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          onset_date?: string | null
          patient_id: string
          practice_id: string
          recorded_at?: string
          resolved_date?: string | null
          severity?: Database["public"]["Enums"]["severity"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          entry_type?: Database["public"]["Enums"]["medical_history_entry_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          onset_date?: string | null
          patient_id?: string
          practice_id?: string
          recorded_at?: string
          resolved_date?: string | null
          severity?: Database["public"]["Enums"]["severity"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_history_entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_history_entry_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_history_entry_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_history_entry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      nhs_claim: {
        Row: {
          accepted_at: string | null
          acknowledged_at: string | null
          course_of_treatment_id: string | null
          created_at: string
          created_by: string | null
          date_of_acceptance: string
          date_of_completion: string | null
          deleted_at: string | null
          exemption_category: Database["public"]["Enums"]["nhs_exemption_category"]
          exemption_evidence_seen: boolean
          form_type: Database["public"]["Enums"]["fp17_form_type"]
          id: string
          is_urgent_treatment: boolean
          number_of_visits: number
          oral_health_status: string | null
          paid_at: string | null
          patient_charge_pence: number
          patient_id: string
          patient_signature_method: string | null
          patient_signature_received: boolean
          payment_amount_pence: number | null
          performer_id: string
          practice_id: string
          ready_to_submit_at: string | null
          recall_interval_months: number | null
          referral_details: string | null
          referral_received: boolean
          rejected_at: string | null
          rejection_code: string | null
          rejection_reason: string | null
          scheduled_for_payment_at: string | null
          source_appointment_id: string | null
          status: Database["public"]["Enums"]["nhs_claim_status"]
          submission_reference: string | null
          submitted_at: string | null
          treatment_band:
            | Database["public"]["Enums"]["fp17_treatment_band"]
            | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          acknowledged_at?: string | null
          course_of_treatment_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_acceptance: string
          date_of_completion?: string | null
          deleted_at?: string | null
          exemption_category?: Database["public"]["Enums"]["nhs_exemption_category"]
          exemption_evidence_seen?: boolean
          form_type?: Database["public"]["Enums"]["fp17_form_type"]
          id?: string
          is_urgent_treatment?: boolean
          number_of_visits?: number
          oral_health_status?: string | null
          paid_at?: string | null
          patient_charge_pence?: number
          patient_id: string
          patient_signature_method?: string | null
          patient_signature_received?: boolean
          payment_amount_pence?: number | null
          performer_id: string
          practice_id: string
          ready_to_submit_at?: string | null
          recall_interval_months?: number | null
          referral_details?: string | null
          referral_received?: boolean
          rejected_at?: string | null
          rejection_code?: string | null
          rejection_reason?: string | null
          scheduled_for_payment_at?: string | null
          source_appointment_id?: string | null
          status?: Database["public"]["Enums"]["nhs_claim_status"]
          submission_reference?: string | null
          submitted_at?: string | null
          treatment_band?:
            | Database["public"]["Enums"]["fp17_treatment_band"]
            | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          acknowledged_at?: string | null
          course_of_treatment_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_acceptance?: string
          date_of_completion?: string | null
          deleted_at?: string | null
          exemption_category?: Database["public"]["Enums"]["nhs_exemption_category"]
          exemption_evidence_seen?: boolean
          form_type?: Database["public"]["Enums"]["fp17_form_type"]
          id?: string
          is_urgent_treatment?: boolean
          number_of_visits?: number
          oral_health_status?: string | null
          paid_at?: string | null
          patient_charge_pence?: number
          patient_id?: string
          patient_signature_method?: string | null
          patient_signature_received?: boolean
          payment_amount_pence?: number | null
          performer_id?: string
          practice_id?: string
          ready_to_submit_at?: string | null
          recall_interval_months?: number | null
          referral_details?: string | null
          referral_received?: boolean
          rejected_at?: string | null
          rejection_code?: string | null
          rejection_reason?: string | null
          scheduled_for_payment_at?: string | null
          source_appointment_id?: string | null
          status?: Database["public"]["Enums"]["nhs_claim_status"]
          submission_reference?: string | null
          submitted_at?: string | null
          treatment_band?:
            | Database["public"]["Enums"]["fp17_treatment_band"]
            | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nhs_claim_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_performer_id_fkey"
            columns: ["performer_id"]
            isOneToOne: false
            referencedRelation: "nhs_performer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      nhs_claim_billing_link: {
        Row: {
          billing_item_id: string
          created_at: string
          id: string
          nhs_claim_id: string
          practice_id: string
        }
        Insert: {
          billing_item_id: string
          created_at?: string
          id?: string
          nhs_claim_id: string
          practice_id: string
        }
        Update: {
          billing_item_id?: string
          created_at?: string
          id?: string
          nhs_claim_id?: string
          practice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nhs_claim_billing_link_billing_item_id_fkey"
            columns: ["billing_item_id"]
            isOneToOne: false
            referencedRelation: "billing_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_billing_link_nhs_claim_id_fkey"
            columns: ["nhs_claim_id"]
            isOneToOne: false
            referencedRelation: "nhs_claim"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_billing_link_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
        ]
      }
      nhs_claim_orthodontic: {
        Row: {
          appliance_fitted_date: string | null
          assessment_date: string | null
          created_at: string
          created_by: string | null
          discontinuation_reason: string | null
          discontinued_at: string | null
          id: string
          iotn_aesthetic_component:
            | Database["public"]["Enums"]["iotn_aesthetic_component"]
            | null
          iotn_dental_health_grade:
            | Database["public"]["Enums"]["iotn_grade"]
            | null
          nhs_claim_id: string
          practice_id: string
          retention_phase_started: boolean
          retention_phase_started_at: string | null
          treatment_completion_date: string | null
          treatment_start_date: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          appliance_fitted_date?: string | null
          assessment_date?: string | null
          created_at?: string
          created_by?: string | null
          discontinuation_reason?: string | null
          discontinued_at?: string | null
          id?: string
          iotn_aesthetic_component?:
            | Database["public"]["Enums"]["iotn_aesthetic_component"]
            | null
          iotn_dental_health_grade?:
            | Database["public"]["Enums"]["iotn_grade"]
            | null
          nhs_claim_id: string
          practice_id: string
          retention_phase_started?: boolean
          retention_phase_started_at?: string | null
          treatment_completion_date?: string | null
          treatment_start_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          appliance_fitted_date?: string | null
          assessment_date?: string | null
          created_at?: string
          created_by?: string | null
          discontinuation_reason?: string | null
          discontinued_at?: string | null
          id?: string
          iotn_aesthetic_component?:
            | Database["public"]["Enums"]["iotn_aesthetic_component"]
            | null
          iotn_dental_health_grade?:
            | Database["public"]["Enums"]["iotn_grade"]
            | null
          nhs_claim_id?: string
          practice_id?: string
          retention_phase_started?: boolean
          retention_phase_started_at?: string | null
          treatment_completion_date?: string | null
          treatment_start_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nhs_claim_orthodontic_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_orthodontic_nhs_claim_id_fkey"
            columns: ["nhs_claim_id"]
            isOneToOne: true
            referencedRelation: "nhs_claim"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_orthodontic_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_orthodontic_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      nhs_claim_treatment: {
        Row: {
          antibiotic_items: number
          bridges_count: number
          created_at: string
          created_by: string | null
          crowns_count: number
          dentures_count: number
          endodontic_count: number
          examination: boolean
          extractions_count: number
          fillings_count: number
          fissure_sealants: boolean
          fluoride_varnish: boolean
          free_repair_or_replacement: boolean
          id: string
          nhs_claim_id: string
          periodontal_treatment: boolean
          practice_id: string
          scale_and_polish: boolean
          treated_tooth_numbers: number[] | null
          updated_at: string
          updated_by: string | null
          x_rays_taken: number
        }
        Insert: {
          antibiotic_items?: number
          bridges_count?: number
          created_at?: string
          created_by?: string | null
          crowns_count?: number
          dentures_count?: number
          endodontic_count?: number
          examination?: boolean
          extractions_count?: number
          fillings_count?: number
          fissure_sealants?: boolean
          fluoride_varnish?: boolean
          free_repair_or_replacement?: boolean
          id?: string
          nhs_claim_id: string
          periodontal_treatment?: boolean
          practice_id: string
          scale_and_polish?: boolean
          treated_tooth_numbers?: number[] | null
          updated_at?: string
          updated_by?: string | null
          x_rays_taken?: number
        }
        Update: {
          antibiotic_items?: number
          bridges_count?: number
          created_at?: string
          created_by?: string | null
          crowns_count?: number
          dentures_count?: number
          endodontic_count?: number
          examination?: boolean
          extractions_count?: number
          fillings_count?: number
          fissure_sealants?: boolean
          fluoride_varnish?: boolean
          free_repair_or_replacement?: boolean
          id?: string
          nhs_claim_id?: string
          periodontal_treatment?: boolean
          practice_id?: string
          scale_and_polish?: boolean
          treated_tooth_numbers?: number[] | null
          updated_at?: string
          updated_by?: string | null
          x_rays_taken?: number
        }
        Relationships: [
          {
            foreignKeyName: "nhs_claim_treatment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_treatment_nhs_claim_id_fkey"
            columns: ["nhs_claim_id"]
            isOneToOne: true
            referencedRelation: "nhs_claim"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_treatment_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_claim_treatment_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      nhs_performer: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          notes: string | null
          performer_number: string
          practice_id: string
          provider_number: string
          staff_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          performer_number: string
          practice_id: string
          provider_number: string
          staff_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          performer_number?: string
          practice_id?: string
          provider_number?: string
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nhs_performer_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_performer_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_performer_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nhs_performer_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      note: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_confidential: boolean
          note_type: Database["public"]["Enums"]["note_type"]
          parent_id: string
          parent_type: Database["public"]["Enums"]["note_parent_type"]
          patient_id: string | null
          practice_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_confidential?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          parent_id: string
          parent_type: Database["public"]["Enums"]["note_parent_type"]
          patient_id?: string | null
          practice_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_confidential?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          parent_id?: string
          parent_type?: Database["public"]["Enums"]["note_parent_type"]
          patient_id?: string | null
          practice_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      patient: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          communication_preferences: Json
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dob: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          ethnicity: string | null
          first_name: string
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          gp_name: string | null
          gp_practice_address: string | null
          gp_practice_name: string | null
          id: string
          last_name: string
          last_visited_at: string | null
          legal_hold: boolean
          legal_hold_reason: string | null
          marketing_consent_email: boolean
          marketing_consent_post: boolean
          marketing_consent_recorded_at: string | null
          marketing_consent_sms: boolean
          next_recall_date: string | null
          nhs_number: string | null
          patient_number: number | null
          phone: string | null
          phone_alt: string | null
          postcode: string | null
          practice_id: string
          preferred_dentist_id: string | null
          preferred_name: string | null
          profile_photo_path: string | null
          recall_months_override: number | null
          registered_at: string | null
          registration_status: Database["public"]["Enums"]["patient_registration_status"]
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          communication_preferences?: Json
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          ethnicity?: string | null
          first_name: string
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          gp_name?: string | null
          gp_practice_address?: string | null
          gp_practice_name?: string | null
          id?: string
          last_name: string
          last_visited_at?: string | null
          legal_hold?: boolean
          legal_hold_reason?: string | null
          marketing_consent_email?: boolean
          marketing_consent_post?: boolean
          marketing_consent_recorded_at?: string | null
          marketing_consent_sms?: boolean
          next_recall_date?: string | null
          nhs_number?: string | null
          patient_number?: number | null
          phone?: string | null
          phone_alt?: string | null
          postcode?: string | null
          practice_id: string
          preferred_dentist_id?: string | null
          preferred_name?: string | null
          profile_photo_path?: string | null
          recall_months_override?: number | null
          registered_at?: string | null
          registration_status?: Database["public"]["Enums"]["patient_registration_status"]
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          communication_preferences?: Json
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          ethnicity?: string | null
          first_name?: string
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          gp_name?: string | null
          gp_practice_address?: string | null
          gp_practice_name?: string | null
          id?: string
          last_name?: string
          last_visited_at?: string | null
          legal_hold?: boolean
          legal_hold_reason?: string | null
          marketing_consent_email?: boolean
          marketing_consent_post?: boolean
          marketing_consent_recorded_at?: string | null
          marketing_consent_sms?: boolean
          next_recall_date?: string | null
          nhs_number?: string | null
          patient_number?: number | null
          phone?: string | null
          phone_alt?: string | null
          postcode?: string | null
          practice_id?: string
          preferred_dentist_id?: string | null
          preferred_name?: string | null
          profile_photo_path?: string | null
          recall_months_override?: number | null
          registered_at?: string | null
          registration_status?: Database["public"]["Enums"]["patient_registration_status"]
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_preferred_dentist_id_fkey"
            columns: ["preferred_dentist_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      policy: {
        Row: {
          category: Database["public"]["Enums"]["policy_category"]
          content: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          effective_from: string
          id: string
          is_active: boolean
          next_review_date: string | null
          practice_id: string
          superseded_by: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          category: Database["public"]["Enums"]["policy_category"]
          content: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          next_review_date?: string | null
          practice_id: string
          superseded_by?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version: string
        }
        Update: {
          category?: Database["public"]["Enums"]["policy_category"]
          content?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          next_review_date?: string | null
          practice_id?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acknowledgement: {
        Row: {
          acknowledged_at: string
          created_at: string
          document_id: string | null
          id: string
          notes: string | null
          policy_id: string
          practice_id: string
          staff_id: string
        }
        Insert: {
          acknowledged_at?: string
          created_at?: string
          document_id?: string | null
          id?: string
          notes?: string | null
          policy_id: string
          practice_id: string
          staff_id: string
        }
        Update: {
          acknowledged_at?: string
          created_at?: string
          document_id?: string | null
          id?: string
          notes?: string | null
          policy_id?: string
          practice_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgement_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgement_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgement_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgement_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      practice: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string
          cqc_location_id: string | null
          cqc_provider_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          nhs_contract_number: string | null
          nhs_location_id: string | null
          plan: string
          postcode: string | null
          primary_email: string | null
          primary_phone: string | null
          slug: string
          status: string
          timezone: string
          trial_ends_at: string | null
          trial_started_at: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          cqc_location_id?: string | null
          cqc_provider_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          nhs_contract_number?: string | null
          nhs_location_id?: string | null
          plan?: string
          postcode?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          slug: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          trial_started_at?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string
          cqc_location_id?: string | null
          cqc_provider_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          nhs_contract_number?: string | null
          nhs_location_id?: string | null
          plan?: string
          postcode?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          slug?: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          trial_started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_closure: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          ends_time: string | null
          id: string
          is_full_day: boolean
          practice_id: string
          reason: string
          starts_on: string
          starts_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          ends_time?: string | null
          id?: string
          is_full_day?: boolean
          practice_id: string
          reason: string
          starts_on: string
          starts_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          ends_time?: string | null
          id?: string
          is_full_day?: boolean
          practice_id?: string
          reason?: string
          starts_on?: string
          starts_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_closure_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_closure_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_closure_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_hours: {
        Row: {
          close_time: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          open_time: string | null
          practice_id: string
          updated_at: string
          updated_by: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          open_time?: string | null
          practice_id: string
          updated_at?: string
          updated_by?: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Update: {
          close_time?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          open_time?: string | null
          practice_id?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: Database["public"]["Enums"]["weekday"]
        }
        Relationships: [
          {
            foreignKeyName: "practice_hours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_hours_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_hours_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_member: {
        Row: {
          available_for_booking: boolean
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          gdc_number: string | null
          id: string
          is_active: boolean
          phone: string | null
          practice_id: string
          role: Database["public"]["Enums"]["practice_role"]
          specialism: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_for_booking?: boolean
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          gdc_number?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          practice_id: string
          role: Database["public"]["Enums"]["practice_role"]
          specialism?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_for_booking?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          gdc_number?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          practice_id?: string
          role?: Database["public"]["Enums"]["practice_role"]
          specialism?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_member_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription: {
        Row: {
          appointment_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          collected_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dose: string
          drug_name: string
          duration: string
          frequency: string
          id: string
          indication: string
          is_controlled_drug: boolean
          is_repeat: boolean
          issued_at: string | null
          patient_counselled: boolean
          patient_id: string
          practice_id: string
          prescriber_id: string
          quantity: string
          route: string | null
          status: Database["public"]["Enums"]["prescription_status"]
          updated_at: string
          updated_by: string | null
          warnings_given: string | null
        }
        Insert: {
          appointment_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dose: string
          drug_name: string
          duration: string
          frequency: string
          id?: string
          indication: string
          is_controlled_drug?: boolean
          is_repeat?: boolean
          issued_at?: string | null
          patient_counselled?: boolean
          patient_id: string
          practice_id: string
          prescriber_id: string
          quantity: string
          route?: string | null
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
          updated_by?: string | null
          warnings_given?: string | null
        }
        Update: {
          appointment_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dose?: string
          drug_name?: string
          duration?: string
          frequency?: string
          id?: string
          indication?: string
          is_controlled_drug?: boolean
          is_repeat?: boolean
          issued_at?: string | null
          patient_counselled?: boolean
          patient_id?: string
          practice_id?: string
          prescriber_id?: string
          quantity?: string
          route?: string | null
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
          updated_by?: string | null
          warnings_given?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_prescriber_id_fkey"
            columns: ["prescriber_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      recall: {
        Row: {
          booked_appointment_id: string | null
          booked_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string
          id: string
          notes: string | null
          patient_id: string
          practice_id: string
          reminded_at: string | null
          reminder_count: number
          service_id: string | null
          source_appointment_id: string | null
          status: Database["public"]["Enums"]["recall_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booked_appointment_id?: string | null
          booked_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date: string
          id?: string
          notes?: string | null
          patient_id: string
          practice_id: string
          reminded_at?: string | null
          reminder_count?: number
          service_id?: string | null
          source_appointment_id?: string | null
          status?: Database["public"]["Enums"]["recall_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booked_appointment_id?: string | null
          booked_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          patient_id?: string
          practice_id?: string
          reminded_at?: string | null
          reminder_count?: number
          service_id?: string | null
          source_appointment_id?: string | null
          status?: Database["public"]["Enums"]["recall_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recall_booked_appointment_id_fkey"
            columns: ["booked_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      referral: {
        Row: {
          accepted_at: string | null
          acknowledged_at: string | null
          clinical_summary: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          declined_at: string | null
          declined_reason: string | null
          deleted_at: string | null
          document_id: string | null
          external_specialist_address: string | null
          external_specialist_email: string | null
          external_specialist_name: string | null
          external_specialist_phone: string | null
          external_specialist_practice: string | null
          id: string
          internal_specialist_id: string | null
          patient_id: string
          practice_id: string
          reason: string
          referred_by: string
          sent_at: string | null
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
          updated_by: string | null
          urgency: Database["public"]["Enums"]["referral_urgency"]
        }
        Insert: {
          accepted_at?: string | null
          acknowledged_at?: string | null
          clinical_summary?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          deleted_at?: string | null
          document_id?: string | null
          external_specialist_address?: string | null
          external_specialist_email?: string | null
          external_specialist_name?: string | null
          external_specialist_phone?: string | null
          external_specialist_practice?: string | null
          id?: string
          internal_specialist_id?: string | null
          patient_id: string
          practice_id: string
          reason: string
          referred_by: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
          updated_by?: string | null
          urgency?: Database["public"]["Enums"]["referral_urgency"]
        }
        Update: {
          accepted_at?: string | null
          acknowledged_at?: string | null
          clinical_summary?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          deleted_at?: string | null
          document_id?: string | null
          external_specialist_address?: string | null
          external_specialist_email?: string | null
          external_specialist_name?: string | null
          external_specialist_phone?: string | null
          external_specialist_practice?: string | null
          id?: string
          internal_specialist_id?: string | null
          patient_id?: string
          practice_id?: string
          reason?: string
          referred_by?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
          updated_by?: string | null
          urgency?: Database["public"]["Enums"]["referral_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "referral_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_internal_specialist_id_fkey"
            columns: ["internal_specialist_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      safeguarding_concern: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closure_summary: string | null
          concern_type: Database["public"]["Enums"]["safeguarding_concern_type"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          external_outcome: string | null
          external_reference: string | null
          id: string
          immediate_risk_assessment: string | null
          patient_id: string | null
          practice_id: string
          raised_at: string
          raised_by: string
          referred_at: string | null
          referred_to: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["safeguarding_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closure_summary?: string | null
          concern_type: Database["public"]["Enums"]["safeguarding_concern_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          external_outcome?: string | null
          external_reference?: string | null
          id?: string
          immediate_risk_assessment?: string | null
          patient_id?: string | null
          practice_id: string
          raised_at?: string
          raised_by: string
          referred_at?: string | null
          referred_to?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["safeguarding_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closure_summary?: string | null
          concern_type?: Database["public"]["Enums"]["safeguarding_concern_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          external_outcome?: string | null
          external_reference?: string | null
          id?: string
          immediate_risk_assessment?: string | null
          patient_id?: string | null
          practice_id?: string
          raised_at?: string
          raised_by?: string
          referred_at?: string | null
          referred_to?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["safeguarding_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safeguarding_concern_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safeguarding_concern_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      service: {
        Row: {
          buffer_after_minutes: number
          buffer_before_minutes: number
          color_hex: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
          duration_minutes: number
          id: string
          is_active: boolean
          is_nhs: boolean
          is_publicly_bookable: boolean
          name: string
          nhs_band: Database["public"]["Enums"]["nhs_band"] | null
          practice_id: string
          price_pence: number | null
          recall_months: number | null
          treatment_type: Database["public"]["Enums"]["service_treatment_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_minutes: number
          id?: string
          is_active?: boolean
          is_nhs?: boolean
          is_publicly_bookable?: boolean
          name: string
          nhs_band?: Database["public"]["Enums"]["nhs_band"] | null
          practice_id: string
          price_pence?: number | null
          recall_months?: number | null
          treatment_type?: Database["public"]["Enums"]["service_treatment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_nhs?: boolean
          is_publicly_bookable?: boolean
          name?: string
          nhs_band?: Database["public"]["Enums"]["nhs_band"] | null
          practice_id?: string
          price_pence?: number | null
          recall_months?: number | null
          treatment_type?: Database["public"]["Enums"]["service_treatment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availability: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          practice_id: string
          staff_id: string
          start_time: string
          updated_at: string
          updated_by: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time: string
          id?: string
          practice_id: string
          staff_id: string
          start_time: string
          updated_at?: string
          updated_by?: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          practice_id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: Database["public"]["Enums"]["weekday"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_break: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          label: string
          practice_id: string
          staff_id: string
          start_time: string
          updated_at: string
          updated_by: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time: string
          id?: string
          label?: string
          practice_id: string
          staff_id: string
          start_time: string
          updated_at?: string
          updated_by?: string | null
          weekday: Database["public"]["Enums"]["weekday"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          label?: string
          practice_id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: Database["public"]["Enums"]["weekday"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_break_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_break_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_break_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_break_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_service: {
        Row: {
          created_at: string
          id: string
          practice_id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          practice_id: string
          service_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          practice_id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_service_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_service_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_service_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          is_approved: boolean
          practice_id: string
          reason: string | null
          staff_id: string
          starts_on: string
          time_off_type: Database["public"]["Enums"]["staff_time_off_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          is_approved?: boolean
          practice_id: string
          reason?: string | null
          staff_id: string
          starts_on: string
          time_off_type?: Database["public"]["Enums"]["staff_time_off_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          is_approved?: boolean
          practice_id?: string
          reason?: string | null
          staff_id?: string
          starts_on?: string
          time_off_type?: Database["public"]["Enums"]["staff_time_off_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          declined_at: string | null
          declined_reason: string | null
          deleted_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          patient_id: string
          practice_id: string
          proposed_at: string | null
          proposed_by: string
          status: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
          total_estimated_pence: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          patient_id: string
          practice_id: string
          proposed_at?: string | null
          proposed_by: string
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
          total_estimated_pence?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          deleted_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          patient_id?: string
          practice_id?: string
          proposed_at?: string | null
          proposed_by?: string
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title?: string
          total_estimated_pence?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_item: {
        Row: {
          completed_appointment_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes_snapshot: number | null
          id: string
          notes: string | null
          practice_id: string
          price_pence_snapshot: number | null
          scheduled_appointment_id: string | null
          sequence: number
          service_id: string
          status: Database["public"]["Enums"]["treatment_plan_item_status"]
          surface: string | null
          tooth_numbers: number[] | null
          treatment_plan_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          completed_appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes_snapshot?: number | null
          id?: string
          notes?: string | null
          practice_id: string
          price_pence_snapshot?: number | null
          scheduled_appointment_id?: string | null
          sequence?: number
          service_id: string
          status?: Database["public"]["Enums"]["treatment_plan_item_status"]
          surface?: string | null
          tooth_numbers?: number[] | null
          treatment_plan_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          completed_appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes_snapshot?: number | null
          id?: string
          notes?: string | null
          practice_id?: string
          price_pence_snapshot?: number | null
          scheduled_appointment_id?: string | null
          sequence?: number
          service_id?: string
          status?: Database["public"]["Enums"]["treatment_plan_item_status"]
          surface?: string | null
          tooth_numbers?: number[] | null
          treatment_plan_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_item_completed_appointment_id_fkey"
            columns: ["completed_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_scheduled_appointment_id_fkey"
            columns: ["scheduled_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_item_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_list: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          earliest_date: string | null
          fulfilled_appointment_id: string | null
          fulfilled_at: string | null
          id: string
          is_active: boolean
          latest_date: string | null
          notes: string | null
          patient_id: string
          practice_id: string
          preferred_days_of_week:
            | Database["public"]["Enums"]["weekday"][]
            | null
          preferred_dentist_id: string | null
          preferred_time_of_day:
            | Database["public"]["Enums"]["preferred_time_of_day"]
            | null
          priority: Database["public"]["Enums"]["waiting_list_priority"]
          service_id: string | null
          service_text: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          earliest_date?: string | null
          fulfilled_appointment_id?: string | null
          fulfilled_at?: string | null
          id?: string
          is_active?: boolean
          latest_date?: string | null
          notes?: string | null
          patient_id: string
          practice_id: string
          preferred_days_of_week?:
            | Database["public"]["Enums"]["weekday"][]
            | null
          preferred_dentist_id?: string | null
          preferred_time_of_day?:
            | Database["public"]["Enums"]["preferred_time_of_day"]
            | null
          priority?: Database["public"]["Enums"]["waiting_list_priority"]
          service_id?: string | null
          service_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          earliest_date?: string | null
          fulfilled_appointment_id?: string | null
          fulfilled_at?: string | null
          id?: string
          is_active?: boolean
          latest_date?: string | null
          notes?: string | null
          patient_id?: string
          practice_id?: string
          preferred_days_of_week?:
            | Database["public"]["Enums"]["weekday"][]
            | null
          preferred_dentist_id?: string | null
          preferred_time_of_day?:
            | Database["public"]["Enums"]["preferred_time_of_day"]
            | null
          priority?: Database["public"]["Enums"]["waiting_list_priority"]
          service_id?: string | null
          service_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_fulfilled_appointment_id_fkey"
            columns: ["fulfilled_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_preferred_dentist_id_fkey"
            columns: ["preferred_dentist_id"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "practice_member"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      list_operators: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_operator: boolean
          last_sign_in_at: string
        }[]
      }
    }
    Enums: {
      appointment_status:
        | "SCHEDULED"
        | "CONFIRMED"
        | "ARRIVED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
        | "RESCHEDULED"
      audit_action: "INSERT" | "UPDATE" | "DELETE"
      blocked_time_type:
        | "MEETING"
        | "TRAINING"
        | "ADMIN"
        | "LUNCH"
        | "EQUIPMENT_DOWN"
        | "OTHER"
      booking_request_status:
        | "NEW"
        | "VIEWED"
        | "CONFIRMED"
        | "REJECTED"
        | "CANCELLED"
        | "WAITLIST"
      booking_source:
        | "INTERNAL"
        | "PUBLIC_FORM"
        | "PHONE"
        | "EMAIL"
        | "WALK_IN"
        | "IMPORTED"
      cancellation_reason:
        | "PATIENT_REQUEST"
        | "PATIENT_NO_RESPONSE"
        | "STAFF_UNAVAILABLE"
        | "PRACTICE_CLOSURE"
        | "EQUIPMENT_FAILURE"
        | "EMERGENCY"
        | "OTHER"
      complaint_method:
        | "IN_PERSON"
        | "PHONE"
        | "EMAIL"
        | "LETTER"
        | "WEBSITE"
        | "SOCIAL_MEDIA"
        | "OTHER"
      complaint_status:
        | "NEW"
        | "ACKNOWLEDGED"
        | "UNDER_INVESTIGATION"
        | "RESPONDED"
        | "RESOLVED"
        | "ESCALATED_TO_OMBUDSMAN"
        | "CLOSED"
      consent_method:
        | "DIGITAL_SIGNATURE"
        | "IPAD_SIGNATURE"
        | "PAPER"
        | "VERBAL"
      consent_type:
        | "PRIVACY_NOTICE"
        | "TREATMENT_GENERAL"
        | "TREATMENT_SPECIFIC"
        | "X_RAY"
        | "SEDATION"
        | "PHOTOGRAPHY"
        | "NHS_TERMS"
        | "MARKETING"
        | "DATA_SHARING"
      document_type:
        | "X_RAY"
        | "INTRA_ORAL_PHOTO"
        | "CONSENT_FORM"
        | "REFERRAL_LETTER"
        | "ID_DOCUMENT"
        | "INSURANCE_DOCUMENT"
        | "MEDICAL_REPORT"
        | "TREATMENT_PLAN_PDF"
        | "OTHER"
      fp17_form_type: "FP17" | "FP17O" | "FP17W" | "FP17PR"
      fp17_treatment_band:
        | "BAND_1"
        | "BAND_2"
        | "BAND_3"
        | "URGENT"
        | "BAND_1_WITH_X_RAY"
        | "PRESCRIPTION_ONLY"
        | "REPAIR_FREE"
        | "DENTURE_REPAIR"
      gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY"
      incident_severity: "NO_HARM" | "LOW" | "MODERATE" | "SEVERE" | "DEATH"
      incident_status:
        | "REPORTED"
        | "UNDER_INVESTIGATION"
        | "ACTION_REQUIRED"
        | "RESOLVED"
        | "CLOSED"
      incident_type:
        | "CLINICAL"
        | "NEAR_MISS"
        | "EQUIPMENT_FAILURE"
        | "NEEDLESTICK"
        | "INFECTION_CONTROL"
        | "MEDICATION_ERROR"
        | "PATIENT_FALL"
        | "DATA_BREACH"
        | "STAFF_INJURY"
        | "OTHER"
      iotn_aesthetic_component:
        | "AC_1"
        | "AC_2"
        | "AC_3"
        | "AC_4"
        | "AC_5"
        | "AC_6"
        | "AC_7"
        | "AC_8"
        | "AC_9"
        | "AC_10"
      iotn_grade: "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5"
      medical_alert_type:
        | "ALLERGY"
        | "MEDICAL_CONDITION"
        | "ANTICOAGULANT"
        | "PREGNANCY"
        | "LATEX_ALLERGY"
        | "INFECTION_RISK"
        | "DRUG_INTERACTION"
        | "SAFEGUARDING"
        | "OTHER"
      medical_history_entry_type:
        | "CONDITION"
        | "MEDICATION"
        | "ALLERGY"
        | "PROCEDURE"
        | "EVENT"
      nhs_band:
        | "BAND_1"
        | "BAND_2"
        | "BAND_3"
        | "URGENT"
        | "FREE_NHS"
        | "NOT_NHS"
      nhs_claim_status:
        | "DRAFT"
        | "READY_TO_SUBMIT"
        | "SUBMITTED"
        | "ACKNOWLEDGED"
        | "ACCEPTED"
        | "REJECTED"
        | "DUPLICATE"
        | "SCHEDULED_FOR_PAYMENT"
        | "PAID"
        | "CANCELLED"
      nhs_exemption_category:
        | "NONE"
        | "UNDER_18"
        | "UNDER_19_FULL_TIME_EDUCATION"
        | "PREGNANT"
        | "NURSING_MOTHER_12M"
        | "INCOME_SUPPORT"
        | "JOBSEEKERS_ALLOWANCE"
        | "ESA_INCOME_RELATED"
        | "PENSION_CREDIT_GUARANTEE"
        | "UNIVERSAL_CREDIT_QUALIFYING"
        | "NHS_TAX_CREDIT_EXEMPTION"
        | "HC2_FULL_HELP"
        | "HC3_PARTIAL_HELP"
        | "OTHER"
      note_parent_type:
        | "PATIENT"
        | "APPOINTMENT"
        | "BOOKING_REQUEST"
        | "TREATMENT_PLAN"
        | "MEDICAL_HISTORY_ENTRY"
        | "CONSENT_RECORD"
        | "REFERRAL"
        | "INCIDENT_REPORT"
        | "COMPLAINT"
      note_type:
        | "CLINICAL"
        | "ADMIN"
        | "COMMUNICATION"
        | "CONSULTATION"
        | "OBSERVATION"
      patient_registration_status:
        | "PROSPECT"
        | "REGISTERED"
        | "INACTIVE"
        | "DECEASED"
      payment_status:
        | "UNPAID"
        | "PARTIALLY_PAID"
        | "PAID"
        | "REFUNDED"
        | "WRITTEN_OFF"
        | "NHS_CLAIMED"
      policy_category:
        | "INFECTION_CONTROL"
        | "SAFEGUARDING"
        | "COMPLAINTS"
        | "INFORMATION_GOVERNANCE"
        | "EQUALITY_DIVERSITY"
        | "HEALTH_SAFETY"
        | "CLINICAL_GOVERNANCE"
        | "WHISTLEBLOWING"
        | "CONSENT"
        | "BUSINESS_CONTINUITY"
        | "OTHER"
      practice_role:
        | "OWNER"
        | "ADMIN"
        | "DENTIST"
        | "HYGIENIST"
        | "NURSE"
        | "RECEPTIONIST"
      preferred_time_of_day: "MORNING" | "AFTERNOON" | "EVENING" | "ANY"
      prescription_status:
        | "DRAFT"
        | "ISSUED"
        | "COLLECTED"
        | "CANCELLED"
        | "EXPIRED"
      recall_status:
        | "PENDING"
        | "REMINDED"
        | "BOOKED"
        | "COMPLETED"
        | "MISSED"
        | "CANCELLED"
      referral_status:
        | "DRAFT"
        | "SENT"
        | "ACKNOWLEDGED"
        | "ACCEPTED"
        | "DECLINED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
      referral_urgency: "ROUTINE" | "URGENT" | "TWO_WEEK_WAIT"
      safeguarding_concern_type:
        | "CHILD"
        | "ADULT_AT_RISK"
        | "DOMESTIC_ABUSE"
        | "MENTAL_CAPACITY"
        | "NEGLECT"
        | "PHYSICAL_ABUSE"
        | "OTHER"
      safeguarding_status:
        | "IDENTIFIED"
        | "INTERNAL_REVIEW"
        | "REFERRED_LOCAL_AUTHORITY"
        | "REFERRED_POLICE"
        | "CLOSED_NO_ACTION"
        | "CLOSED_ACTIONED"
      service_treatment_type:
        | "EXAMINATION"
        | "HYGIENE"
        | "RESTORATIVE"
        | "ENDODONTIC"
        | "PROSTHODONTIC"
        | "ORTHODONTIC"
        | "PERIODONTAL"
        | "ORAL_SURGERY"
        | "COSMETIC"
        | "EMERGENCY"
        | "CONSULTATION"
        | "X_RAY"
        | "OTHER"
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      staff_time_off_type:
        | "HOLIDAY"
        | "SICK"
        | "TRAINING"
        | "COMPASSIONATE"
        | "OTHER"
      treatment_plan_item_status:
        | "PROPOSED"
        | "SCHEDULED"
        | "COMPLETED"
        | "CANCELLED"
      treatment_plan_status:
        | "DRAFT"
        | "PROPOSED"
        | "ACCEPTED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "DECLINED"
        | "EXPIRED"
      waiting_list_priority: "URGENT" | "HIGH" | "NORMAL" | "LOW"
      weekday: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      appointment_status: [
        "SCHEDULED",
        "CONFIRMED",
        "ARRIVED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
        "RESCHEDULED",
      ],
      audit_action: ["INSERT", "UPDATE", "DELETE"],
      blocked_time_type: [
        "MEETING",
        "TRAINING",
        "ADMIN",
        "LUNCH",
        "EQUIPMENT_DOWN",
        "OTHER",
      ],
      booking_request_status: [
        "NEW",
        "VIEWED",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
        "WAITLIST",
      ],
      booking_source: [
        "INTERNAL",
        "PUBLIC_FORM",
        "PHONE",
        "EMAIL",
        "WALK_IN",
        "IMPORTED",
      ],
      cancellation_reason: [
        "PATIENT_REQUEST",
        "PATIENT_NO_RESPONSE",
        "STAFF_UNAVAILABLE",
        "PRACTICE_CLOSURE",
        "EQUIPMENT_FAILURE",
        "EMERGENCY",
        "OTHER",
      ],
      complaint_method: [
        "IN_PERSON",
        "PHONE",
        "EMAIL",
        "LETTER",
        "WEBSITE",
        "SOCIAL_MEDIA",
        "OTHER",
      ],
      complaint_status: [
        "NEW",
        "ACKNOWLEDGED",
        "UNDER_INVESTIGATION",
        "RESPONDED",
        "RESOLVED",
        "ESCALATED_TO_OMBUDSMAN",
        "CLOSED",
      ],
      consent_method: [
        "DIGITAL_SIGNATURE",
        "IPAD_SIGNATURE",
        "PAPER",
        "VERBAL",
      ],
      consent_type: [
        "PRIVACY_NOTICE",
        "TREATMENT_GENERAL",
        "TREATMENT_SPECIFIC",
        "X_RAY",
        "SEDATION",
        "PHOTOGRAPHY",
        "NHS_TERMS",
        "MARKETING",
        "DATA_SHARING",
      ],
      document_type: [
        "X_RAY",
        "INTRA_ORAL_PHOTO",
        "CONSENT_FORM",
        "REFERRAL_LETTER",
        "ID_DOCUMENT",
        "INSURANCE_DOCUMENT",
        "MEDICAL_REPORT",
        "TREATMENT_PLAN_PDF",
        "OTHER",
      ],
      fp17_form_type: ["FP17", "FP17O", "FP17W", "FP17PR"],
      fp17_treatment_band: [
        "BAND_1",
        "BAND_2",
        "BAND_3",
        "URGENT",
        "BAND_1_WITH_X_RAY",
        "PRESCRIPTION_ONLY",
        "REPAIR_FREE",
        "DENTURE_REPAIR",
      ],
      gender: ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"],
      incident_severity: ["NO_HARM", "LOW", "MODERATE", "SEVERE", "DEATH"],
      incident_status: [
        "REPORTED",
        "UNDER_INVESTIGATION",
        "ACTION_REQUIRED",
        "RESOLVED",
        "CLOSED",
      ],
      incident_type: [
        "CLINICAL",
        "NEAR_MISS",
        "EQUIPMENT_FAILURE",
        "NEEDLESTICK",
        "INFECTION_CONTROL",
        "MEDICATION_ERROR",
        "PATIENT_FALL",
        "DATA_BREACH",
        "STAFF_INJURY",
        "OTHER",
      ],
      iotn_aesthetic_component: [
        "AC_1",
        "AC_2",
        "AC_3",
        "AC_4",
        "AC_5",
        "AC_6",
        "AC_7",
        "AC_8",
        "AC_9",
        "AC_10",
      ],
      iotn_grade: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5"],
      medical_alert_type: [
        "ALLERGY",
        "MEDICAL_CONDITION",
        "ANTICOAGULANT",
        "PREGNANCY",
        "LATEX_ALLERGY",
        "INFECTION_RISK",
        "DRUG_INTERACTION",
        "SAFEGUARDING",
        "OTHER",
      ],
      medical_history_entry_type: [
        "CONDITION",
        "MEDICATION",
        "ALLERGY",
        "PROCEDURE",
        "EVENT",
      ],
      nhs_band: ["BAND_1", "BAND_2", "BAND_3", "URGENT", "FREE_NHS", "NOT_NHS"],
      nhs_claim_status: [
        "DRAFT",
        "READY_TO_SUBMIT",
        "SUBMITTED",
        "ACKNOWLEDGED",
        "ACCEPTED",
        "REJECTED",
        "DUPLICATE",
        "SCHEDULED_FOR_PAYMENT",
        "PAID",
        "CANCELLED",
      ],
      nhs_exemption_category: [
        "NONE",
        "UNDER_18",
        "UNDER_19_FULL_TIME_EDUCATION",
        "PREGNANT",
        "NURSING_MOTHER_12M",
        "INCOME_SUPPORT",
        "JOBSEEKERS_ALLOWANCE",
        "ESA_INCOME_RELATED",
        "PENSION_CREDIT_GUARANTEE",
        "UNIVERSAL_CREDIT_QUALIFYING",
        "NHS_TAX_CREDIT_EXEMPTION",
        "HC2_FULL_HELP",
        "HC3_PARTIAL_HELP",
        "OTHER",
      ],
      note_parent_type: [
        "PATIENT",
        "APPOINTMENT",
        "BOOKING_REQUEST",
        "TREATMENT_PLAN",
        "MEDICAL_HISTORY_ENTRY",
        "CONSENT_RECORD",
        "REFERRAL",
        "INCIDENT_REPORT",
        "COMPLAINT",
      ],
      note_type: [
        "CLINICAL",
        "ADMIN",
        "COMMUNICATION",
        "CONSULTATION",
        "OBSERVATION",
      ],
      patient_registration_status: [
        "PROSPECT",
        "REGISTERED",
        "INACTIVE",
        "DECEASED",
      ],
      payment_status: [
        "UNPAID",
        "PARTIALLY_PAID",
        "PAID",
        "REFUNDED",
        "WRITTEN_OFF",
        "NHS_CLAIMED",
      ],
      policy_category: [
        "INFECTION_CONTROL",
        "SAFEGUARDING",
        "COMPLAINTS",
        "INFORMATION_GOVERNANCE",
        "EQUALITY_DIVERSITY",
        "HEALTH_SAFETY",
        "CLINICAL_GOVERNANCE",
        "WHISTLEBLOWING",
        "CONSENT",
        "BUSINESS_CONTINUITY",
        "OTHER",
      ],
      practice_role: [
        "OWNER",
        "ADMIN",
        "DENTIST",
        "HYGIENIST",
        "NURSE",
        "RECEPTIONIST",
      ],
      preferred_time_of_day: ["MORNING", "AFTERNOON", "EVENING", "ANY"],
      prescription_status: [
        "DRAFT",
        "ISSUED",
        "COLLECTED",
        "CANCELLED",
        "EXPIRED",
      ],
      recall_status: [
        "PENDING",
        "REMINDED",
        "BOOKED",
        "COMPLETED",
        "MISSED",
        "CANCELLED",
      ],
      referral_status: [
        "DRAFT",
        "SENT",
        "ACKNOWLEDGED",
        "ACCEPTED",
        "DECLINED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      referral_urgency: ["ROUTINE", "URGENT", "TWO_WEEK_WAIT"],
      safeguarding_concern_type: [
        "CHILD",
        "ADULT_AT_RISK",
        "DOMESTIC_ABUSE",
        "MENTAL_CAPACITY",
        "NEGLECT",
        "PHYSICAL_ABUSE",
        "OTHER",
      ],
      safeguarding_status: [
        "IDENTIFIED",
        "INTERNAL_REVIEW",
        "REFERRED_LOCAL_AUTHORITY",
        "REFERRED_POLICE",
        "CLOSED_NO_ACTION",
        "CLOSED_ACTIONED",
      ],
      service_treatment_type: [
        "EXAMINATION",
        "HYGIENE",
        "RESTORATIVE",
        "ENDODONTIC",
        "PROSTHODONTIC",
        "ORTHODONTIC",
        "PERIODONTAL",
        "ORAL_SURGERY",
        "COSMETIC",
        "EMERGENCY",
        "CONSULTATION",
        "X_RAY",
        "OTHER",
      ],
      severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      staff_time_off_type: [
        "HOLIDAY",
        "SICK",
        "TRAINING",
        "COMPASSIONATE",
        "OTHER",
      ],
      treatment_plan_item_status: [
        "PROPOSED",
        "SCHEDULED",
        "COMPLETED",
        "CANCELLED",
      ],
      treatment_plan_status: [
        "DRAFT",
        "PROPOSED",
        "ACCEPTED",
        "IN_PROGRESS",
        "COMPLETED",
        "DECLINED",
        "EXPIRED",
      ],
      waiting_list_priority: ["URGENT", "HIGH", "NORMAL", "LOW"],
      weekday: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
    },
  },
} as const
