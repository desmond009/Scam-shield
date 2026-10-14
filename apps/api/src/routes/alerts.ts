import { alertsQuerySchema, reviewAlertSchema } from "@scamshield/shared";
import { Router } from "express";
import { z } from "zod";
import { parseBody, parseQuery } from "../lib/validate";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { getAlert, listAlerts, reviewAlert } from "../services/alerts.service";
import { openEventStream } from "../services/events";

export const alertsRouter = Router();
alertsRouter.use(requireAuth, requireRole("ANALYST"));

alertsRouter.get("/", async (req, res) => {
  res.json(await listAlerts(parseQuery(alertsQuerySchema, req)));
});

/** Server-Sent Events: new and reviewed alerts, pushed by the worker via Redis pub/sub. */
alertsRouter.get("/stream", (req, res) => openEventStream(req, res));

alertsRouter.get("/:id", async (req, res) => {
  res.json(await getAlert(z.string().uuid().parse(req.params.id)));
});

alertsRouter.post("/:id/review", async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  res.json(await reviewAlert(id, currentUser(req).id, parseBody(reviewAlertSchema, req)));
});
