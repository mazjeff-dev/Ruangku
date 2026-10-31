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
  nim: z
    .string({ error: "NIM wajib diisi" })
    .trim()
    .min(3, "NIM minimal 3 karakter")
    .max(30, "NIM maksimal 30 karakter"),
});

export const loginSchema = z.object({
  email: z.string({ error: "Email dan password wajib diisi" }).trim().toLowerCase().min(1, "Email wajib diisi"),
  password: z.string({ error: "Email dan password wajib diisi" }).min(1, "Password wajib diisi"),
});

export const updateProfileSchema = z
  .object({ name: name.optional(), email: email.optional() })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: "Tidak ada data yang diubah",
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: "Password saat ini wajib diisi" }).min(1, "Password saat ini wajib diisi"),
  newPassword,
});
