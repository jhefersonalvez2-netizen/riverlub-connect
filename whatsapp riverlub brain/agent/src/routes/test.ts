import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { publishEvent } from "../events";
import { generateReply, LlmError } from "../llm/openai";
import { addLog } from "../storage/logStore";

export const testRouter = Router();

const llmTestSchema = z.object({
  message: z.string().trim().min(1)
});

testRouter.post("/llm", requireAuth, async (request, response, next) => {
  try {
    const parsed = llmTestSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: parsed.error.flatten()
      });
      return;
    }

    const reply = await generateReply(parsed.data.message);
    const payload = {
      source: "manual_test",
      input: parsed.data.message,
      reply
    };

    publishEvent("llm_response", payload);
    await addLog("llm_response", payload);

    response.json({
      ok: true,
      reply
    });
  } catch (error) {
    if (error instanceof LlmError) {
      const payload = {
        source: "manual_test",
        statusCode: error.statusCode,
        error: error.message
      };
      publishEvent("error", payload);
      await addLog("error", payload, "Falha no teste manual da OpenAI.");
      response.status(error.statusCode).json({
        ok: false,
        error: error.message,
        statusCode: error.statusCode
      });
      return;
    }

    next(error);
  }
});
