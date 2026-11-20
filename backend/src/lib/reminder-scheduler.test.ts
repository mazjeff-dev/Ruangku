import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleReminderJobs } from "./reminder-scheduler";
import { completeFinishedBookings, markNoShowBookings, scheduledReminderJobs } from "./reminders";

describe("reminder scheduler registration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the no-show and completion jobs immediately and registers them on the interval", async () => {
    const jobs = [vi.fn().mockResolvedValue(0), vi.fn().mockResolvedValue(0), vi.fn().mockResolvedValue(0)];
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const schedule = vi.fn((_handler: () => void, _delay: number) => timer);

    const result = scheduleReminderJobs(jobs, 60_000, schedule);
    expect(schedule).toHaveBeenCalledOnce();
    const [registeredRun, interval] = schedule.mock.calls[0];
    expect(interval).toBe(60_000);
    expect(result).toBe(timer);
    expect(timer.unref).toHaveBeenCalledOnce();

    await vi.waitFor(() => {
      for (const job of jobs) expect(job).toHaveBeenCalledOnce();
    });

    registeredRun();
    await vi.waitFor(() => {
      for (const job of jobs) expect(job).toHaveBeenCalledTimes(2);
    });
    expect(scheduledReminderJobs).toContain(markNoShowBookings);
    expect(scheduledReminderJobs).toContain(completeFinishedBookings);
  });
});
