import { prisma } from "./prisma";
import { notifyUser } from "./notify";
import { formatJakarta } from "./time";

const LEAD_MINUTES = Number(process.env.REMINDER_LEAD_MINUTES) || 60;
const INTERVAL_MS = 60_000;

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

export function startReminderScheduler() {
  const run = () =>
    sendDueReminders().catch((error) => console.error("Reminder error:", error));
  run();
  return setInterval(run, INTERVAL_MS).unref();
}
