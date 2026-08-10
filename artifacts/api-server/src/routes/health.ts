import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getStartRemindersHealth } from "../lib/startDateReminders";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  // Evaluated job health: unhealthy when the last reminder run failed OR the
  // hourly job hasn't completed a run within its staleness window (i.e. it
  // silently stopped). Surface that as a degraded, non-200 health response so
  // uptime monitors catch it.
  const reminders = getStartRemindersHealth();
  res
    .status(reminders.healthy ? 200 : 503)
    .json({ ...data, status: reminders.healthy ? "ok" : "degraded", startDateReminders: reminders });
});

export default router;
