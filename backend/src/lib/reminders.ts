import { prisma } from "./prisma";
import { notifyUser } from "./notify";
import { formatJakarta } from "./time";
import { getEffectiveBookingRules } from "./rules";
import { lockRoom, promoteWaitingBookings } from "./booking";
import { recordViolation } from "./violations";
import { notifyAdmins, notifyRoomLecturers } from "./notify";
import { scheduleReminderJobs } from "./reminder-scheduler";
import { getQueuePositions, notifyChangedQueuePositions, notifyQueueExpired } from "./booking-queue-position";

const LEAD_MINUTES = Number(process.env.REMINDER_LEAD_MINUTES) || 60;
const INTERVAL_MS = 60_000;
export const scheduledReminderJobs = [
  sendDueReminders,
  markNoShowBookings,
  completeFinishedBookings,
  expireOldQueueEntries,
] as const;

/** Buat notifikasi pengingat untuk peminjaman APPROVED yang akan segera dimulai. */
export async function sendDueReminders(now = new Date()) {
  const until = new Date(now.getTime() + LEAD_MINUTES * 60_000);

  const due = await prisma.booking.findMany({
    where: {
      status: "APPROVED",
      reminderSentAt: null,
      startTime: { gt: now, lte: until },
    },
    select: { id: true, userId: true, title: true, startTime: true, room: { select: { name: true } } },
  });

  let sent = 0;
  for (const booking of due) {
    // "klaim" dulu agar tidak terkirim dua kali bila ada beberapa proses/interval tumpang tindih
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;

    await notifyUser(prisma, booking.userId, {
      bookingId: booking.id,
      type: "BOOKING_REMINDER",
      title: "Jadwal peminjaman segera dimulai",
      message: `"${booking.title}" di ${booking.room.name} dimulai ${formatJakarta(booking.startTime)} WIB.`,
    });
    sent += 1;
  }
  return sent;
}

/** Tutup booking baru yang tidak check-in setelah masa tenggang sebagai NO_SHOW. */
export async function markNoShowBookings(now = new Date(), bookingIds?: number[]) {
  const rules = await getEffectiveBookingRules();
  const cutoff = new Date(now.getTime() - rules.gracePeriodMinutes * 60_000);
  const due = await prisma.booking.findMany({
    where: {
      id: bookingIds ? { in: bookingIds } : undefined,
      status: "APPROVED",
      attendanceRequired: true,
      checkedInAt: null,
      startTime: { lte: cutoff },
    },
    select: { id: true, userId: true, roomId: true, title: true, startTime: true, room: { select: { name: true } } },
    take: 200,
  });
  let marked = 0;
  for (const booking of due) {
    const changed = await prisma.$transaction(async (tx) => {
      await lockRoom(tx, booking.roomId);
      const current = await tx.booking.findUnique({ where: { id: booking.id } });
      if (!current || current.status !== "APPROVED" || current.checkedInAt || current.startTime.getTime() + rules.gracePeriodMinutes * 60_000 > now.getTime()) return false;
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "NO_SHOW",
          logs: { create: { userId: booking.userId, action: "NO_SHOW", note: `Tidak check-in dalam ${rules.gracePeriodMinutes} menit setelah waktu mulai` } },
        },
      });
      await recordViolation(tx, {
        userId: booking.userId,
        bookingId: booking.id,
        type: "NO_SHOW",
        points: rules.noShowPoints,
        reason: `Tidak check-in pada peminjaman "${booking.title}" di ${booking.room.name}.`,
        now,
      }, rules);
      const notification = {
        bookingId: booking.id,
        type: "BOOKING_CANCELLED" as const,
        title: "Peminjaman berstatus no-show",
        message: `"${booking.title}" di ${booking.room.name} ditandai no-show karena tidak check-in dalam ${rules.gracePeriodMinutes} menit.`,
      };
      await Promise.all([notifyAdmins(tx, notification), notifyRoomLecturers(tx, booking.roomId, notification)]);
      await promoteWaitingBookings(tx, booking.roomId);
      return true;
    });
    if (changed) marked += 1;
  }
  return marked;
}

/** Tandai peminjaman yang sudah lewat sebagai COMPLETED dan catat overstay bila ada. */
export async function completeFinishedBookings(now = new Date(), bookingIds?: number[]) {
  const finished = await prisma.booking.findMany({
    where: {
      id: bookingIds ? { in: bookingIds } : undefined,
      status: "APPROVED",
      endTime: { lte: now },
      OR: [{ attendanceRequired: false }, { checkedInAt: { not: null } }],
    },
    select: { id: true, userId: true, reviewedBy: true, roomId: true, title: true, endTime: true, checkedInAt: true, checkedOutAt: true },
    take: 200,
  });
  const rules = await getEffectiveBookingRules();

  let done = 0;
  for (const b of finished) {
    const changed = await prisma.$transaction(async (tx) => {
      await lockRoom(tx, b.roomId);
      const current = await tx.booking.findUnique({ where: { id: b.id } });
      if (!current || current.status !== "APPROVED") return false;
      const overstayMinutes = current.checkedInAt && !current.checkedOutAt
        ? Math.max(0, Math.ceil((now.getTime() - current.endTime.getTime()) / 60_000))
        : 0;
      await tx.booking.update({
        where: { id: b.id },
        data: {
          status: "COMPLETED",
          overstayMinutes: current.checkedInAt ? overstayMinutes : current.overstayMinutes,
          logs: { create: { userId: b.reviewedBy ?? b.userId, action: "COMPLETED", note: overstayMinutes ? `Peminjaman selesai otomatis; check-out tidak tercatat, keterlambatan ${overstayMinutes} menit` : "Peminjaman selesai (otomatis)" } },
        },
      });
      if (overstayMinutes > 0) {
        await recordViolation(tx, {
          userId: b.userId,
          bookingId: b.id,
          type: "OVERSTAY",
          points: rules.overstayPoints,
          reason: `Check-out tidak tercatat setelah waktu selesai. Keterlambatan dihitung ${overstayMinutes} menit.`,
          now,
        }, rules);
      }
      return true;
    });
    if (changed) done += 1;
  }
  return done;
}

export async function expireOldQueueEntries(now = new Date()) {
  const rooms = await prisma.bookingQueue.groupBy({
    by: ["roomId"],
    where: { status: "WAITING", startTime: { lte: now } },
  });
  let expiredCount = 0;
  for (const { roomId } of rooms) {
    const expired = await prisma.$transaction(async (tx) => {
      await lockRoom(tx, roomId);
      const previousPositions = await getQueuePositions(tx, roomId);
      const entries = await tx.bookingQueue.findMany({
        where: { roomId, status: "WAITING", startTime: { lte: now } },
        include: { room: { select: { name: true } } },
      });
      for (const entry of entries) {
        await tx.bookingQueue.update({ where: { id: entry.id }, data: { status: "CANCELLED" } });
        await notifyQueueExpired(tx, {
          id: entry.id,
          userId: entry.userId,
          title: entry.title,
          roomName: entry.room.name,
        });
      }
      if (entries.length) {
        await notifyChangedQueuePositions(tx, roomId, previousPositions, entries[0].room.name);
      }
      return entries.length;
    });
    expiredCount += expired;
  }
  return expiredCount;
}

export function startReminderScheduler() {
  return scheduleReminderJobs(
    scheduledReminderJobs,
    INTERVAL_MS
  );
}

export function stopReminderScheduler(timer: ReturnType<typeof setInterval>) {
  clearInterval(timer);
}
