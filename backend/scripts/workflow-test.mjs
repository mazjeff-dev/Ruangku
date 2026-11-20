import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { markNoShowBookings, completeFinishedBookings, expireOldQueueEntries } from "../src/lib/reminders.ts";

const prisma = new PrismaClient();
const API = process.env.API_URL || "http://localhost:3000/api/v1";
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const hasAdminCredentials = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
const hasPartialAdminCredentials = Boolean(process.env.ADMIN_EMAIL) !== Boolean(process.env.ADMIN_PASSWORD);
const adminEmail = process.env.ADMIN_EMAIL || `workflow-admin-${run}@test.local`;
const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(32).toString("base64url");
const adminFixtureEmail = hasAdminCredentials ? null : adminEmail;
const lecturerEmail = `workflow-lecturer-${run}@test.local`;
const lecturerPassword = randomBytes(24).toString("base64url");
const studentAEmail = `workflow-student-a-${run}@test.local`;
const studentBEmail = `workflow-student-b-${run}@test.local`;
const leadershipEmail = `workflow-leadership-${run}@test.local`;
const leadershipPassword = randomBytes(24).toString("base64url");
const studentAPassword = randomBytes(24).toString("base64url");
const studentBPassword = randomBytes(24).toString("base64url");
const roomCodes = [`WF-${run}-A`, `WF-${run}-B`];
let originalRuleSetting;
let originalRules;

