import { afterEach, describe, expect, it, vi } from "vitest";

const { sendNotificationEmail } = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(),
}));

vi.mock("./mailer", () => ({ sendNotificationEmail }));

import { notifyUser } from "./notify";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("notification email delivery", () => {
  it("logs SMTP failures without rejecting the in-app notification flow", async () => {
    const db = {
      notification: { create: vi.fn().mockResolvedValue({ id: 5 }) },
      user: { findUnique: vi.fn().mockResolvedValue({
        email: "student@example.test",
        isActive: true,
        emailNotifications: true,
      }) },
    };
    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendNotificationEmail.mockRejectedValueOnce(new Error("SMTP unavailable"));

    await expect(notifyUser(db as never, 8, {
      type: "BOOKING_APPROVED",
      title: "Peminjaman disetujui",
      message: "Jadwal telah disetujui",
    })).resolves.toEqual({ id: 5 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(serverLog).toHaveBeenCalledWith("Gagal mengirim notifikasi email RuangKu: SMTP unavailable");
  });

  it("respects disabled email preferences while retaining in-app notifications", async () => {
    const db = {
      notification: { create: vi.fn().mockResolvedValue({ id: 6 }) },
      user: { findUnique: vi.fn().mockResolvedValue({
        email: "student@example.test",
        isActive: true,
        emailNotifications: false,
      }) },
    };

    await notifyUser(db as never, 8, {
      type: "BOOKING_APPROVED",
      title: "Peminjaman disetujui",
      message: "Jadwal telah disetujui",
    });

    expect(db.notification.create).toHaveBeenCalledOnce();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});
