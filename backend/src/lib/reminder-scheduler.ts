export type ReminderJob = () => Promise<unknown>;
export type IntervalScheduler = (handler: () => void, timeout: number) => NodeJS.Timeout;

export function scheduleReminderJobs(
  jobs: readonly ReminderJob[],
  intervalMs: number,
  schedule: IntervalScheduler = setInterval
) {
  const run = () =>
    Promise.all(jobs.map((job) => job())).catch((error) =>
      console.error("Scheduler error:", error)
    );
  void run();
  const timer = schedule(run, intervalMs);
  timer.unref();
  return timer;
}
