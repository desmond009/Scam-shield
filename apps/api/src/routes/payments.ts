import { cancelRequestSchema, checkRequestSchema, confirmRequestSchema, contextRequestSchema } from "@scamshield/shared";
import { Router } from "express";
import { z } from "zod";
import { deviceHash } from "../lib/device";
import { withIdempotency } from "../lib/idempotency";
import { parseBody } from "../lib/validate";
import { currentUser, requireAuth } from "../middleware/auth";
import { checkLimiter } from "../middleware/rateLimit";
import { answerContext, cancelPayment, checkPayment, confirmPayment } from "../services/payments.service";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const idParam = z.string().uuid();

paymentsRouter.post("/check", checkLimiter, async (req, res) => {
  const userId = currentUser(req).id;
  const body = parseBody(checkRequestSchema, req);
  const key = req.header("Idempotency-Key") ?? undefined;
  const result = await withIdempotency(userId, key, body, async () => ({
    status: 200,
    body: await checkPayment(userId, body, { deviceHash: deviceHash(req), ip: req.ip, idempotencyKey: key }),
  }));
  if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
  res.status(result.status).json(result.body);
});

paymentsRouter.post("/:id/context", async (req, res) => {
  res.json(await answerContext(currentUser(req).id, idParam.parse(req.params.id), parseBody(contextRequestSchema, req)));
});

paymentsRouter.post("/confirm", async (req, res) => {
  const body = parseBody(confirmRequestSchema, req);
  res.json(await confirmPayment(currentUser(req).id, body.checkToken, body.retypedUpiId));
});

paymentsRouter.post("/:id/cancel", async (req, res) => {
  const body = parseBody(cancelRequestSchema, req);
  res.json(await cancelPayment(currentUser(req).id, idParam.parse(req.params.id), body.report, body.reason));
});
