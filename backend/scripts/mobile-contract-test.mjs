// Uji "kontrak" untuk aplikasi Flutter: menjalankan alur yang sama dengan aplikasi
// (login -> ruangan -> jadwal -> booking -> riwayat -> notifikasi -> profil) dan memastikan
// setiap field WAJIB yang dibaca model Dart (lib/models/models.dart) ada dengan tipe yang benar.
//
//   node scripts/mobile-contract-test.mjs        (butuh data seed: npm run db:seed)
// Opsional: API_URL, STUDENT_EMAIL, STUDENT_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
const API = process.env.API_URL || "http://localhost:3000/api/v1";
const S = { email: process.env.STUDENT_EMAIL || "mahasiswa@ruangku.test", password: process.env.STUDENT_PASSWORD || "Mahasiswa123!" };
const A = { email: process.env.ADMIN_EMAIL || "admin@ruangku.test", password: process.env.ADMIN_PASSWORD || "Admin123!" };

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log(`  ok   ${name}`)) : (fail++, console.log(`  FAIL ${name} ${extra}`)); };
const call = async (method, path, token, body) => {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const has = (o, spec) => Object.entries(spec).every(([k, t]) => (t === "?" ? true : t === "nullable" ? k in o : typeof o[k] === t));
const nextOpenSlot = (daysAhead) => {
  const nowWib = new Date(Date.now() + 7 * 3600_000);
  for (let offset = daysAhead; offset <= daysAhead + 7; offset += 1) {
    const date = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate() + offset));
    if (date.getUTCDay() === 0) continue;
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 5));
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + 60 * 60_000).toISOString() };
  }
  throw new Error("Tidak dapat menentukan jadwal hari operasional untuk kontrak mobile");
};

