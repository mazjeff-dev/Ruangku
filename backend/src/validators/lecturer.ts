import { z } from "zod";

const name = z.string().trim().min(2, "Nama minimal 2 karakter").max(100, "Nama maksimal 100 karakter");
const email = z.string().trim().toLowerCase().email("Format email tidak valid").max(150, "Email maksimal 150 karakter");

export const createLecturerSchema = z.object({
  name,
  email,
  password: z.string().min(8, "Password minimal 8 karakter").max(72, "Password maksimal 72 karakter"),
});

export const lecturerStatusSchema = z.object({
  isActive: z.boolean({ error: "isActive harus true atau false" }),
});

export const lecturerRoomsSchema = z.object({
  roomIds: z.array(z.coerce.number().int().min(1, "ID ruangan tidak valid")).max(300, "Maksimal 300 ruangan")
    .refine((ids) => new Set(ids).size === ids.length, "ID ruangan tidak boleh duplikat"),
});
