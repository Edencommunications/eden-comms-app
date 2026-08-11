import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getStartRemindersHealth } from "../lib/startDateReminders";
import { getDietPlanDuplicatesHealth } from "../lib/dietPlanDuplicates";
import { getRealtimeWatchHealth } from "../lib/realtimeWatch";
import { getSuppSyncHealth } from "../lib/suppLibrarySync";
import { getGhlKpiHealth } from "./ghlKpi";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  // Evaluated job health: unhealthy when the last reminder run failed OR the
  // hourly job hasn't completed a run within its staleness window (i.e. it
  // silently stopped). Surface that as a degraded, non-200 health response so
  // uptime monitors catch it.
  const reminders = getStartRemindersHealth();

  // Daily realtime-publication watchdog: a failed or stale run means
  // "instant admin updates" may be silently broken.
  const realtimeWatch = getRealtimeWatchHealth();
  // Duplicate diet-plan watcher: unhealthy when any client has more than one
  // diet_plans row (insert-per-save regression), when the check itself failed,
  // or when the hourly check silently stopped running.
  const dietPlanDuplicates = getDietPlanDuplicatesHealth();
  // Add-only Eden→orgs supplement library sync: degraded when its last run
  // failed or the hourly job silently stopped.
  const suppSync = getSuppSyncHealth();
  // Weekly GHL KPI report: degraded when the last scheduled run failed or
  // the 15-minute scheduler silently stopped while reports are turned on.
  const ghlKpi = getGhlKpiHealth();
  const healthy = reminders.healthy && dietPlanDuplicates.healthy && realtimeWatch.healthy && suppSync.healthy && ghlKpi.healthy;
  res
    .status(healthy ? 200 : 503)
    .json({ ...data, status: healthy ? "ok" : "degraded", startDateReminders: reminders, dietPlanDuplicates, realtimeWatch, suppSync, ghlKpi });
});


export default router;
