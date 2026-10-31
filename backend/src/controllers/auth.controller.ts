
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { parse, HttpError } from "../lib/http";
import { registerSchema, loginSchema } from "../validators/auth";
import {
  hashPassword,
  comparePassword,
  generateToken,
} from "../lib/auth";


export async function register(
  req: Request,
  res: Response
) {
  try {
    const { name, email, password, nim } = parse<{
      name: string;
      email: string;
      password: string;
      nim: string;
    }>(registerSchema, req.body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { nim },
        ],
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
        nim,
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
