import type { RequestHandler } from "express";
import { env } from "./env";

function extractBearerToken(header?: string) {
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export const requireAuth: RequestHandler = (request, response, next) => {
  if (!env.agentAuthToken) {
    response.status(500).json({
      ok: false,
      error: "AGENT_AUTH_TOKEN is not configured on the agent."
    });
    return;
  }

  const bearerToken = extractBearerToken(request.header("authorization"));
  const queryToken =
    typeof request.query.token === "string" ? request.query.token.trim() : null;

  if (bearerToken === env.agentAuthToken || queryToken === env.agentAuthToken) {
    next();
    return;
  }

  response.status(401).json({
    ok: false,
    error: "Missing or invalid Authorization bearer token."
  });
};