if (hasPartialAdminCredentials) {
  console.error("ADMIN_EMAIL dan ADMIN_PASSWORD harus diatur bersama-sama atau keduanya dikosongkan.");
  process.exit(2);
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

function expectStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.json)}`);
}

function getRegisteredNonGetRoutes() {
  const mounts = {
    "auth.routes.ts": "/auth",
    "user.routes.ts": "/users",
    "room.routes.ts": "/rooms",
    "booking.routes.ts": "/bookings",
    "notification.routes.ts": "/notifications",
    "student.routes.ts": "/students",
    "lecturer.routes.ts": "/lecturer",
    "admin.routes.ts": "/admin",
    "leadership.routes.ts": "/leadership",
  };
  const routeDirectory = new URL("../src/routes/", import.meta.url);
  const routes = [];
  for (const [file, mount] of Object.entries(mounts)) {
    const source = fs.readFileSync(new URL(file, routeDirectory), "utf8");
    const expression = /router\.(post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(expression)) {
      routes.push({ method: match[1].toUpperCase(), path: `${mount}${match[2]}`.replace(/:[^/]+/g, "1") });
    }
  }
  assert.ok(routes.length > 0, "route test finds registered non-GET endpoints");
  return routes;
}

function nextOpenSlot(daysAhead = 1) {
  const jakartaNow = new Date(Date.now() + 7 * 3_600_000);
  for (let dayOffset = daysAhead; dayOffset <= daysAhead + 7; dayOffset += 1) {
    const date = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate() + dayOffset));
    if (date.getUTCDay() === 0) continue;
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 5));
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() };
  }
  throw new Error("Tidak dapat menentukan jadwal hari operasional untuk workflow test");
}

async function updateRules(token, patch) {
  originalRules = { ...originalRules, ...patch };
  const result = await call("PUT", "/admin/settings/booking-rules", { token, body: originalRules });
  expectStatus(result, 200, "perbarui aturan uji");
}

async function cleanup() {
  if (originalRuleSetting) {
    const { id, ...data } = originalRuleSetting;
    await prisma.bookingRuleSetting.upsert({
      where: { id },
      create: originalRuleSetting,
      update: data,
    });
  } else if (originalRules) {
    await prisma.bookingRuleSetting.deleteMany({ where: { id: 1 } });
  }

  const users = await prisma.user.findMany({
    where: { email: { in: [adminFixtureEmail, lecturerEmail, studentAEmail, studentBEmail, leadershipEmail].filter(Boolean) } },
    select: { id: true },
  });
  const rooms = await prisma.room.findMany({ where: { code: { in: roomCodes } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const roomIds = rooms.map((room) => room.id);
  const bookings = await prisma.booking.findMany({
    where: { OR: [{ userId: { in: userIds } }, { roomId: { in: roomIds } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((booking) => booking.id);
  if (!userIds.length && !roomIds.length && !bookingIds.length) return;

  await prisma.$transaction(async (tx) => {
    await tx.bookingExtension.deleteMany({
      where: { OR: [{ bookingId: { in: bookingIds } }, { requestedBy: { in: userIds } }, { reviewedBy: { in: userIds } }] },
    });
    await tx.bookingQueue.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { roomId: { in: roomIds } }, { promotedBookingId: { in: bookingIds } }] } });
    await tx.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { bookingId: { in: bookingIds } }] } });
    await tx.bookingLog.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { userId: { in: userIds } }] } });
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await tx.roomLecturer.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { roomId: { in: roomIds } }] } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.room.deleteMany({ where: { id: { in: roomIds } } });
  });
  const [remainingUsers, remainingRooms] = await Promise.all([
    prisma.user.count({ where: { email: { in: [adminFixtureEmail, lecturerEmail, studentAEmail, studentBEmail, leadershipEmail].filter(Boolean) } } }),
    prisma.room.count({ where: { code: { in: roomCodes } } }),
  ]);
  assert.equal(remainingUsers, 0, "akun fixture dibersihkan");
  assert.equal(remainingRooms, 0, "ruangan fixture dibersihkan");
}

try {
  if (!hasAdminCredentials) {
    await prisma.user.create({
      data: {
        name: "Administrator Uji Workflow",
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 12),
        role: "ADMIN",
      },
    });
  }
  const adminLogin = await call("POST", "/auth/login", { body: { email: adminEmail, password: adminPassword } });
  expectStatus(adminLogin, 200, "login admin");
  assert.equal(adminLogin.json.data.user.role, "ADMIN", "login admin mengembalikan role ADMIN");
  const adminToken = adminLogin.json.data.token;
  const createdLeadership = await call("POST", "/admin/leaders", {
    token: adminToken,
    body: { name: "Pimpinan Uji Workflow", email: leadershipEmail, password: leadershipPassword },
  });
  expectStatus(createdLeadership, 201, "admin membuat akun PIMPINAN");
  assert.equal(createdLeadership.json.data.role, "PIMPINAN", "akun baru memiliki role PIMPINAN");
  expectStatus(await call("POST", "/admin/leaders", {
    token: adminToken,
    body: { name: "Pimpinan Uji Duplikat", email: leadershipEmail, password: leadershipPassword },
  }), 409, "email PIMPINAN duplikat ditolak");
  const ruleSettings = await call("GET", "/admin/settings/booking-rules", { token: adminToken });
  expectStatus(ruleSettings, 200, "admin membaca aturan peminjaman");
  assert.ok(ruleSettings.json.data.rules.minMinutes > 0, "aturan durasi minimum tersedia");
  const baselineRules = { ...ruleSettings.json.data.rules };
  originalRules = { ...baselineRules };
  originalRuleSetting = await prisma.bookingRuleSetting.findUnique({ where: { id: 1 } });

  const createdLecturer = await call("POST", "/admin/lecturers", {
    token: adminToken,
    body: { name: "Dosen Uji Workflow", email: lecturerEmail, password: lecturerPassword },
  });
  expectStatus(createdLecturer, 201, "buat dosen");

  const createdRooms = [];
  for (const [index, code] of roomCodes.entries()) {
    const result = await call("POST", "/admin/rooms", {
      token: adminToken,
      body: { name: `Ruangan Workflow ${index}`, code, location: "Gedung Uji", capacity: 20 },
    });
    expectStatus(result, 201, "buat ruangan");
    createdRooms.push(result.json.data);
  }
  const assignedRoom = createdRooms[0];
  const unassignedRoom = createdRooms[1];
  expectStatus(await call("PUT", `/admin/lecturers/${createdLecturer.json.data.id}/rooms`, {
    token: adminToken,
    body: { roomIds: [assignedRoom.id] },
  }), 200, "tetapkan ruangan dosen");

  for (const [index, email] of [studentAEmail, studentBEmail].entries()) {
    expectStatus(await call("POST", "/auth/register", {
      body: {
        name: `Mahasiswa Workflow ${index}`,
        email,
        password: index === 0 ? studentAPassword : studentBPassword,
        nim: `WF${run}${index}`,
      },
    }), 201, "buat mahasiswa uji");
  }
  const [studentALogin, studentBLogin, lecturerLogin, leadershipLogin] = await Promise.all([
    call("POST", "/auth/login", { body: { email: studentAEmail, password: studentAPassword } }),
    call("POST", "/auth/login", { body: { email: studentBEmail, password: studentBPassword } }),
    call("POST", "/auth/login", { body: { email: lecturerEmail, password: lecturerPassword } }),
    call("POST", "/auth/login", { body: { email: leadershipEmail, password: leadershipPassword } }),
  ]);
  expectStatus(studentALogin, 200, "login mahasiswa A");
  expectStatus(studentBLogin, 200, "login mahasiswa B");
  expectStatus(lecturerLogin, 200, "login dosen");
  expectStatus(leadershipLogin, 200, "login PIMPINAN");
  assert.equal(studentALogin.json.data.user.role, "STUDENT", "login mahasiswa mengembalikan role STUDENT");
  assert.equal(lecturerLogin.json.data.user.role, "DOSEN", "login dosen mengembalikan role DOSEN");
  assert.equal(leadershipLogin.json.data.user.role, "PIMPINAN", "login PIMPINAN mengembalikan role PIMPINAN");
  const studentAToken = studentALogin.json.data.token;
  const studentBToken = studentBLogin.json.data.token;
  const lecturerToken = lecturerLogin.json.data.token;
  const leadershipToken = leadershipLogin.json.data.token;

  const analyticsBooking = await call("POST", "/bookings", {
    token: lecturerToken,
    body: { roomId: assignedRoom.id, title: "Booking Dosen untuk Analitik", purpose: "Uji agregasi pengguna dosen", attendees: 2, ...nextOpenSlot(7) },
  });
  expectStatus(analyticsBooking, 201, "buat aktivitas dosen untuk analitik dashboard");
  const jakartaNow = new Date(Date.now() + 7 * 3_600_000);
  const analyticsStart = new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), 1, 5));
  await prisma.booking.update({
    where: { id: analyticsBooking.json.data.id },
    data: { startTime: analyticsStart, endTime: new Date(analyticsStart.getTime() + 60 * 60_000), status: "COMPLETED" },
  });

  const overview = await call("GET", "/leadership/overview", { token: leadershipToken });
  expectStatus(overview, 200, "PIMPINAN membaca dasbor pengadaan");
  for (const field of ["occupancy", "underusedRooms", "frequentlyFullRooms", "peakHours", "capacityRatios", "topUsers", "topStudents", "attendance", "recommendations"]) {
    assert.ok(field in overview.json.data, `overview menyertakan ${field}`);
  }
  assert.ok(overview.json.data.topUsers.some((user) => user.role === "STUDENT"), "topUsers memuat mahasiswa");
  assert.ok(overview.json.data.topUsers.some((user) => user.role === "DOSEN"), "topUsers memuat dosen");
  assert.equal(overview.json.data.topStudents.every((user) => !("role" in user)), true, "topStudents tetap berisi bentuk kompatibel");
  const filteredOverview = await call("GET", "/leadership/overview?lowUsageThreshold=15&highOccupancyThreshold=75&minimumDemand=2", { token: leadershipToken });
  expectStatus(filteredOverview, 200, "ambang dasbor dapat diatur");
  assert.deepEqual(filteredOverview.json.data.thresholds, { lowUsagePercent: 15, highOccupancyPercent: 75, minimumConflictDemand: 2 }, "filter ambang tercermin pada data");
  expectStatus(await call("GET", "/leadership/overview?lowUsageThreshold=101", { token: leadershipToken }), 400, "ambang tidak valid ditolak");
  const exportResult = await call("GET", "/leadership/overview/export", { token: leadershipToken });
  expectStatus(exportResult, 200, "PIMPINAN mengekspor dasbor CSV");
  assert.ok(exportResult.json === null, "ekspor mengembalikan CSV, bukan JSON");

  for (const route of getRegisteredNonGetRoutes()) {
    const result = await call(route.method, route.path, { token: leadershipToken, body: {} });
    expectStatus(result, 403, `PIMPINAN ditolak untuk ${route.method} ${route.path}`);
  }
  expectStatus(await call("GET", "/leadership/overview", { token: studentALogin.json.data.token }), 403, "mahasiswa tidak dapat mengakses dasbor PIMPINAN");
  expectStatus(await call("GET", "/leadership/overview", { token: lecturerToken }), 403, "dosen tidak dapat mengakses dasbor PIMPINAN");
  expectStatus(await call("GET", "/leadership/overview", { token: adminToken }), 200, "admin dapat membaca dasbor pengadaan (hanya-baca)");

  await updateRules(adminToken, { maxActiveBookings: 1 });
  const quotaSlotA = nextOpenSlot(1);
  const quotaSlotB = nextOpenSlot(2);
  const concurrentQuota = await Promise.all([
    call("POST", "/bookings", {
      token: studentBToken,
      body: { roomId: assignedRoom.id, title: "Kuota serentak A", purpose: "Uji batas booking aktif", attendees: 2, startTime: quotaSlotA.startTime, endTime: quotaSlotA.endTime },
    }),
    call("POST", "/bookings", {
      token: studentBToken,
      body: { roomId: unassignedRoom.id, title: "Kuota serentak B", purpose: "Uji batas booking aktif", attendees: 2, startTime: quotaSlotB.startTime, endTime: quotaSlotB.endTime },
    }),
  ]);
  assert.deepEqual(concurrentQuota.map((result) => result.status).sort(), [201, 409], "dua permintaan serentak hanya mengizinkan satu booking aktif");
  const concurrentWinner = concurrentQuota.find((result) => result.status === 201);
  const quotaSlotC = nextOpenSlot(3);
  expectStatus(await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: assignedRoom.id, title: "Kuota melewati batas", purpose: "Uji batas booking aktif", attendees: 2, startTime: quotaSlotC.startTime, endTime: quotaSlotC.endTime },
  }), 409, "booking melewati batas aktif ditolak");
  expectStatus(await call("PATCH", `/bookings/${concurrentWinner.json.data.id}/cancel`, { token: studentBToken }), 200, "batalkan fixture uji kuota");
  await updateRules(adminToken, { maxActiveBookings: Math.max(baselineRules.maxActiveBookings, 3) });

  assert.equal((await call("GET", "/lecturer/rooms", { token: lecturerToken })).json.total, 1, "dosen melihat ruang tugas");
  expectStatus(await call("GET", "/students/bookings", { token: lecturerToken }), 200, "dosen dapat memakai fitur mahasiswa");
  expectStatus(await call("GET", "/admin/bookings", { token: lecturerToken }), 403, "dosen tidak dapat mengakses API admin");
  expectStatus(await call("GET", "/admin/bookings", { token: studentAToken }), 403, "mahasiswa tidak dapat mengakses API admin");
  expectStatus(await call("GET", "/lecturer/bookings", { token: studentAToken }), 403, "mahasiswa tidak dapat mengakses API dosen");

  await updateRules(adminToken, { suspendThreshold: 10, noShowPoints: 1, overstayPoints: 1 });
  const checkInSlot = nextOpenSlot(2);
  const checkInBooking = await call("POST", "/bookings", {
    token: studentAToken,
    body: { roomId: assignedRoom.id, title: "Uji check-in dan overstay", purpose: "Uji alur kehadiran", attendees: 2, startTime: checkInSlot.startTime, endTime: checkInSlot.endTime },
  });
  expectStatus(checkInBooking, 201, "buat booking untuk uji check-in");
  const checkInId = checkInBooking.json.data.id;
  expectStatus(await call("PATCH", `/admin/bookings/${checkInId}/review`, {
    token: adminToken,
    body: { status: "APPROVED" },
  }), 200, "setujui booking untuk uji check-in");
  expectStatus(await call("POST", `/bookings/${checkInId}/check-in`, { token: studentAToken, body: {} }), 400, "check-in di luar jendela ditolak");
  const checkInStart = new Date(Date.now() + 5 * 60_000);
  await prisma.booking.update({
    where: { id: checkInId },
    data: { startTime: checkInStart, endTime: new Date(checkInStart.getTime() + 60 * 60_000) },
  });
  expectStatus(await call("POST", `/bookings/${checkInId}/check-in`, { token: studentAToken, body: {} }), 200, "check-in di dalam jendela diterima");
  await prisma.booking.update({
    where: { id: checkInId },
    data: { endTime: new Date(Date.now() - 2 * 60_000) },
  });
  assert.equal(await completeFinishedBookings(new Date(), [checkInId]), 1, "scheduler menyelesaikan booking yang melewati waktu selesai");
  const overstayBooking = await prisma.booking.findUniqueOrThrow({ where: { id: checkInId } });
  assert.equal(overstayBooking.status, "COMPLETED", "booking overstay menjadi COMPLETED");
  assert.ok(overstayBooking.overstayMinutes >= 2, "durasi overstay tercatat");
  assert.ok(await prisma.violationPoint.findFirst({ where: { bookingId: checkInId, type: "OVERSTAY" } }), "overstay menghasilkan poin");

  await updateRules(adminToken, { suspendThreshold: 1 });
  const noShowSlot = nextOpenSlot(4);
  const noShowBooking = await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: assignedRoom.id, title: "Uji no-show", purpose: "Uji no-show dan promosi antrean", attendees: 2, startTime: noShowSlot.startTime, endTime: noShowSlot.endTime },
  });
  expectStatus(noShowBooking, 201, "buat booking untuk uji no-show");
  const noShowId = noShowBooking.json.data.id;
  expectStatus(await call("PATCH", `/admin/bookings/${noShowId}/review`, {
    token: adminToken,
    body: { status: "APPROVED" },
  }), 200, "setujui booking untuk uji no-show");
  const queued = await call("POST", "/bookings/waitlist", {
    token: studentAToken,
    body: { roomId: assignedRoom.id, title: "Antrean setelah no-show", purpose: "Uji promosi setelah no-show", attendees: 2, startTime: noShowSlot.startTime, endTime: noShowSlot.endTime },
  });
  expectStatus(queued, 201, "bergabung antrean untuk uji no-show");
  await prisma.booking.update({
    where: { id: noShowId },
    data: { startTime: new Date(Date.now() - 60 * 60_000), endTime: new Date(Date.now() - 30 * 60_000) },
  });
  assert.equal(await markNoShowBookings(new Date(), [noShowId]), 1, "scheduler menandai booking no-show");
  const noShowAfter = await prisma.booking.findUniqueOrThrow({ where: { id: noShowId } });
  assert.equal(noShowAfter.status, "NO_SHOW", "status booking berubah menjadi NO_SHOW");
  const promotedQueue = await prisma.bookingQueue.findUniqueOrThrow({ where: { id: queued.json.data.id } });
  assert.equal(promotedQueue.status, "PROMOTED", "no-show melepas slot dan memicu promosi antrean");
  assert.ok(promotedQueue.promotedBookingId, "booking hasil promosi antrean terbentuk");
  assert.ok(await prisma.notification.findFirst({
    where: {
      userId: studentALogin.json.data.user.id,
      bookingId: promotedQueue.promotedBookingId,
      type: "BOOKING_WAITLIST_PROMOTED",
    },
  }), "promosi antrean setelah no-show mengirim notifikasi");

  const noShowPoints = await prisma.violationPoint.findMany({ where: { bookingId: noShowId, type: "NO_SHOW" } });
  assert.equal(noShowPoints.length, 1, "no-show menghasilkan satu poin pelanggaran");
  const studentBId = studentBLogin.json.data.user.id;
  const blockedUser = await prisma.user.findUniqueOrThrow({ where: { id: studentBId } });
  assert.ok(blockedUser.bookingBlockedUntil > new Date(), "poin mencapai ambang dan menangguhkan booking");
  const blockedSlot = nextOpenSlot(5);
  expectStatus(await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: unassignedRoom.id, title: "Booking saat ditangguhkan", purpose: "Uji penangguhan", attendees: 2, startTime: blockedSlot.startTime, endTime: blockedSlot.endTime },
  }), 403, "booking ditolak selama penangguhan");
  await prisma.user.update({
    where: { id: studentBId },
    data: { bookingBlockedUntil: new Date(Date.now() - 1_000) },
  });
  const afterExpirySlot = nextOpenSlot(6);
  const afterExpiry = await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: unassignedRoom.id, title: "Booking setelah penangguhan", purpose: "Uji berakhirnya penangguhan", attendees: 2, startTime: afterExpirySlot.startTime, endTime: afterExpirySlot.endTime },
  });
  expectStatus(afterExpiry, 201, "booking diizinkan setelah masa penangguhan berakhir");
  expectStatus(await call("PATCH", `/bookings/${afterExpiry.json.data.id}/cancel`, { token: studentBToken }), 200, "bersihkan booking setelah penangguhan");

  expectStatus(await call("PATCH", `/admin/violations/${noShowPoints[0].id}/waive`, {
    token: adminToken,
    body: { note: "Pembatalan poin untuk uji workflow" },
  }), 200, "admin membatalkan poin no-show");
  const waivedUser = await prisma.user.findUniqueOrThrow({ where: { id: studentBId } });
  assert.equal(waivedUser.bookingBlockedUntil, null, "waive menghapus penangguhan setelah poin turun di bawah ambang");
  const violationNotifications = await prisma.notification.findMany({
    where: { userId: studentBId },
    select: { type: true },
  });
  assert.ok(violationNotifications.some((item) => item.type === "VIOLATION_RECORDED"), "notifikasi VIOLATION_RECORDED terkirim");
  assert.ok(violationNotifications.some((item) => item.type === "BOOKING_BLOCKED"), "notifikasi BOOKING_BLOCKED terkirim");
  assert.ok(violationNotifications.some((item) => item.type === "BOOKING_UNBLOCKED"), "notifikasi BOOKING_UNBLOCKED terkirim setelah waive");

  const firstSlot = nextOpenSlot(1);
  const start = firstSlot.startTime;
  const end = firstSlot.endTime;
  const booking = await call("POST", "/bookings", {
    token: studentAToken,
    body: { roomId: assignedRoom.id, title: "Booking Workflow", purpose: "Uji persetujuan", attendees: 2, startTime: start, endTime: end },
  });
  expectStatus(booking, 201, "buat booking");
  const bookingId = booking.json.data.id;
  const outsiderReview = await call("PATCH", `/lecturer/bookings/${bookingId}/review`, {
    token: lecturerToken,
    body: { status: "APPROVED" },
  });
  expectStatus(outsiderReview, 200, "dosen yang ditugaskan dapat menyetujui");

  const lecturerOwnBooking = await call("POST", "/bookings", {
    token: lecturerToken,
    body: { roomId: assignedRoom.id, title: "Booking Dosen", purpose: "Uji fitur pemesanan dosen", attendees: 2, ...nextOpenSlot(3) },
  });
  expectStatus(lecturerOwnBooking, 201, "dosen dapat membuat booking");
  expectStatus(await call("PATCH", `/lecturer/bookings/${lecturerOwnBooking.json.data.id}/review`, {
    token: lecturerToken,
    body: { status: "APPROVED" },
  }), 403, "dosen tidak dapat menyetujui booking sendiri");

  const requestedEnd = new Date(new Date(end).getTime() + 60 * 60_000).toISOString();
  const extension = await call("POST", `/bookings/${bookingId}/extensions`, {
    token: studentAToken,
    body: { requestedEndTime: requestedEnd },
  });
  expectStatus(extension, 201, "ajukan perpanjangan");
  const extensionList = await call("GET", "/lecturer/extensions", { token: lecturerToken });
  assert.ok(extensionList.json.data.some((item) => item.id === extension.json.data.id), "dosen melihat perpanjangan ruang tugas");
  expectStatus(await call("PATCH", `/lecturer/extensions/${extension.json.data.id}/review`, {
    token: lecturerToken,
    body: { status: "APPROVED" },
  }), 200, "dosen menyetujui perpanjangan");
  const extendedBooking = await call("GET", `/bookings/${bookingId}`, { token: studentAToken });
  assert.equal(new Date(extendedBooking.json.data.endTime).toISOString(), new Date(requestedEnd).toISOString(), "waktu selesai diperpanjang");

  const unauthorizedBooking = await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: unassignedRoom.id, title: "Ruang tanpa tugas", purpose: "Uji batas dosen", attendees: 2, ...nextOpenSlot(6) },
  });
  expectStatus(unauthorizedBooking, 201, "buat booking di ruangan tanpa penugasan");
  expectStatus(await call("PATCH", `/lecturer/bookings/${unauthorizedBooking.json.data.id}/review`, {
    token: lecturerToken,
    body: { status: "APPROVED" },
  }), 403, "dosen tidak dapat menyetujui ruangan tanpa penugasan");
  expectStatus(await call("PATCH", `/admin/bookings/${unauthorizedBooking.json.data.id}/review`, {
    token: adminToken,
    body: { status: "APPROVED" },
  }), 200, "admin dapat menjadi override");

  const occupiedSlot = nextOpenSlot(7);
  const occupiedStart = occupiedSlot.startTime;
  const occupiedEnd = occupiedSlot.endTime;
  const occupied = await call("POST", "/bookings", {
    token: studentAToken,
    body: { roomId: assignedRoom.id, title: "Slot Antrean", purpose: "Uji antrean", attendees: 2, startTime: occupiedStart, endTime: occupiedEnd },
  });
  expectStatus(occupied, 201, "buat booking penghalang");
  const rejectedDemand = await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: assignedRoom.id, title: "Permintaan bentrok tercatat", purpose: "Uji log permintaan pengadaan", attendees: 3, startTime: occupiedStart, endTime: occupiedEnd },
  });
  expectStatus(rejectedDemand, 409, "booking bentrok ditolak dan dicatat");
  const demandLog = await prisma.roomDemandLog.findFirst({ where: { roomId: assignedRoom.id, userId: studentBLogin.json.data.user.id, startTime: new Date(occupiedStart), endTime: new Date(occupiedEnd) } });
  assert.ok(demandLog, "penolakan bentrok tersimpan di RoomDemandLog");
  const demandOverview = await call("GET", "/leadership/overview", { token: leadershipToken });
  const assignedDemand = demandOverview.json.data.occupancy.find((room) => room.id === assignedRoom.id);
  assert.ok(assignedDemand.demandCount >= 1, "dasbor menghitung permintaan bentrok dari RoomDemandLog");
  const firstQueue = await call("POST", "/bookings/waitlist", {
    token: studentBToken,
    body: { roomId: assignedRoom.id, title: "Antrean Workflow", purpose: "Menunggu slot", attendees: 2, startTime: occupiedStart, endTime: occupiedEnd },
  });
  expectStatus(firstQueue, 201, "bergabung antrean");
  const secondQueue = await call("POST", "/bookings/waitlist", {
    token: studentAToken,
    body: { roomId: assignedRoom.id, title: "Antrean posisi kedua", purpose: "Uji perubahan posisi", attendees: 2, startTime: occupiedStart, endTime: occupiedEnd },
  });
  expectStatus(secondQueue, 201, "bergabung antrean kedua");
  const roomList = await call("GET", `/rooms?start=${encodeURIComponent(occupiedStart)}&end=${encodeURIComponent(occupiedEnd)}`, { token: studentAToken });
  expectStatus(roomList, 200, "daftar ruangan menyertakan status dan antrean");
  const listedRoom = roomList.json.data.find((item) => item.id === assignedRoom.id);
  assert.equal(listedRoom.waitlistCount, 2, "daftar ruangan menyertakan panjang antrean");
  assert.equal(listedRoom.myWaitlistPosition, 2, "daftar ruangan menyertakan posisi antrean pemilik");
  assert.equal(listedRoom.availability.status, "OCCUPIED", "daftar ruangan menunjukkan slot terpakai");
  const roomDetail = await call("GET", `/rooms/${assignedRoom.id}?start=${encodeURIComponent(occupiedStart)}&end=${encodeURIComponent(occupiedEnd)}`, { token: studentAToken });
  expectStatus(roomDetail, 200, "detail ruangan menyertakan status dan antrean");
  assert.equal(roomDetail.json.data.waitlistCount, 2, "detail ruangan menyertakan panjang antrean");
  assert.equal(roomDetail.json.data.myWaitlistPosition, 2, "detail ruangan menyertakan posisi antrean");
  assert.equal(roomDetail.json.data.availability.status, "OCCUPIED", "detail ruangan menunjukkan slot terpakai");
  const queueBefore = await call("GET", "/bookings/waitlist", { token: studentBToken });
  const queueId = queueBefore.json.data.find((entry) => entry.status === "WAITING")?.id;
  assert.ok(queueId, "antrean menunggu tampil");
  const adminQueue = await call("GET", "/admin/waitlist?status=WAITING", { token: adminToken });
  expectStatus(adminQueue, 200, "admin dapat melihat antrean");
  assert.ok(adminQueue.json.data.some((entry) => entry.id === queueId), "antrean muncul pada daftar admin");
  const lecturerQueue = await call("GET", "/lecturer/waitlist?status=WAITING", { token: lecturerToken });
  expectStatus(lecturerQueue, 200, "dosen dapat melihat antrean ruangan tugas");
  assert.ok(lecturerQueue.json.data.some((entry) => entry.id === queueId), "antrean ruangan tugas muncul pada daftar dosen");
  const unassignedLecturerQueue = await call("GET", `/lecturer/waitlist?roomId=${unassignedRoom.id}`, { token: lecturerToken });
  expectStatus(unassignedLecturerQueue, 200, "dosen dapat memfilter antrean ruangan");
  assert.equal(unassignedLecturerQueue.json.total, 0, "dosen tidak melihat antrean ruangan tanpa penugasan");
  expectStatus(await call("GET", "/admin/waitlist", { token: studentAToken }), 403, "mahasiswa tidak dapat melihat daftar antrean admin");
  expectStatus(await call("GET", "/lecturer/waitlist", { token: studentAToken }), 403, "mahasiswa tidak dapat melihat daftar antrean dosen");

  const cancelFirstId = firstQueue.json.data.id;
  expectStatus(await call("PATCH", `/lecturer/waitlist/${cancelFirstId}/cancel`, {
    token: lecturerToken,
    body: { reason: "Jadwal tidak lagi tersedia" },
  }), 200, "dosen membatalkan antrean ruangan tugas");
  assert.ok(await prisma.bookingQueueLog.findFirst({ where: { queueId: cancelFirstId, actorId: lecturerLogin.json.data.user.id, reason: "Jadwal tidak lagi tersedia" } }), "pembatalan staf tercatat di log");
  assert.ok(await prisma.notification.findFirst({ where: { userId: studentBLogin.json.data.user.id, type: "BOOKING_CANCELLED", message: { contains: "Jadwal tidak lagi tersedia" } } }), "pemilik menerima notifikasi pembatalan antrean");
  const positionNotifications = await prisma.notification.count({
    where: { userId: studentALogin.json.data.user.id, type: "QUEUE_POSITION_CHANGED", message: { contains: "menjadi #1" } },
  });
  assert.equal(positionNotifications, 1, "perubahan posisi mengirim tepat satu notifikasi");
  await call("GET", "/rooms", { token: studentAToken });
  assert.equal(await prisma.notification.count({
    where: { userId: studentALogin.json.data.user.id, type: "QUEUE_POSITION_CHANGED", message: { contains: "menjadi #1" } },
  }), 1, "posisi yang tidak berubah tidak mengirim notifikasi berulang");

  const adminCancelSlot = nextOpenSlot(8);
  const unassignedBlocker = await call("POST", "/bookings", {
    token: studentBToken,
    body: { roomId: unassignedRoom.id, title: "Blokir antrean", purpose: "Uji pembatalan antrean staf", attendees: 2, ...adminCancelSlot },
  });
  expectStatus(unassignedBlocker, 201, "buat slot penuh di ruangan tanpa penugasan");
  const unassignedQueue = await call("POST", "/bookings/waitlist", {
    token: studentAToken,
    body: { roomId: unassignedRoom.id, title: "Antrean tanpa dosen", purpose: "Uji otorisasi dosen", attendees: 2, ...adminCancelSlot },
  });
  expectStatus(unassignedQueue, 201, "antre pada ruangan tanpa penugasan");
  expectStatus(await call("PATCH", `/lecturer/waitlist/${unassignedQueue.json.data.id}/cancel`, {
    token: lecturerToken,
    body: { reason: "Tidak berwenang" },
  }), 403, "dosen tidak dapat membatalkan antrean ruangan tanpa penugasan");
  expectStatus(await call("PATCH", `/admin/waitlist/${unassignedQueue.json.data.id}/cancel`, {
    token: adminToken,
    body: {},
  }), 400, "alasan pembatalan staf wajib diisi");
  expectStatus(await call("PATCH", `/admin/waitlist/${unassignedQueue.json.data.id}/cancel`, {
    token: adminToken,
    body: { reason: "Permintaan pengelola" },
  }), 200, "admin membatalkan antrean dengan alasan");
  assert.ok(await prisma.bookingQueueLog.findFirst({ where: { queueId: unassignedQueue.json.data.id, actorId: adminLogin.json.data.user.id } }), "pembatalan admin tercatat di log");
  assert.ok(await prisma.notification.findFirst({ where: { userId: studentALogin.json.data.user.id, type: "BOOKING_CANCELLED", message: { contains: "Permintaan pengelola" } } }), "admin mengirim notifikasi pembatalan kepada pemilik antrean");

  const expiredStart = new Date(Date.now() - 30 * 60_000);
  const expiredQueue = await prisma.bookingQueue.create({
    data: {
      userId: studentBLogin.json.data.user.id,
      roomId: assignedRoom.id,
      title: "Antrean kedaluwarsa",
      purpose: "Uji scheduler kedaluwarsa",
      startTime: expiredStart,
      endTime: new Date(Date.now() + 30 * 60_000),
      attendees: 2,
    },
  });
  assert.equal(await expireOldQueueEntries(new Date()), 1, "scheduler memproses antrean kedaluwarsa");
  assert.equal((await prisma.bookingQueue.findUniqueOrThrow({ where: { id: expiredQueue.id } })).status, "CANCELLED", "antrean kedaluwarsa dibatalkan");
  assert.ok(await prisma.notification.findFirst({ where: { userId: studentBLogin.json.data.user.id, type: "QUEUE_EXPIRED", message: { contains: "Antrean kedaluwarsa" } } }), "antrean kedaluwarsa mengirim notifikasi");
  assert.equal(await expireOldQueueEntries(new Date()), 0, "scheduler tidak memproses antrean kedaluwarsa berulang");
  assert.equal(await prisma.notification.count({ where: { userId: studentBLogin.json.data.user.id, type: "QUEUE_EXPIRED", message: { contains: "Antrean kedaluwarsa" } } }), 1, "notifikasi kedaluwarsa tidak dikirim berulang");

  expectStatus(await call("PATCH", `/bookings/${occupied.json.data.id}/cancel`, { token: studentAToken }), 200, "batalkan booking pemilik");
  const queueAfter = await call("GET", "/bookings/waitlist", { token: studentAToken });
  assert.equal(queueAfter.json.data.find((entry) => entry.id === secondQueue.json.data.id)?.status, "PROMOTED", "antrean terpromosi berurutan");
  const studentNotifications = await call("GET", "/notifications", { token: studentAToken });
  assert.ok(studentNotifications.json.data.some((item) => item.type === "BOOKING_WAITLIST_PROMOTED"), "notifikasi antrean terkirim");

  // ---------------------------------------------------------------- Fase 5: unduhan bukti, kalender, riwayat
  async function rawGet(path, token) {
    const response = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };
  }
  const receipt = await rawGet(`/bookings/${bookingId}/receipt`, studentAToken);
  assert.equal(receipt.status, 200, "pemilik mengunduh bukti PDF");
  assert.match(receipt.headers.get("content-type") ?? "", /application\/pdf/, "bukti bertipe PDF");
  assert.equal(receipt.buffer.subarray(0, 5).toString("latin1"), "%PDF-", "bukti berupa berkas PDF");
  const verificationMatch = /RK-\d+-[0-9A-F]{8}/.exec(receipt.buffer.toString("latin1"));
  assert.ok(verificationMatch, "bukti memuat kode verifikasi");
  assert.equal((await rawGet(`/bookings/${bookingId}/receipt`, studentBToken)).status, 404, "bukti milik orang lain tidak dapat diunduh");
  assert.equal((await rawGet(`/bookings/${bookingId}/receipt`)).status, 401, "bukti butuh login");
  assert.equal((await rawGet(`/bookings/${bookingId}/receipt`, adminToken)).status, 200, "admin dapat mengunduh bukti");
  assert.equal((await rawGet(`/bookings/${lecturerOwnBooking.json.data.id}/receipt`, lecturerToken)).status, 409, "booking belum disetujui tidak punya bukti");

  const calendar = await rawGet(`/bookings/${bookingId}/calendar.ics`, studentAToken);
  assert.equal(calendar.status, 200, "pemilik mengunduh kalender");
  assert.match(calendar.headers.get("content-type") ?? "", /text\/calendar/, "kalender bertipe text/calendar");
  const calendarText = calendar.buffer.toString("utf8");
  assert.ok(calendarText.includes("BEGIN:VEVENT") && calendarText.includes(`UID:booking-${bookingId}@ruangku`), "kalender memuat acara booking");
  assert.equal((await rawGet(`/bookings/${bookingId}/calendar.ics`, studentBToken)).status, 404, "kalender milik orang lain tidak dapat diunduh");

  const historyA = await rawGet("/bookings/my/export", studentAToken);
  assert.equal(historyA.status, 200, "pemilik mengekspor riwayat");
  assert.match(historyA.headers.get("content-type") ?? "", /text\/csv/, "riwayat bertipe CSV");
  const historyAText = historyA.buffer.toString("utf8");
  assert.ok(historyAText.includes("Kegiatan") && historyAText.includes("Booking Workflow"), "riwayat memuat booking milik sendiri");
  const historyB = await rawGet("/bookings/my/export", studentBToken);
  assert.ok(!historyB.buffer.toString("utf8").includes("Booking Workflow"), "riwayat tidak memuat booking orang lain");
  assert.equal((await rawGet("/bookings/my/export")).status, 401, "ekspor riwayat butuh login");

  const verifyOk = await call("GET", `/admin/bookings/verify?code=${verificationMatch[0]}`, { token: adminToken });
  expectStatus(verifyOk, 200, "admin memverifikasi kode");
  assert.equal(verifyOk.json.data.valid, true, "kode asli valid");
  assert.equal(verifyOk.json.data.booking.id, bookingId, "kode menunjuk booking yang benar");
  const tamperedCode = verificationMatch[0].replace(/.$/, (ch) => (ch === "0" ? "1" : "0"));
  assert.equal((await call("GET", `/admin/bookings/verify?code=${tamperedCode}`, { token: adminToken })).json.data.valid, false, "kode yang diubah tidak valid");
  expectStatus(await call("GET", "/admin/bookings/verify?code=bukan-kode", { token: adminToken }), 400, "format kode salah ditolak");
  expectStatus(await call("GET", `/admin/bookings/verify?code=${verificationMatch[0]}`, { token: studentAToken }), 403, "mahasiswa tidak dapat memverifikasi kode");

  // ---------------------------------------------------------------- Fase 6: agregasi laporan di database == hitungan manual
  const wibDay = (offsetDays) => {
    const now = new Date(Date.now() + 7 * 3_600_000);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  };
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const reportFrom = wibDay(-1), reportTo = wibDay(30);
  const reportQuery = `from=${dayKey(reportFrom)}&to=${dayKey(reportTo)}`;
  const fromUtc = new Date(reportFrom.getTime() - 7 * 3_600_000);
  const toExclusiveUtc = new Date(reportTo.getTime() + 24 * 3_600_000 - 7 * 3_600_000);
  const periodRows = await prisma.booking.findMany({
    where: { startTime: { gte: fromUtc, lt: toExclusiveUtc } },
    select: { status: true, startTime: true, endTime: true, attendees: true, userId: true, roomId: true, overstayMinutes: true },
  });
  const usedRows = periodRows.filter((r) => r.status === "APPROVED" || r.status === "COMPLETED");
  const expectedHours = usedRows.reduce((t, r) => t + (r.endTime.getTime() - r.startTime.getTime()) / 3_600_000, 0);
  const perRoom = new Map();
  for (const r of periodRows) perRoom.set(r.roomId, (perRoom.get(r.roomId) ?? 0) + 1);
  const adminReport = await call("GET", `/admin/reports?${reportQuery}`, { token: adminToken });
  expectStatus(adminReport, 200, "admin membaca laporan");
  const totals = adminReport.json.data.totals;
  assert.equal(totals.bookings, periodRows.length, "laporan: jumlah booking sama dengan hitungan manual");
  assert.equal(totals.attendees, periodRows.reduce((t, r) => t + (r.attendees ?? 0), 0), "laporan: total peserta sama");
  for (const status of ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"]) {
    assert.equal(totals[status.toLowerCase()], periodRows.filter((r) => r.status === status).length, `laporan: jumlah ${status} sama`);
  }
  assert.ok(Math.abs(totals.totalHours - expectedHours) <= 0.1 + periodRows.length * 0.05, "laporan: jam terpakai sama (toleransi pembulatan)");
  assert.equal(totals.activeStudents, new Set(periodRows.map((r) => r.userId)).size, "laporan: pengguna aktif sama");
  assert.equal(adminReport.json.data.topRooms[0].bookings, Math.max(...perRoom.values()), "laporan: ruangan terlaris sesuai");
  assert.equal(adminReport.json.data.daily.reduce((t, d) => t + d.bookings, 0), periodRows.length, "laporan: total harian sama");
  assert.equal(adminReport.json.data.byCategory.reduce((t, c) => t + c.bookings, 0), periodRows.length, "laporan: total kategori sama");
  const lecturerReport = await call("GET", `/lecturer/reports?${reportQuery}`, { token: lecturerToken });
  expectStatus(lecturerReport, 200, "dosen membaca laporan ruangannya");
  assert.ok(lecturerReport.json.data.totals.bookings <= periodRows.length, "laporan dosen dibatasi pada ruangan tugasnya");
  // Dasbor pimpinan: angka dibandingkan dengan hitungan manual dari tabel Booking pada periode yang sama.
  const leadershipNumbers = await call("GET", `/leadership/overview?${reportQuery}`, { token: leadershipToken });
  expectStatus(leadershipNumbers, 200, "pimpinan membaca dasbor periode tetap");
  const attendanceData = leadershipNumbers.json.data.attendance;
  assert.equal(attendanceData.noShowBookings, periodRows.filter((r) => r.status === "NO_SHOW").length, "dasbor: jumlah no-show sama");
  assert.equal(attendanceData.completedBookings, periodRows.filter((r) => r.status === "COMPLETED").length, "dasbor: jumlah selesai sama");
  assert.equal(attendanceData.totalBookings, periodRows.filter((r) => ["APPROVED", "COMPLETED", "NO_SHOW"].includes(r.status)).length, "dasbor: jumlah booking layak sama");
  assert.equal(attendanceData.overstayMinutes, periodRows.filter((r) => r.status === "COMPLETED").reduce((t, r) => t + (r.overstayMinutes ?? 0), 0), "dasbor: total menit overstay sama");
  const assignedRoomRows = usedRows.filter((r) => r.roomId === assignedRoom.id);
  const assignedRoomHours = assignedRoomRows.reduce((t, r) => t + (r.endTime.getTime() - r.startTime.getTime()) / 3_600_000, 0);
  const assignedOccupancy = leadershipNumbers.json.data.occupancy.find((room) => room.id === assignedRoom.id);
  assert.ok(assignedOccupancy, "dasbor memuat ruangan fixture");
  assert.ok(Math.abs(assignedOccupancy.usedHours - assignedRoomHours) <= 0.1 + assignedRoomRows.length * 0.05, "dasbor: jam terpakai ruangan sama dengan hitungan manual");
  const studentAId = studentALogin.json.data.user.id;
  const studentATop = leadershipNumbers.json.data.topUsers.find((user) => user.id === studentAId);
  if (studentATop) assert.equal(studentATop.bookings, periodRows.filter((r) => r.userId === studentAId).length, "dasbor: jumlah booking pengguna sama");

  expectStatus(await call("GET", `/admin/reports?from=${dayKey(wibDay(-400))}&to=${dayKey(wibDay(0))}`, { token: adminToken }), 400, "rentang laporan > 366 hari ditolak");

  expectStatus(await call("PATCH", `/bookings/${bookingId}/cancel`, { token: studentAToken }), 200, "batalkan booking approved milik sendiri");
  console.log("Workflow integration passed: booking quotas, check-in/no-show/overstay, sanctions, room availability and queue visibility, FIFO promotion, staff cancellation audit/authorization, queue position notifications, expiration, and notifications.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("Fixture cleanup failed:", error);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
