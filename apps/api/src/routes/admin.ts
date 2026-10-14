import { rulesUpdateSchema, scenarioSchema, thresholdsSchema, whatIfSchema } from "@scamshield/shared";
import { Router } from "express";
import { parseBody } from "../lib/validate";
import { currentUser, requireAuth, requireRole } from "../middleware/auth";
import { getEvaluation, getMetrics, getModelInfo, getRulesView, requestRetrain, whatIf } from "../services/admin.service";
import { audit } from "../services/audit";
import { getRiskConfig, saveRules, saveThresholds } from "../services/config.service";
import { runScenario, SCENARIO_INFO } from "../services/simulator.service";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.get("/rules", async (_req, res) => {
  res.json({ rules: await getRulesView() });
});

adminRouter.put("/rules", async (req, res) => {
  const { rules } = parseBody(rulesUpdateSchema, req);
  const actor = currentUser(req).id;
  await saveRules(rules, actor);
  await audit(actor, "rules.update", "RuleConfig", { rules });
  res.json({ rules: await getRulesView() });
});

adminRouter.post("/rules/what-if", async (req, res) => {
  res.json(await whatIf(parseBody(whatIfSchema, req)));
});

adminRouter.get("/thresholds", async (_req, res) => {
  res.json((await getRiskConfig()).thresholds);
});

adminRouter.put("/thresholds", async (req, res) => {
  const t = parseBody(thresholdsSchema, req);
  const actor = currentUser(req).id;
  await saveThresholds(t, actor);
  await audit(actor, "thresholds.update", "Setting:thresholds", t);
  res.json((await getRiskConfig()).thresholds);
});

adminRouter.get("/model", async (_req, res) => {
  res.json(await getModelInfo());
});

adminRouter.post("/model/retrain", async (req, res) => {
  const actor = currentUser(req).id;
  const job = await requestRetrain(actor);
  await audit(actor, "model.retrain", "ModelRun", { jobId: job.jobId });
  res.status(202).json(job);
});

adminRouter.get("/metrics", async (_req, res) => {
  res.json(await getMetrics());
});

adminRouter.get("/evaluation", async (_req, res) => {
  res.json(await getEvaluation());
});

adminRouter.get("/simulate", (_req, res) => {
  res.json({ scenarios: Object.entries(SCENARIO_INFO).map(([id, info]) => ({ id, ...info })) });
});

adminRouter.post("/simulate/:scenario", async (req, res) => {
  res.json(await runScenario(scenarioSchema.parse(req.params.scenario), currentUser(req).id));
});
