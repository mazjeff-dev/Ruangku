import { z } from "zod";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .optional()
    .nullable()
    // undefined tetap undefined (field tidak diubah); string kosong -> null (hapus isi)
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const roomBaseSchema = z.object({
  name: z.string({ error: "Nama ruangan wajib diisi" }).trim().min(2, "Nama ruangan minimal 2 karakter").max(100, "Nama maksimal 100 karakter"),
  code: z
    .string({ error: "Kode ruangan wajib diisi" })
    .trim()
    .toUpperCase()
    .min(2, "Kode minimal 2 karakter")
    .max(30, "Kode maksimal 30 karakter")
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "Kode hanya boleh huruf, angka, titik, strip, atau garis bawah"),
  location: z.string({ error: "Lokasi wajib diisi" }).trim().min(2, "Lokasi minimal 2 karakter").max(150, "Lokasi maksimal 150 karakter"),
  capacity: z.coerce.number({ error: "Kapasitas wajib diisi" }).int("Kapasitas harus bilangan bulat").min(1, "Kapasitas minimal 1").max(5000, "Kapasitas maksimal 5000"),
  description: optionalText(2000, "Deskripsi"),
  facilities: optionalText(1000, "Fasilitas"),
  isActive: z.boolean({ error: "isActive harus true atau false" }),
  isAvailable: z.boolean({ error: "isAvailable harus true atau false" }),
});

// Saat membuat ruangan, status aktif/tersedia default true.
export const createRoomSchema = roomBaseSchema.extend({
  isActive: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
});

// Saat mengubah, hanya field yang dikirim yang berubah (tanpa default).
export const updateRoomSchema = roomBaseSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Tidak ada data yang diubah",
  });
