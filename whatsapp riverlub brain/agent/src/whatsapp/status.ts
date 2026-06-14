import { publishEvent } from "../events";
import { addLog } from "../storage/logStore";

export type WhatsAppStatus =
  | "stopped"
  | "initializing"
  | "waiting_qr"
  | "qr_available"
  | "authenticated"
  | "ready"
  | "disconnected"
  | "logged_out"
  | "error";

export interface QrInfo {
  qr_text: string;
  qr_data_url: string;
  updated_at: string;
  expires_at: string;
}

export interface WhatsAppState {
  status: WhatsAppStatus;
  hasClient: boolean;
  isReady: boolean;
  lastEvent: string | null;
  lastError: string | null;
  qr: QrInfo | null;
}

const state: WhatsAppState = {
  status: "stopped",
  hasClient: false,
  isReady: false,
  lastEvent: null,
  lastError: null,
  qr: null
};

export const SUPPORTED_WHATSAPP_STATUSES: WhatsAppStatus[] = [
  "stopped",
  "initializing",
  "waiting_qr",
  "qr_available",
  "authenticated",
  "ready",
  "disconnected",
  "logged_out",
  "error"
];

export function getWhatsAppState(): WhatsAppState {
  return {
    ...state,
    qr: state.qr ? { ...state.qr } : null
  };
}

export function setWhatsAppStatus(
  status: WhatsAppStatus,
  patch: Partial<Omit<WhatsAppState, "status" | "qr">> = {}
) {
  state.status = status;
  state.hasClient = patch.hasClient ?? state.hasClient;
  state.isReady = patch.isReady ?? state.isReady;
  state.lastEvent = patch.lastEvent ?? status;
  state.lastError = patch.lastError ?? (status === "error" ? state.lastError : null);

  if (
    status === "ready" ||
    status === "authenticated" ||
    status === "stopped" ||
    status === "disconnected" ||
    status === "logged_out" ||
    status === "error"
  ) {
    state.qr = null;
  }

  const snapshot = getWhatsAppState();
  publishEvent("whatsapp_status", snapshot);
  void addLog("status", {
    status: snapshot.status,
    isReady: snapshot.isReady,
    lastEvent: snapshot.lastEvent,
    lastError: snapshot.lastError
  });

  return snapshot;
}

export function setWhatsAppQr(qrText: string, qrDataUrl: string) {
  const updatedAt = new Date();
  const expiresAt = new Date(updatedAt.getTime() + 60_000);

  state.status = "qr_available";
  state.hasClient = true;
  state.isReady = false;
  state.lastEvent = "qr";
  state.lastError = null;
  state.qr = {
    qr_text: qrText,
    qr_data_url: qrDataUrl,
    updated_at: updatedAt.toISOString(),
    expires_at: expiresAt.toISOString()
  };

  const snapshot = getWhatsAppState();
  publishEvent("qr_updated", snapshot.qr);
  publishEvent("whatsapp_status", snapshot);
  void addLog("status", {
    status: snapshot.status,
    lastEvent: snapshot.lastEvent,
    qrUpdatedAt: snapshot.qr?.updated_at,
    qrExpiresAt: snapshot.qr?.expires_at
  });

  return snapshot.qr;
}

export function setWhatsAppError(message: string, lastEvent = "error") {
  return setWhatsAppStatus("error", {
    hasClient: state.hasClient,
    isReady: false,
    lastEvent,
    lastError: message
  });
}

export function resetWhatsAppState(
  status: WhatsAppStatus = "stopped",
  lastEvent = "reset"
) {
  state.status = status;
  state.hasClient = false;
  state.isReady = false;
  state.lastEvent = lastEvent;
  state.lastError = null;
  state.qr = null;

  const snapshot = getWhatsAppState();
  publishEvent("whatsapp_status", snapshot);
  void addLog("status", {
    status: snapshot.status,
    isReady: snapshot.isReady,
    lastEvent: snapshot.lastEvent,
    lastError: snapshot.lastError
  });

  return snapshot;
}
