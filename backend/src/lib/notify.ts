import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendNotificationEmail } from "./mailer";

type Db = Prisma.TransactionClient | typeof prisma;

export type NotifyInput = {
  bookingId?: number | null;
  type: NotificationType;
  title: string;
  message: string;
};

function deliverEmail(email: string, input: NotifyInput) {
  void sendNotificationEmail(email, input.title, input.message).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : "Kesalahan tidak diketahui";
    console.error(`Gagal mengirim notifikasi email RuangKu: ${detail}`);
  });
}

export async function notifyUser(db: Db, userId: number, input: NotifyInput) {
  const [notification, user] = await Promise.all([
    db.notification.create({
    data: {
      userId,
      bookingId: input.bookingId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
    },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { email: true, isActive: true, emailNotifications: true },
    }),
  ]);
  if (user?.isActive && user.emailNotifications) deliverEmail(user.email, input);
  return notification;
}

/** Kirim notifikasi ke seluruh admin yang aktif. */
export async function notifyAdmins(db: Db, input: NotifyInput) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, email: true, emailNotifications: true },
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
  for (const admin of admins) {
    if (admin.emailNotifications) deliverEmail(admin.email, input);
  }
}

/** Notify only active lecturers assigned to the room, in addition to admins. */
export async function notifyRoomLecturers(db: Db, roomId: number, input: NotifyInput) {
  const lecturers = await db.user.findMany({
    where: { role: "DOSEN", isActive: true, lecturerRooms: { some: { roomId } } },
    select: { id: true, email: true, emailNotifications: true },
  });
  if (lecturers.length === 0) return;
  await db.notification.createMany({
    data: lecturers.map((lecturer) => ({
      userId: lecturer.id,
      bookingId: input.bookingId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
    })),
  });
  for (const lecturer of lecturers) {
    if (lecturer.emailNotifications) deliverEmail(lecturer.email, input);
  }
}
