import type { Prisma, ViolationType } from "@prisma/client";
import type { BookingRules } from "./rules";
import { notifyUser } from "./notify";
import { formatJakarta } from "./time";

type ViolationDb = Prisma.TransactionClient;

export async function recordViolation(
  tx: ViolationDb,
  input: {
    userId: number;
    bookingId: number;
    type: ViolationType;
    points: number;
    reason: string;
    now?: Date;
  },
  rules: Pick<BookingRules, "suspendThreshold" | "suspendDays">
) {
  const now = input.now ?? new Date();
  const violation = await tx.violationPoint.create({
    data: {
      userId: input.userId,
      bookingId: input.bookingId,
      type: input.type,
      points: input.points,
      reason: input.reason,
    },
  });
  const [{ _sum }, user] = await Promise.all([
    tx.violationPoint.aggregate({ where: { userId: input.userId, waivedAt: null }, _sum: { points: true } }),
    tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { bookingBlockedUntil: true } }),
  ]);
  const totalPoints = _sum.points ?? 0;
  let blockedUntil: Date | null = user.bookingBlockedUntil;
  let newlyBlocked = false;
  if (totalPoints >= rules.suspendThreshold) {
    const base = blockedUntil && blockedUntil > now ? blockedUntil : now;
    blockedUntil = new Date(base.getTime() + rules.suspendDays * 86_400_000);
    await tx.user.update({ where: { id: input.userId }, data: { bookingBlockedUntil: blockedUntil } });
    newlyBlocked = true;
  }

  await notifyUser(tx, input.userId, {
    bookingId: input.bookingId,
    type: "VIOLATION_RECORDED",
    title: "Poin pelanggaran dicatat",
    message: `${input.reason} Poin: ${input.points}. Total poin aktif: ${totalPoints} dari ambang ${rules.suspendThreshold}.`,
  });
  if (newlyBlocked && blockedUntil) {
    await notifyUser(tx, input.userId, {
      bookingId: input.bookingId,
      type: "BOOKING_BLOCKED",
      title: "Peminjaman ditangguhkan",
      message: `Total poin aktif Anda mencapai ${totalPoints}. Anda tidak dapat mengajukan booking sampai ${formatJakarta(blockedUntil)} WIB.`,
    });
  } else if (rules.suspendThreshold - totalPoints <= 1 && totalPoints < rules.suspendThreshold) {
    await notifyUser(tx, input.userId, {
      bookingId: input.bookingId,
      type: "VIOLATION_RECORDED",
      title: "Peringatan poin pelanggaran",
      message: `Poin aktif Anda mendekati ambang penangguhan (${totalPoints}/${rules.suspendThreshold}).`,
    });
  }
  return { violation, totalPoints, blockedUntil };
}

export async function recalculateUserSanction(
  tx: ViolationDb,
  userId: number,
  bookingId: number,
  threshold: number
) {
  const [{ _sum }, user] = await Promise.all([
    tx.violationPoint.aggregate({ where: { userId, waivedAt: null }, _sum: { points: true } }),
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bookingBlockedUntil: true } }),
  ]);
  const totalPoints = _sum.points ?? 0;
  if (totalPoints < threshold && user.bookingBlockedUntil) {
    await tx.user.update({ where: { id: userId }, data: { bookingBlockedUntil: null } });
    await notifyUser(tx, userId, {
      bookingId,
      type: "BOOKING_UNBLOCKED",
      title: "Penangguhan peminjaman dicabut",
      message: "Poin pelanggaran Anda telah ditinjau dan penangguhan peminjaman dicabut.",
    });
  }
  return totalPoints;
}

export function calculateOverstayMinutes(endTime: Date, checkedOutAt: Date) {
  return Math.max(0, Math.ceil((checkedOutAt.getTime() - endTime.getTime()) / 60_000));
}
