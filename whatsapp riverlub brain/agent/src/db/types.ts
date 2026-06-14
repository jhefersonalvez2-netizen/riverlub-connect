export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppointmentStatus = "pending_confirmation" | "confirmed" | "cancelled";
export type JobStatus = "pending" | "processed" | "failed" | "pending_reception_notification";

export interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  whatsapp_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequest {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  conversation_contact_id: string | null;
  type: string | null;
  description: string | null;
  status: string;
  priority: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_request_id: string | null;
  conversation_contact_id: string | null;
  scheduled_at: string;
  ends_at: string;
  duration_minutes: number;
  service_type: string | null;
  status: AppointmentStatus;
  confirmation_requested_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  reception_notified_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_request_id: string | null;
  status: string;
  total_estimated: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  customer_id: string | null;
  quote_id: string | null;
  amount: number | null;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReturnReminder {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  conversation_contact_id: string | null;
  reminder_at: string;
  reason: string | null;
  status: string;
  notified_at: string | null;
  created_at: string;
}

export interface JobEvent {
  id: string;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  conversation_contact_id: string | null;
  payload: Json | null;
  status: JobStatus;
  processed_at: string | null;
  created_at: string;
}

export interface AiAction {
  id: string;
  conversation_contact_id: string | null;
  action_type: string | null;
  status: string;
  input: Json | null;
  result: Json | null;
  requires_confirmation: boolean;
  confirmed_by_customer: boolean;
  created_at: string;
  completed_at: string | null;
}
