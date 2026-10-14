import { hostedOnVercel } from "./auth-config";

export const vercelQueueEnabled = () =>
  hostedOnVercel() &&
  !process.env.REDIS_URL &&
  !process.env.API_UPSTREAM_ORIGIN &&
  process.env.VERCEL_QUEUES_ENABLED !== "false";

export const automationAvailable = () =>
  !hostedOnVercel() || !!process.env.REDIS_URL || vercelQueueEnabled();

// The daily cron runs during this hour in São Paulo (Hobby has hourly precision).
export const scheduledTime = (requested: string) =>
  vercelQueueEnabled() ? "08:00" : requested;
