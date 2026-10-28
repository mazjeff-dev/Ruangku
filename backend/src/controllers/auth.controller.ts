
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
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
    const { name, email, password, nim } = req.body;

    if (!name || !email || !password || !nim) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, password, dan NIM wajib diisi",
      });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof nim !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Format data tidak valid",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 8 karakter",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.trim().toLowerCase() },
          { nim: nim.trim() },
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
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        nim: nim.trim(),
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
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email: email.trim().toLowerCase(),
      },
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
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
}
