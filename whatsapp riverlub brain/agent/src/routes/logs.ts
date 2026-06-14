import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { getLogs } from "../storage/logStore";

export const logsRouter = Router();

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(300).default(100)
});

logsRouter.get("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = logsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    response.json({
      ok: true,
      logs: await getLogs(parsed.data.limit)
    });
  } catch (error) {
    next(error);
  }
});
