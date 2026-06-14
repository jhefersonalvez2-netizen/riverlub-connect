import type {
  Appointment,
  AppointmentStatus,
  Customer,
  JobEvent,
  Payment,
  Quote,
  ReturnReminder,
  ServiceRequest,
  Vehicle
} from "../db/types";

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface BusinessHourWindow {
  start: string;
  end: string;
}

export type BusinessHours = Record<Weekday, BusinessHourWindow[]>;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: [{ start: "08:00", end: "18:00" }],
  tuesday: [{ start: "08:00", end: "18:00" }],
  wednesday: [{ start: "08:00", end: "18:00" }],
  thursday: [{ start: "08:00", end: "18:00" }],
  friday: [{ start: "08:00", end: "18:00" }],
  saturday: [{ start: "08:00", end: "12:00" }],
  sunday: []
};

export interface AvailabilityInput {
  scheduledAt: string;
  durationMinutes?: number;
  serviceType?: string | null;
}

export interface AvailabilityResult {
  available: boolean;
  reason:
    | "slot_available"
    | "slot_conflict"
    | "invalid_datetime"
    | "outside_business_hours";
  conflictingAppointments?: Appointment[];
  durationMinutes: number;
  endsAt: string | null;
}

export interface CreatePendingAppointmentInput {
  customerId?: string | null;
  vehicleId?: string | null;
  serviceRequestId?: string | null;
  conversationContactId?: string | null;
  scheduledAt: string;
  serviceType?: string | null;
  durationMinutes?: number;
  notes?: string | null;
  createdBy?: string;
}

export interface JobsDashboardData {
  appointments: Appointment[];
  payments: Payment[];
  reminders: ReturnReminder[];
  events: JobEvent[];
}

export type {
  Appointment,
  AppointmentStatus,
  Customer,
  JobEvent,
  Payment,
  Quote,
  ReturnReminder,
  ServiceRequest,
  Vehicle
};
