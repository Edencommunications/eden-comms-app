import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getStartRemindersHealth } from "../lib/startDateReminders";
import { getDietPlanDuplicatesHealth } from "../lib/dietPlanDuplicates";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  // Evaluated job health: unhealthy when the last reminder run failed OR the
  // hourly job hasn't completed a run within its staleness window (i.e. it
  // silently stopped). Surface that as a degraded, non-200 health response so
  // uptime monitors catch it.
  const reminders = getStartRemindersHealth();
  // Duplicate diet-plan watcher: unhealthy when any client has more than one
  // diet_plans row (insert-per-save regression), when the check itself failed,
  // or when the hourly check silently stopped running.
  const dietPlanDuplicates = getDietPlanDuplicatesHealth();
  const healthy = reminders.healthy && dietPlanDuplicates.healthy;
  res
    .status(healthy ? 200 : 503)
    .json({ ...data, status: healthy ? "ok" : "degraded", startDateReminders: reminders, dietPlanDuplicates });
});

export default router;
