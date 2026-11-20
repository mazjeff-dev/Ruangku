import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
export const INVALID_RESET_TOKEN_MESSAGE = "Tautan reset tidak valid atau sudah kedaluwarsa";

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isPasswordResetTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now = new Date()
) {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}
