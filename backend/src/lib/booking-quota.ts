import type { Prisma } from "@prisma/client";
import type { BookingRules } from "./rules";
import { HttpError } from "./http";
import { formatJakarta } from "./time";

type QuotaDb = Pick<Prisma.TransactionClient, "booking" | "bookingQueue" | "$queryRaw">;

export async function lockUserQuota(tx: QuotaDb, userId: number) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
}

export async function assertBookingNotBlocked(
  tx: Pick<Prisma.TransactionClient, "user">,
  userId: number,
  now = new Date()
) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { bookingBlockedUntil: true },
  });
  if (user.bookingBlockedUntil && user.bookingBlockedUntil > now) {
    throw new HttpError(403, `Akun Anda ditangguhkan dari peminjaman sampai ${formatJakarta(user.bookingBlockedUntil)} WIB.`);
  }
}

export async function getUserBookingQuota(
  db: Pick<Prisma.TransactionClient, "booking" | "bookingQueue">,
  userId: number,
  rules: Pick<BookingRules, "maxActiveBookings" | "maxQueueEntries">,
  now = new Date()
) {
  const [activeBookings, activeQueueEntries] = await Promise.all([
    db.booking.count({
      where: { userId, status: { in: ["PENDING", "APPROVED"] }, endTime: { gt: now } },
    }),
    db.bookingQueue.count({
      where: { userId, status: "WAITING", endTime: { gt: now } },
    }),
  ]);
  return {
    activeBookings,
    maxActiveBookings: rules.maxActiveBookings,
    remainingBookings: Math.max(0, rules.maxActiveBookings - activeBookings),
    activeQueueEntries,
    maxQueueEntries: rules.maxQueueEntries,
    remainingQueueEntries: Math.max(0, rules.maxQueueEntries - activeQueueEntries),
  };
}

export function assertBookingQuota(
  quota: Awaited<ReturnType<typeof getUserBookingQuota>>
) {
  if (quota.activeBookings >= quota.maxActiveBookings) {
    throw new HttpError(
      409,
      `Anda sudah memiliki ${quota.maxActiveBookings} peminjaman aktif. Selesaikan atau batalkan salah satu.`
    );
  }
}

export function assertQueueQuota(
  quota: Awaited<ReturnType<typeof getUserBookingQuota>>
) {
  if (quota.activeQueueEntries >= quota.maxQueueEntries) {
    throw new HttpError(
      409,
      `Anda sudah memiliki ${quota.maxQueueEntries} entri antrean aktif. Batalkan salah satu sebelum bergabung lagi.`
    );
  }
}
