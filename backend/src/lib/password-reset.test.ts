import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: prismaMock }));
vi.mock("./mailer", () => ({ sendPasswordResetEmail: vi.fn() }));

import { forgotPassword } from "../controllers/auth.controller";
import { sendPasswordResetEmail } from "./mailer";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenUsable,
} from "./password-reset";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("password reset token policy", () => {
  it("creates a random token while exposing only its SHA-256 hash for storage", () => {
    const first = createPasswordResetToken();
    const second = createPasswordResetToken();

    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toBe(first.token);
    expect(hashPasswordResetToken(first.token)).toBe(first.tokenHash);
    expect(second.token).not.toBe(first.token);
  });

  it("rejects expired and already-used tokens and accepts an unused unexpired token", () => {
    const now = new Date("2026-11-05T05:00:00.000Z");
    expect(isPasswordResetTokenUsable({
      expiresAt: new Date("2026-11-05T05:30:00.000Z"),
      usedAt: null,
    }, now)).toBe(true);
    expect(isPasswordResetTokenUsable({
      expiresAt: new Date("2026-11-05T04:59:59.000Z"),
      usedAt: null,
    }, now)).toBe(false);
    expect(isPasswordResetTokenUsable({
      expiresAt: new Date("2026-11-05T05:30:00.000Z"),
      usedAt: now,
    }, now)).toBe(false);
  });

  it("returns the same generic response when the requested email is not registered", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const responseState: { statusCode?: number; payload?: unknown } = {};
    const response = {
      status(statusCode: number) {
        responseState.statusCode = statusCode;
        return this;
      },
      json(payload: unknown) {
        responseState.payload = payload;
        return this;
      },
    };

    await forgotPassword(
      { body: { email: "not-registered@example.test" } } as Request,
      response as unknown as Response
    );

    expect(responseState.statusCode).toBe(200);
    expect(responseState.payload).toEqual({
      success: true,
      message: "Jika email terdaftar, tautan reset telah dikirim",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("keeps the generic success response when email delivery fails", async () => {
    const email = "registered@example.test";
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email, isActive: true });
    prismaMock.$transaction.mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      user: { findFirst: vi.fn().mockResolvedValue({ email }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    }));
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(new Error("SMTP connection refused"));
    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const responseState: { statusCode?: number; payload?: unknown } = {};
    const response = {
      status(statusCode: number) {
        responseState.statusCode = statusCode;
        return this;
      },
      json(payload: unknown) {
        responseState.payload = payload;
        return this;
      },
    };

    await forgotPassword(
      { body: { email } } as Request,
      response as unknown as Response
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(responseState.statusCode).toBe(200);
    expect(responseState.payload).toEqual({
      success: true,
      message: "Jika email terdaftar, tautan reset telah dikirim",
    });
    expect(serverLog).toHaveBeenCalledWith(
      "Gagal mengirim email reset password: SMTP connection refused"
    );
  });
});
