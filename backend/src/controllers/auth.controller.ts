
import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { parse, HttpError } from "../lib/http";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validators/auth";
import {
  hashPassword,
  comparePassword,
  generateToken,
} from "../lib/auth";
import { sendPasswordResetEmail } from "../lib/mailer";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  INVALID_RESET_TOKEN_MESSAGE,
  isPasswordResetTokenUsable,
  PASSWORD_RESET_TTL_MS,
} from "../lib/password-reset";


export async function register(
  req: Request,
  res: Response
) {
  try {
    const { name, email, password, nim } = parse<{
      name: string;
      email: string;
      password: string;
      nim?: string;
    }>(registerSchema, req.body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: nim ? [{ email }, { nim }] : [{ email }],
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email atau NIM sudah terdaftar",
      });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        nim: nim || null,
        role: "STUDENT",
      },
      select: {
        id: true,
        name: true,
        email: true,
        nim: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Registrasi mahasiswa berhasil",
      data: user,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}


export async function login(
  req: Request,
  res: Response
) {
  try {
    const { email, password } = parse<{ email: string; password: string }>(
      loginSchema,
      req.body
    );

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const passwordMatch = await comparePassword(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Akun Anda dinonaktifkan. Hubungi administrator.",
      });
    }

    const token = generateToken({
      userId: user.id,
      role: user.role,
    });

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          nim: user.nim,
          role: user.role,
          emailNotifications: user.emailNotifications,
        },
      },
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}

/** POST /auth/forgot-password — always returns the same response for privacy. */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = parse<{ email: string }>(forgotPasswordSchema, req.body);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  if (user?.isActive) {
    const reset = createPasswordResetToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
    const resetEmail = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM User WHERE id = ${user.id} FOR UPDATE`;
      const activeUser = await tx.user.findFirst({
        where: { id: user.id, isActive: true },
        select: { email: true },
      });
      if (!activeUser) return null;

      await tx.$executeRaw`DELETE FROM \`PasswordResetToken\` WHERE \`expiresAt\` <= ${now}`;
      await tx.$executeRaw`DELETE FROM \`PasswordResetToken\` WHERE \`userId\` = ${user.id}`;
      await tx.$executeRaw`
        INSERT INTO \`PasswordResetToken\` (\`userId\`, \`tokenHash\`, \`expiresAt\`)
        VALUES (${user.id}, ${reset.tokenHash}, ${expiresAt})
      `;
      return activeUser.email;
    });

    if (resetEmail) {
      const appUrl = (process.env.APP_WEB_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "");
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(reset.token)}`;
      void sendPasswordResetEmail(resetEmail, resetUrl).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
        console.error(`Gagal mengirim email reset password: ${message}`);
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: "Jika email terdaftar, tautan reset telah dikirim",
  });
}

/** POST /auth/reset-password — consumes a valid token and updates the password atomically. */
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = parse<{ token: string; password: string }>(
    resetPasswordSchema,
    req.body
  );
  const tokenHash = hashPasswordResetToken(token);
  const [resetToken] = await prisma.$queryRaw<Array<{
    id: number;
    userId: number;
    expiresAt: Date;
    usedAt: Date | null;
    isActive: boolean;
  }>>`
    SELECT t.\`id\`, t.\`userId\`, t.\`expiresAt\`, t.\`usedAt\`, u.\`isActive\`
    FROM \`PasswordResetToken\` t
    INNER JOIN \`User\` u ON u.\`id\` = t.\`userId\`
    WHERE t.\`tokenHash\` = ${tokenHash}
    LIMIT 1
  `;

  if (
    !resetToken ||
    !resetToken.isActive ||
    !isPasswordResetTokenUsable(resetToken)
  ) {
    return res.status(400).json({ success: false, message: INVALID_RESET_TOKEN_MESSAGE });
  }

  const hashedPassword = await hashPassword(password);
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.$executeRaw`
      UPDATE \`PasswordResetToken\`
      SET \`usedAt\` = ${now}
      WHERE \`id\` = ${resetToken.id}
        AND \`usedAt\` IS NULL
        AND \`expiresAt\` > ${now}
    `;
    if (claimed !== 1) return false;

    const changedUser = await tx.$executeRaw`
      UPDATE \`User\`
      SET \`password\` = ${hashedPassword}, \`updatedAt\` = ${now}
      WHERE \`id\` = ${resetToken.userId} AND \`isActive\` = TRUE
    `;
    if (changedUser !== 1) return false;

    await tx.$executeRaw`
      UPDATE \`PasswordResetToken\`
      SET \`usedAt\` = ${now}
      WHERE \`userId\` = ${resetToken.userId}
        AND \`id\` <> ${resetToken.id}
        AND \`usedAt\` IS NULL
    `;
    return true;
  });

  if (!updated) {
    return res.status(400).json({ success: false, message: INVALID_RESET_TOKEN_MESSAGE });
  }

  return res.status(200).json({
    success: true,
    message: "Password berhasil diperbarui. Silakan masuk kembali.",
  });
}

/** GET /auth/me — profil akun yang sedang login. */
export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, email: true, nim: true, role: true, emailNotifications: true, createdAt: true },
  });
  if (!user) throw new HttpError(404, "Pengguna tidak ditemukan");
  return res.status(200).json({ success: true, message: "Profil berhasil diambil", data: user });
}

/**
 * POST /auth/logout — JWT bersifat stateless, jadi server hanya mengonfirmasi;
 * klien wajib membuang token yang tersimpan.
 */
export async function logout(_req: AuthRequest, res: Response) {
  return res.status(200).json({ success: true, message: "Logout berhasil. Hapus token di perangkat Anda." });
}
