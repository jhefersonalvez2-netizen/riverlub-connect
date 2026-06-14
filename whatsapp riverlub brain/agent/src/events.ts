import type { Response } from "express";

export type AgentEventType =
  | "connected"
  | "whatsapp_status"
  | "qr_updated"
  | "message_received"
  | "message_sent"
  | "llm_response"
  | "settings_updated"
  | "conversation_created"
  | "conversation_updated"
  | "conversation_message_received"
  | "conversation_message_sent"
  | "conversation_suggestion_created"
  | "conversation_read"
  | "conversation_ai_paused"
  | "conversation_human_takeover"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  payload: unknown;
}

const clients = new Set<Response>();

function writeEvent(response: Response, event: AgentEvent) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerSseClient(response: Response) {
  clients.add(response);
  writeEvent(response, {
    type: "connected",
    timestamp: new Date().toISOString(),
    payload: { ok: true }
  });

  return () => {
    clients.delete(response);
  };
}

export function publishEvent(type: AgentEventType, payload: unknown) {
  const event: AgentEvent = {
    type,
    timestamp: new Date().toISOString(),
    payload
  };

  for (const client of clients) {
    writeEvent(client, event);
  }

  return event;
}
