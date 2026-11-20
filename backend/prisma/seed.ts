import "dotenv/config";
import type { User } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

const DAY = 86_400_000;

function wib(offset: number, hour: number, minute = 0) {
  const nowWib = new Date(Date.now() + 7 * 3_600_000);
  const base = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate());
  return new Date(base + offset * DAY + (hour * 60 + minute) * 60_000 - 7 * 3_600_000);
}

async function ensureUser(name: string, email: string, password: string, role: User["role"], nim?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (existing.role !== role) {
      throw new Error(`Email seed ${normalizedEmail} sudah digunakan dengan role berbeda; data tidak diubah.`);
    }
    return existing;
  }
  return prisma.user.create({
    data: { name, email: normalizedEmail, password: await hashPassword(password), role, nim: nim ?? null },
  });
}

const ROOMS = [
  { code: "SEM-01", name: "Ruang Seminar", category: "Seminar", location: "Gedung Rektorat Lt. 2", capacity: 80,
    facilities: "Proyektor, Sound System, AC, Mikrofon, Whiteboard", description: "Ruang seminar dengan kursi bergaya teater, cocok untuk seminar proposal, sidang terbuka, dan kuliah tamu." },
  { code: "LAB-01", name: "Laboratorium Komputer", category: "Laboratorium", location: "Gedung Teknik Lt. 3", capacity: 40,
    facilities: "40 PC, Proyektor, AC, Wi-Fi, Stopkontak di tiap meja", description: "Laboratorium komputer untuk praktikum, pelatihan, dan ujian berbasis komputer." },
  { code: "RPT-01", name: "Ruang Rapat", category: "Rapat", location: "Gedung Rektorat Lt. 1", capacity: 20,
    facilities: "TV 65 inci, Video Conference, AC, Whiteboard, Wi-Fi", description: "Ruang rapat untuk organisasi mahasiswa dan koordinasi dosen." },
  { code: "DSK-01", name: "Ruang Diskusi", category: "Diskusi", location: "Perpustakaan Lt. 2", capacity: 10,
    facilities: "Whiteboard, AC, Wi-Fi, Stopkontak", description: "Ruang diskusi kecil yang tenang untuk kerja kelompok dan belajar bersama." },
  { code: "AUD-01", name: "Auditorium", category: "Auditorium", location: "Gedung Serbaguna", capacity: 300,
    facilities: "Panggung, Sound System, Proyektor, AC, Lighting, Ruang Ganti", description: "Auditorium utama untuk wisuda, seminar nasional, dan pertunjukan kampus." },
];

type DemoBooking = {
  user: Pick<User, "id" | "name">;
  code: string;
  title: string;
  purpose: string;
  start: Date;
  end: Date;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  note?: string;
};

