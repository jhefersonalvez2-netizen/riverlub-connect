import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { getPrompt, savePrompt } from "../llm/promptStore";

export const promptRouter = Router();

const promptSchema = z.object({
  prompt: z.string().trim().min(20).max(12000)
});

promptRouter.get("/", requireAuth, async (_request, response, next) => {
  try {
    response.json({
      ok: true,
      ...(await getPrompt())
    });
  } catch (error) {
    next(error);
  }
});

promptRouter.put("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = promptSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    response.json({
      ok: true,
      ...(await savePrompt(parsed.data.prompt))
    });
  } catch (error) {
    next(error);
  }
});
