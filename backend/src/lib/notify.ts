import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type NotifyInput = {
  bookingId?: number | null;
  type: NotificationType;
  title: string;
  message: string;
};

export async function notifyUser(db: Db, userId: number, input: NotifyInput) {
  return db.notification.create({
    data: {
      userId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
    },
  });
}

/** Kirim notifikasi ke seluruh admin yang aktif. */
export async function notifyAdmins(db: Db, input: NotifyInput) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      bookingId: input.bookingId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
    })),
  });
}
