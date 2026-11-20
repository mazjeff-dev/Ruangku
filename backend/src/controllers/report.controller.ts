import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthRequest } from "../middleware/auth.middleware";
import { HttpError } from "../lib/http";
import { csvCell } from "../lib/csv";
import { aggregateReport } from "../lib/report-aggregates";
import { DAY_MS, jakartaDateKey, parseJakartaDate, startOfJakartaMonth, startOfNextJakartaMonth } from "../lib/time";

function periodWhere(req: AuthRequest) {
  let from = startOfJakartaMonth();
  let toExclusive = startOfNextJakartaMonth();
  if (typeof req.query.from === "string" && req.query.from) {
    const d = parseJakartaDate(req.query.from);
    if (!d) throw new HttpError(400, "Format tanggal 'from' harus YYYY-MM-DD");
    from = d;
  }
  if (typeof req.query.to === "string" && req.query.to) {
    const d = parseJakartaDate(req.query.to);
    if (!d) throw new HttpError(400, "Format tanggal 'to' harus YYYY-MM-DD");
    toExclusive = new Date(d.getTime() + DAY_MS);
  }
  if (toExclusive <= from) throw new HttpError(400, "Tanggal akhir harus setelah tanggal awal");
  if ((toExclusive.getTime() - from.getTime()) / DAY_MS > 366) throw new HttpError(400, "Rentang maksimal 366 hari");
  const where: Prisma.BookingWhereInput = { startTime: { gte: from, lt: toExclusive } };
  return { from, toExclusive, where };
}

const hoursOf = (s: Date, e: Date) => (e.getTime() - s.getTime()) / 3_600_000;

/** GET /admin/reports?from=&to= — statistik peminjaman per periode (tanggal mulai, WIB). Agregasi di database. */
export async function getReports(req: AuthRequest, res: Response) {
  const { from, toExclusive } = periodWhere(req);
  const agg = await aggregateReport({
    from,
    toExclusive,
    lecturerId: req.user!.role === "DOSEN" ? req.user!.userId : undefined,
  });
  const byStatus = agg.byStatus;
  const decided = byStatus.APPROVED + byStatus.COMPLETED + byStatus.REJECTED;

  return res.status(200).json({
    success: true,
    message: "Laporan berhasil diambil",
    data: {
      period: { from: jakartaDateKey(from), to: jakartaDateKey(new Date(toExclusive.getTime() - DAY_MS)) },
      totals: {
        bookings: agg.totalBookings,
        attendees: agg.totalAttendees,
        ...Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k.toLowerCase(), v])),
        approvalRate: decided ? Math.round(((byStatus.APPROVED + byStatus.COMPLETED) / decided) * 100) : null,
        totalHours: agg.totalHours,
        activeStudents: agg.activeUsers,
      },
      topRooms: agg.topRooms,
      topStudents: agg.topStudents,
      byCategory: agg.byCategory,
      daily: agg.daily,
    },
  });
}

/** GET /admin/reports/export?from=&to= — unduh CSV daftar peminjaman pada periode. */
export async function exportReportCsv(req: AuthRequest, res: Response) {
  const { from, toExclusive, where } = periodWhere(req);
  if (req.user!.role === "DOSEN") {
    where.room = { lecturers: { some: { userId: req.user!.userId } } };
  }
  const rows = await prisma.booking.findMany({
    where,
    orderBy: { startTime: "asc" },
    take: 20000,
    select: {
      id: true, title: true, status: true, startTime: true, endTime: true, attendees: true, adminNote: true, createdAt: true,
      checkedInAt: true, checkedOutAt: true, overstayMinutes: true,
      violations: { where: { waivedAt: null }, select: { points: true } },
      room: { select: { name: true, code: true, category: true } },
      student: { select: { name: true, nim: true, email: true } },
    },
  });

  const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const header = ["ID", "Kegiatan", "Ruangan", "Kode", "Kategori", "Mahasiswa", "NIM", "Email", "Jumlah peserta", "Mulai (WIB)", "Selesai (WIB)", "Durasi (jam)", "Status", "Check-in (WIB)", "Check-out (WIB)", "Overstay (menit)", "Poin pelanggaran", "Catatan Admin", "Diajukan (WIB)"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.title, r.room.name, r.room.code, r.room.category, r.student.name, r.student.nim, r.student.email,
      r.attendees, wib(r.startTime), wib(r.endTime), (Math.round(hoursOf(r.startTime, r.endTime) * 10) / 10).toString().replace(".", ","),
      r.status, r.checkedInAt ? wib(r.checkedInAt) : "", r.checkedOutAt ? wib(r.checkedOutAt) : "", r.overstayMinutes,
      r.violations.reduce((t, v) => t + v.points, 0), r.adminNote, wib(r.createdAt),
    ].map(csvCell).join(","));
  }

  const name = `laporan-ruangku-${jakartaDateKey(from)}_${jakartaDateKey(new Date(toExclusive.getTime() - DAY_MS))}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  return res.status(200).send("\uFEFF" + lines.join("\r\n"));
}
