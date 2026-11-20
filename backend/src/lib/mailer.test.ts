import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotificationEmail, sendPasswordResetEmail } from "./mailer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("password reset mail fallback", () => {
  it("does not log the reset URL in production when SMTP is unavailable", async () => {
    const resetUrl = "https://app.example.test/reset-password?token=secret-token";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_HOST", "");

    await sendPasswordResetEmail("user@example.test", resetUrl);

    expect(info).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "SMTP_HOST tidak dikonfigurasi; email notifikasi tidak dapat dikirim di production."
    );
    expect(warning.mock.calls.flat().join(" ")).not.toContain("secret-token");
  });

  it("escapes user-controlled content in notification HTML", () => {
    const email = createNotificationEmail("<img src=x>", "Alasan: <script>alert('x')</script> & data");
    expect(email.subject).toBe("RuangKu: <img src=x>");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; data");
  });
});
