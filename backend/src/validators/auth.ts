import { z } from "zod";

const email = z
  .string({ error: "Email wajib diisi" })
  .trim()
  .toLowerCase()
  .email("Format email tidak valid")
  .max(150, "Email maksimal 150 karakter");

const name = z
  .string({ error: "Nama wajib diisi" })
  .trim()
  .min(2, "Nama minimal 2 karakter")
  .max(100, "Nama maksimal 100 karakter");

const newPassword = z
  .string({ error: "Password wajib diisi" })
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter");

export const registerSchema = z.object({
  name,
  email,
  password: newPassword,
  // NIM opsional (form registrasi mobile hanya meminta nama, email, dan password)
  nim: z
    .string()
    .trim()
    .max(30, "NIM maksimal 30 karakter")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const loginSchema = z.object({
  email: z.string({ error: "Email dan password wajib diisi" }).trim().toLowerCase().min(1, "Email wajib diisi"),
  password: z.string({ error: "Email dan password wajib diisi" }).min(1, "Password wajib diisi"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string({ error: "Tautan reset tidak valid atau sudah kedaluwarsa" })
    .max(256, "Tautan reset tidak valid atau sudah kedaluwarsa"),
  password: newPassword,
});

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    emailNotifications: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.emailNotifications !== undefined, {
    message: "Tidak ada data yang diubah",
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: "Password saat ini wajib diisi" }).min(1, "Password saat ini wajib diisi"),
  newPassword,
});
