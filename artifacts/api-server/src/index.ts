import app from "./app";
import { logger } from "./lib/logger";
import { startBroadcastScheduler } from "./lib/broadcastScheduler";
import { startStartDateReminders } from "./lib/startDateReminders";
import { startDietPlanDuplicateWatcher } from "./lib/dietPlanDuplicates";
import { startMetaAdsScheduler } from "./routes/metaAds";
import { startPushWatcher } from "./routes/push";
import { startRealtimeWatch } from "./lib/realtimeWatch";
import { startHealthAlertWatcher } from "./lib/healthAlerts";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startBroadcastScheduler();
  startStartDateReminders();
  startDietPlanDuplicateWatcher();
  startHealthAlertWatcher();
  startMetaAdsScheduler();
  startPushWatcher();
  startRealtimeWatch();
});