(async () => {
  console.log("# Auth");
  const login = await call("POST", "/auth/login", null, S);
  ok("login mahasiswa demo", login.status === 200 && has(login.json.data.user, { id: "number", name: "string", email: "string", role: "string" }));
  const T = login.json.data.token;
  const adminLogin = await call("POST", "/auth/login", null, A);
  const AT = adminLogin.json.data.token;
  ok("login admin demo", adminLogin.status === 200 && adminLogin.json.data.user.role === "ADMIN");
  // Bersihkan sisa booking uji dari run sebelumnya (kuota booking aktif per pengguna dibatasi).
  const TEST_TITLES = ["Uji Kontrak Mobile", "Uji Batal", "Pakai lagi", "Dobel"];
  const cancelLeftovers = async () => {
    const mine = await call("GET", "/students/bookings?pageSize=100", T);
    for (const b of mine.json.data ?? []) {
      if (TEST_TITLES.includes(b.title) && ["PENDING", "APPROVED"].includes(b.status) && new Date(b.startTime) > new Date()) {
        await call("PATCH", `/bookings/${b.id}/cancel`, T);
      }
    }
  };
  await cancelLeftovers();
  const me = await call("GET", "/auth/me", T);
  ok("auth/me -> AppUser", me.status === 200 && has(me.json.data, { id: "number", name: "string", email: "string", role: "string", nim: "nullable" }));
  ok("password salah -> pesan error string", (await call("POST", "/auth/login", null, { email: S.email, password: "salah" })).json.message?.length > 0);

  console.log("# Ruangan");
  const rooms = await call("GET", "/rooms?sort=popular&pageSize=6");
  ok("rooms -> Room[] + paginasi", rooms.status === 200 && rooms.json.data.length > 0 && typeof rooms.json.totalPages === "number" && typeof rooms.json.page === "number");
  ok("tiap Room memuat status antrean dan ketersediaan", rooms.json.data.every((r) => has(r, { id: "number", name: "string", code: "string", location: "string", capacity: "number", category: "nullable", imageUrl: "nullable", isAvailable: "boolean", inUseNow: "boolean", waitlistCount: "number", myWaitlistPosition: "nullable", availability: "object" }) && typeof r.availability.status === "string" && typeof r.availability.message === "string"));
  const room = rooms.json.data.find((r) => r.code === "DSK-01") || rooms.json.data[0];
  const cats = await call("GET", "/rooms/categories");
  ok("categories -> {name,total}", cats.json.data.length >= 5 && cats.json.data.every((c) => typeof c.name === "string" && typeof c.total === "number"));
  const filtered = await call("GET", `/rooms?category=${encodeURIComponent("Seminar")}&facility=${encodeURIComponent("Proyektor")}&minCapacity=50&sort=capacity`);
  ok("filter kategori + fasilitas + kapasitas", filtered.json.data.length >= 1 && filtered.json.data.every((r) => r.category === "Seminar" && r.capacity >= 50));
  const detail = await call("GET", `/rooms/${room.id}`);
  ok("rooms/:id memuat antrean dan status", detail.status === 200 && detail.json.data.id === room.id && typeof detail.json.data.waitlistCount === "number" && typeof detail.json.data.availability?.status === "string");

  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 7 * 3600_000 + 14 * 86400_000).toISOString().slice(0, 10);
  const sched = await call("GET", `/rooms/${room.id}/schedule?from=${today}&to=${later}`, T);
  ok("schedule -> data.bookings[{id,startTime,endTime,status}]", sched.status === 200 && sched.json.data.bookings.every((b) => has(b, { id: "number", startTime: "string", endTime: "string", status: "string" })));
  ok("schedule publik tanpa token", (await call("GET", `/rooms/${room.id}/schedule?from=${today}&to=${later}`)).status === 200);

  console.log("# Booking dari sisi mahasiswa");
  const rules = await call("GET", "/bookings/rules");
  ok("rules -> BookingRules", has(rules.json.data, { minMinutes: "number", maxHours: "number", maxDaysAhead: "number" }));
  const { startTime: s, endTime: e } = nextOpenSlot(20);
  const avail = await call("GET", `/rooms/available?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&minCapacity=1`);
  ok("rooms/available memuat ruangan target", avail.status === 200 && avail.json.data.some((r) => r.id === room.id));
  ok("rooms/available memuat status dan panjang antrean", avail.json.data.every((r) => typeof r.waitlistCount === "number" && typeof r.availability?.status === "string"));
  const before = await call("GET", "/students/bookings?pageSize=50", T);
  const created = await call("POST", "/bookings", T, { roomId: room.id, title: "Uji Kontrak Mobile", purpose: "Pengujian alur aplikasi mobile", attendees: 3, startTime: s, endTime: e });
  if (created.status === 409 && /aktif/i.test(created.json.message ?? "")) {
    console.log("  CATATAN: akun demo sudah mencapai batas booking aktif oleh data selain booking uji; batalkan/selesaikan booking aktifnya lalu ulangi.");
  }
  ok("buat booking 201 -> Booking + attendees", created.status === 201 && has(created.json.data, { id: "number", title: "string", attendees: "number", startTime: "string", endTime: "string", status: "string" }) && created.json.data.status === "PENDING");
  if (created.status !== 201) {
    console.log(`\nHasil: ${pass} lulus, ${fail} gagal (berhenti: booking uji tidak terbentuk, status ${created.status})`);
    process.exit(1);
  }
  const bid = created.json.data.id;
  ok("slot yang sama sekarang bentrok -> 409", (await call("POST", "/bookings", T, { roomId: room.id, title: "Dobel", purpose: "dobel", attendees: 1, startTime: s, endTime: e })).status === 409);
  const avail2 = await call("GET", `/rooms/available?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
  ok("ruangan hilang dari 'available' setelah dibooking", !avail2.json.data.some((r) => r.id === room.id));

  const list = await call("GET", "/students/bookings?pageSize=50", T);
  ok("students/bookings -> Booking[] + summary", list.status === 200 && list.json.total === before.json.total + 1 && has(list.json.summary, { total: "number", PENDING: "number", APPROVED: "number", REJECTED: "number", CANCELLED: "number", COMPLETED: "number" }));
  ok("tiap Booking memuat field peserta nullable dan room{name,code,location}", list.json.data.every((b) => has(b, { id: "number", title: "string", purpose: "string", attendees: "nullable", startTime: "string", endTime: "string", status: "string", createdAt: "string" }) && has(b.room, { id: "number", name: "string", code: "string", location: "string" })));
  ok("status COMPLETED & REJECTED & CANCELLED tersedia dari seed", ["COMPLETED", "REJECTED", "CANCELLED", "APPROVED"].every((st) => list.json.summary[st] > 0));
  const filtStatus = await call("GET", "/students/bookings?status=REJECTED", T);
  ok("filter status REJECTED memuat alasan penolakan", filtStatus.json.data.length > 0 && filtStatus.json.data.every((b) => b.status === "REJECTED" && typeof b.adminNote === "string"));
  const bd = await call("GET", `/bookings/${bid}`, T);
  ok("detail -> logs[{action,createdAt}]", bd.status === 200 && bd.json.data.logs.length >= 1 && bd.json.data.logs.every((l) => typeof l.action === "string" && typeof l.createdAt === "string"));

  console.log("# Admin memproses -> notifikasi mahasiswa");
  const unreadBefore = (await call("GET", "/notifications/unread-count", T)).json.data.count;
  const adminList = await call("GET", "/admin/bookings?status=PENDING&q=" + encodeURIComponent("Uji Kontrak Mobile"), AT);
  ok("admin melihat booking mahasiswa", adminList.json.data.some((b) => b.id === bid));
  ok("mahasiswa tidak bisa approve -> 403", (await call("PATCH", `/admin/bookings/${bid}/approve`, T, {})).status === 403);
  ok("admin approve 200", (await call("PATCH", `/admin/bookings/${bid}/approve`, AT, { adminNote: "OK" })).status === 200);
  const detail2 = await call("GET", `/bookings/${bid}`, T);
  ok("status berubah APPROVED di sisi mahasiswa", detail2.json.data.status === "APPROVED" && detail2.json.data.adminNote === "OK");
  const notifs = await call("GET", "/students/notifications?pageSize=20", T);
  ok("notifikasi -> AppNotification[]", notifs.status === 200 && typeof notifs.json.unread === "number" && notifs.json.data.every((n) => has(n, { id: "number", type: "string", title: "string", message: "string", isRead: "boolean", createdAt: "string", bookingId: "nullable" })));
  ok("notifikasi disetujui masuk (unread +1)", notifs.json.data.some((n) => n.type === "BOOKING_APPROVED" && n.bookingId === bid) && notifs.json.unread === unreadBefore + 1);
  const nid = notifs.json.data.find((n) => !n.isRead).id;
  ok("tandai dibaca", (await call("PATCH", `/notifications/${nid}/read`, T)).status === 200);
  const cancelledApproved = await call("PATCH", `/bookings/${bid}/cancel`, T);
  ok("mahasiswa dapat membatalkan peminjaman approved yang belum dimulai", cancelledApproved.status === 200 && cancelledApproved.json.data.status === "CANCELLED");

  console.log("# Batalkan pending");
  const { startTime: s2, endTime: e2 } = nextOpenSlot(21);
  const b2 = await call("POST", "/bookings", T, { roomId: room.id, title: "Uji Batal", purpose: "Akan dibatalkan", attendees: 1, startTime: s2, endTime: e2 });
  ok("pending dibatalkan mahasiswa -> CANCELLED", (await call("PATCH", `/bookings/${b2.json.data.id}/cancel`, T)).json.data.status === "CANCELLED");
  ok("slot yang dibatalkan bisa dipakai lagi", (await call("POST", "/bookings", T, { roomId: room.id, title: "Pakai lagi", purpose: "x y z", attendees: 1, startTime: s2, endTime: e2 })).status === 201);

  await cancelLeftovers();

  console.log("# Profil");
  const upd = await call("PUT", "/students/profile", T, { name: "Mahasiswa Demo" });
  ok("PUT students/profile -> AppUser", upd.status === 200 && upd.json.data.name === "Mahasiswa Demo");
  ok("ganti password: password lama salah -> 400", (await call("PATCH", "/users/password", T, { currentPassword: "salahsekali", newPassword: "PasswordBaru123" })).status === 400);
  ok("logout 200", (await call("POST", "/auth/logout", T)).status === 200);

  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
