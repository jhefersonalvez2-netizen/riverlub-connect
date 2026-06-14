import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  disableTemplate,
  getTemplate,
  listTemplates,
  upsertTemplate
} from "../policy/templateStore";

export const templatesRouter = Router();

const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(80).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    text: z.string().trim().min(1).max(2000)
  })
  .strict();

const templateUpdateSchema = templateSchema
  .omit({ name: true })
  .partial()
  .extend({
    text: z.string().trim().min(1).max(2000).optional()
  })
  .strict();

templatesRouter.get("/", requireAuth, async (_request, response, next) => {
  try {
    response.json({
      ok: true,
      templates: await listTemplates()
    });
  } catch (error) {
    next(error);
  }
});

templatesRouter.post("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = templateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const template = await upsertTemplate(parsed.data);
    response.status(201).json({ ok: true, template });
  } catch (error) {
    next(error);
  }
});

templatesRouter.put("/:name", requireAuth, async (request, response, next) => {
  try {
    const parsed = templateUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    const current = await getTemplate(request.params.name);

    if (!current) {
      response.status(404).json({ ok: false, error: "Template nao encontrado." });
      return;
    }

    const template = await upsertTemplate({
      ...current,
      ...parsed.data,
      name: request.params.name,
      text: parsed.data.text ?? current.text
    });
    response.json({ ok: true, template });
  } catch (error) {
    next(error);
  }
});

templatesRouter.post("/:name/disable", requireAuth, async (request, response, next) => {
  try {
    const template = await disableTemplate(request.params.name);
    response.json({ ok: true, template });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Template nao encontrado")) {
      response.status(404).json({ ok: false, error: error.message });
      return;
    }

    next(error);
  }
});
