import { reportPayeeSchema, transactionsQuerySchema, upiIdSchema } from "@scamshield/shared";
import { Router } from "express";
import { parseBody, parseQuery } from "../lib/validate";
import { currentUser, requireAuth } from "../middleware/auth";
import { reportPayee } from "../services/payments.service";
import { getWallet, listTransactions, lookupPayee, safetyOverview } from "../services/wallet.service";

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get("/wallet", async (req, res) => {
  res.json(await getWallet(currentUser(req).id));
});

walletRouter.get("/transactions", async (req, res) => {
  res.json(await listTransactions(currentUser(req).id, parseQuery(transactionsQuerySchema, req)));
});

walletRouter.get("/safety", async (req, res) => {
  res.json(await safetyOverview(currentUser(req).id));
});

walletRouter.get("/payees/lookup", async (req, res) => {
  const upi = upiIdSchema.parse(req.query.upi);
  res.json(await lookupPayee(currentUser(req).id, upi));
});

walletRouter.post("/payees/report", async (req, res) => {
  const body = parseBody(reportPayeeSchema, req);
  res.status(201).json(await reportPayee(currentUser(req).id, body.payeeUpiId, body.reason));
});
