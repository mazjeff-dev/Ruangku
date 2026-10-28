
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type AuthPayload = {
  userId: number;
  role: "STUDENT" | "ADMIN";
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET belum diatur di file .env");
  }

  return secret;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hashedPassword: string
) {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: AuthPayload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ||
      "1d") as jwt.SignOptions["expiresIn"],
  });
}