async function seedDemo(admin: User) {
  const studentPassword = process.env.SEED_DEMO_STUDENT_PASSWORD!;
  const lecturerPassword = process.env.SEED_DEMO_LECTURER_PASSWORD!;
  const leadershipPassword = process.env.SEED_DEMO_LEADERSHIP_PASSWORD!;
  const demo = await ensureUser("Mahasiswa Demo", "mahasiswa@ruangku.test", studentPassword, "STUDENT", "2024520099");
  const sinta = await ensureUser("Sinta Maharani", "sinta@ruangku.test", studentPassword, "STUDENT", "2024520101");
  const bagas = await ensureUser("Bagas Pratama", "bagas@ruangku.test", studentPassword, "STUDENT", "2024520102");
  const lecturer = await ensureUser("Dosen Demo", "dosen@ruangku.test", lecturerPassword, "DOSEN");
  await ensureUser("Pimpinan Demo", "pimpinan@ruangku.test", leadershipPassword, "PIMPINAN");

  const rooms: Record<string, number> = {};
  for (const room of ROOMS) {
    const saved = await prisma.room.upsert({ where: { code: room.code }, update: {}, create: room });
    rooms[room.code] = saved.id;
  }

  for (const code of ["RPT-01", "SEM-01"]) {
    await prisma.roomLecturer.upsert({
      where: { roomId_userId: { roomId: rooms[code], userId: lecturer.id } },
      update: {},
      create: { roomId: rooms[code], userId: lecturer.id },
    });
  }

  const seededUserIds = [demo.id, sinta.id, bagas.id];
  if (await prisma.booking.count({ where: { userId: { in: seededUserIds } } })) {
    console.log("Booking demo dilewati (akun demo sudah memiliki booking).");
    return;
  }

  const bookings: DemoBooking[] = [
    { user: demo, code: "LAB-01", title: "Praktikum Pemrograman Web", purpose: "Praktikum kelompok proyek akhir.", start: wib(-5, 9), end: wib(-5, 11), status: "COMPLETED" },
    { user: sinta, code: "SEM-01", title: "Seminar Proposal Skripsi", purpose: "Seminar proposal skripsi mahasiswa.", start: wib(-3, 13), end: wib(-3, 15), status: "COMPLETED" },
    { user: demo, code: "RPT-01", title: "Rapat Himpunan Mahasiswa", purpose: "Rapat persiapan kegiatan.", start: wib(-2, 16), end: wib(-2, 17), status: "CANCELLED", note: "Dibatalkan oleh mahasiswa" },
    { user: demo, code: "AUD-01", title: "Gladi Resik Wisuda", purpose: "Gladi resik acara wisuda.", start: wib(-1, 8), end: wib(-1, 12), status: "REJECTED", note: "Auditorium dipakai untuk kegiatan rektorat." },
    { user: bagas, code: "RPT-01", title: "Rapat Koordinasi BEM", purpose: "Koordinasi program kerja semester ganjil.", start: wib(1, 10), end: wib(1, 12), status: "APPROVED", note: "Silakan digunakan." },
    { user: sinta, code: "AUD-01", title: "Seminar Nasional Teknologi", purpose: "Seminar nasional dengan pembicara tamu.", start: wib(2, 13), end: wib(2, 16), status: "APPROVED", note: "Disetujui, koordinasi dengan bagian umum." },
    { user: demo, code: "DSK-01", title: "Diskusi Kelompok Basis Data", purpose: "Diskusi tugas perancangan basis data.", start: wib(3, 9), end: wib(3, 11), status: "PENDING" },
    { user: sinta, code: "SEM-01", title: "Workshop UI/UX", purpose: "Workshop untuk anggota komunitas desain.", start: wib(1, 14), end: wib(1, 15, 30), status: "PENDING" },
    { user: bagas, code: "LAB-01", title: "Pelatihan Flutter", purpose: "Pelatihan pengembangan aplikasi mobile.", start: wib(4, 8), end: wib(4, 10), status: "PENDING" },
    { user: demo, code: "RPT-01", title: "Konsultasi Dosen Pembimbing", purpose: "Konsultasi progres tugas akhir.", start: wib(5, 13), end: wib(5, 14), status: "APPROVED", note: "Disetujui." },
  ];

  await prisma.$transaction(async (tx) => {
    for (const item of bookings) {
      const reviewed = item.status !== "PENDING" && item.status !== "CANCELLED";
      const booking = await tx.booking.create({
        data: {
          userId: item.user.id,
          roomId: rooms[item.code],
          title: item.title,
          purpose: item.purpose,
          startTime: item.start,
          endTime: item.end,
          status: item.status,
          adminNote: item.note ?? null,
          reviewedBy: reviewed ? admin.id : null,
          reviewedAt: reviewed ? new Date() : null,
        },
      });
      const logs = [{ userId: item.user.id, action: "CREATED", note: "Pengajuan peminjaman dibuat" }];
      if (item.status === "APPROVED" || item.status === "COMPLETED") {
        logs.push({ userId: admin.id, action: "APPROVED", note: item.note ?? "Pengajuan disetujui" });
      }
      if (item.status === "COMPLETED") {
        logs.push({ userId: admin.id, action: "COMPLETED", note: "Peminjaman selesai (otomatis)" });
      }
      if (item.status === "REJECTED") {
        logs.push({ userId: admin.id, action: "REJECTED", note: item.note ?? "Pengajuan ditolak" });
      }
      if (item.status === "CANCELLED") {
        logs.push({ userId: item.user.id, action: "CANCELLED", note: "Pengajuan dibatalkan oleh mahasiswa" });
      }
      await tx.bookingLog.createMany({ data: logs.map((log) => ({ ...log, bookingId: booking.id })) });

      if (item.status === "APPROVED" || item.status === "REJECTED") {
        await tx.notification.create({
          data: {
            userId: item.user.id,
            bookingId: booking.id,
            type: item.status === "APPROVED" ? "BOOKING_APPROVED" : "BOOKING_REJECTED",
            title: item.status === "APPROVED" ? "Peminjaman disetujui" : "Peminjaman ditolak",
            message: item.status === "APPROVED" ? `"${item.title}" telah disetujui.` : `"${item.title}" ditolak. Alasan: ${item.note}`,
          },
        });
      }
      if (item.status === "PENDING") {
        await tx.notification.create({
          data: {
            userId: admin.id,
            bookingId: booking.id,
            type: "BOOKING_SUBMITTED",
            title: "Pengajuan peminjaman baru",
            message: `${item.user.name} mengajukan "${item.title}".`,
          },
        });
      }
    }
  });
  console.log("Data demo selesai dibuat: 3 mahasiswa, 1 dosen, 5 ruangan, penugasan, dan 10 booking.");
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error("SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD harus diisi bersama-sama.");
  }

  const demoSetting = (process.env.SEED_DEMO ?? "false").trim().toLowerCase();
  if (demoSetting !== "true" && demoSetting !== "false") {
    throw new Error("SEED_DEMO harus bernilai true atau false.");
  }
  const demoEnabled = demoSetting === "true";
  if (demoEnabled && (!adminEmail || !adminPassword)) {
    throw new Error("Isi SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD sebelum mengaktifkan SEED_DEMO.");
  }
  if (demoEnabled && (!process.env.SEED_DEMO_STUDENT_PASSWORD || !process.env.SEED_DEMO_LECTURER_PASSWORD || !process.env.SEED_DEMO_LEADERSHIP_PASSWORD)) {
    throw new Error("Isi SEED_DEMO_STUDENT_PASSWORD, SEED_DEMO_LECTURER_PASSWORD, dan SEED_DEMO_LEADERSHIP_PASSWORD saat SEED_DEMO=true.");
  }
  for (const [label, password] of [
    ["SEED_ADMIN_PASSWORD", adminPassword],
    ["SEED_DEMO_STUDENT_PASSWORD", process.env.SEED_DEMO_STUDENT_PASSWORD],
    ["SEED_DEMO_LECTURER_PASSWORD", process.env.SEED_DEMO_LECTURER_PASSWORD],
    ["SEED_DEMO_LEADERSHIP_PASSWORD", process.env.SEED_DEMO_LEADERSHIP_PASSWORD],
  ] as const) {
    if (password && (password.length < 8 || Buffer.byteLength(password, "utf8") > 72)) {
      throw new Error(`${label} harus berisi 8–72 byte.`);
    }
  }

  let admin: User | undefined;
  if (adminEmail && adminPassword) {
    admin = await ensureUser("Administrator RuangKu", adminEmail, adminPassword, "ADMIN");
    console.log(`Akun admin seed tersedia: ${admin.email} (data akun yang sudah ada tidak diubah).`);
  } else {
    console.log("Akun admin dilewati; atur SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD untuk membuatnya.");
  }

  if (demoEnabled) {
    if (!admin) throw new Error("Akun admin seed diperlukan untuk membuat data demo.");
    await seedDemo(admin);
  } else {
    console.log("Seed demo dilewati; atur SEED_DEMO=true untuk membuat data demo.");
  }
}

main()
  .catch((error: unknown) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
