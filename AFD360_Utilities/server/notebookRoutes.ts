import { Router, type Request, type Response } from "express";
import { kernel } from "./notebook.ts";

export const notebookApi = Router();

const MAX_CODE = 200_000;

const route = (fn: (body: Record<string, any>) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    if (typeof body.orgId !== "string") throw new Error("orgId is required");
    res.json(await fn(body));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

// Status starts the kernel too, so its imports are warm by the time the first cell runs.
notebookApi.post(
  "/status",
  route(({ orgId }) => {
    const k = kernel(orgId);
    k.start();
    return k.status();
  }),
);

notebookApi.post(
  "/run",
  route(({ orgId, code }) => {
    if (typeof code !== "string" || code.length > MAX_CODE) throw new Error("code must be a string under 200 KB");
    return kernel(orgId).run(code);
  }),
);

notebookApi.post(
  "/interrupt",
  route(({ orgId }) => {
    kernel(orgId).interrupt();
    return { ok: true };
  }),
);

notebookApi.post(
  "/restart",
  route(({ orgId }) => {
    const k = kernel(orgId);
    k.restart();
    return k.status();
  }),
);
