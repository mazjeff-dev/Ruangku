// Uji API end-to-end RuangKu. Jalankan saat backend hidup:
//   ADMIN_PASSWORD="..." node scripts/smoke-test.mjs
// Opsional: API_URL (default http://localhost:3000/api/v1), ADMIN_EMAIL (default admin@ruangku.local)
// Skrip membuat data uji dengan prefix "SMK" (ruangan & mahasiswa) lalu membersihkan yang bisa dihapus.
const API = process.env.API_URL || "http://localhost:3000/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ruangku.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error("Set ADMIN_PASSWORD terlebih dahulu."); process.exit(2); }

let passed = 0, failed = 0;
const failures = [];
const run = Date.now().toString(36);

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name} ${extra}`); }
}
const eq = (name, got, want) => check(name, got === want, `(dapat ${JSON.stringify(got)}, harapan ${JSON.stringify(want)})`);
const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();
// Slot deterministik: hari kerja (bukan Minggu) pada jam operasional WIB, tidak bergantung jam tes dijalankan.
// Dasar 11.00 WIB (= 04.00 UTC); offsetJam dapat negatif/positif dalam rentang 07.00-21.00 WIB.
const workdayBase = (daysAhead) => {
  const nowWib = new Date(Date.now() + 7 * 3600_000);
  for (let offset = daysAhead; offset <= daysAhead + 7; offset += 1) {
    const d = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate() + offset));
    if (d.getUTCDay() !== 0) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4);
  }
  throw new Error("Tidak dapat menentukan hari kerja untuk smoke test");
};
const wibSlotAt = (baseMs, plusHours) => new Date(baseMs + plusHours * 3600_000).toISOString();
const day = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const nextOpenSlot = (daysAhead) => {
  const nowWib = new Date(Date.now() + 7 * 3600_000);
  for (let offset = daysAhead; offset <= daysAhead + 7; offset += 1) {
    const date = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate() + offset));
    if (date.getUTCDay() === 0) continue;
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 5));
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + 3_600_000).toISOString() };
  }
  throw new Error("Tidak dapat menentukan jadwal hari operasional untuk smoke test");
};

(async () => {
  console.log("# Kesehatan & auth");
  eq("health 200", (await call("GET", "/health")).status, 200);
  eq("health/db 200", (await call("GET", "/health/db")).status, 200);
  eq("login salah -> 401", (await call("POST", "/auth/login", { body: { email: ADMIN_EMAIL, password: "salah-salah" } })).status, 401);
  eq("login body kosong -> 400", (await call("POST", "/auth/login", { body: {} })).status, 400);
  const login = await call("POST", "/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  eq("login admin 200", login.status, 200);
  const A = login.json?.data?.token;
  check("token admin ada", !!A);
  eq("role ADMIN", login.json?.data?.user?.role, "ADMIN");
  check("password tidak bocor di respons", !JSON.stringify(login.json).includes("$2"));

  console.log("# Registrasi & otorisasi");
  const sA = { name: `Mhs SMK A ${run}`, email: `smk-a-${run}@test.local`, password: "password123", nim: `SMKA${run}` };
  const sB = { name: `Mhs SMK B ${run}`, email: `smk-b-${run}@test.local`, password: "password123", nim: `SMKB${run}` };
  eq("register A 201", (await call("POST", "/auth/register", { body: sA })).status, 201);
  eq("register B 201", (await call("POST", "/auth/register", { body: sB })).status, 201);
  eq("register duplikat 409", (await call("POST", "/auth/register", { body: sA })).status, 409);
  eq("register password pendek 400", (await call("POST", "/auth/register", { body: { ...sA, email: "x@y.com", nim: "N1", password: "123" } })).status, 400);
  const tA = (await call("POST", "/auth/login", { body: { email: sA.email, password: sA.password } })).json.data.token;
  const tB = (await call("POST", "/auth/login", { body: { email: sB.email, password: sB.password } })).json.data.token;
  eq("tanpa token -> 401", (await call("GET", "/admin/dashboard")).status, 401);
  eq("mahasiswa akses admin -> 403", (await call("GET", "/admin/dashboard", { token: tA })).status, 403);
  eq("token ngawur -> 401", (await call("GET", "/admin/dashboard", { token: "abc.def.ghi" })).status, 401);

  console.log("# CRUD ruangan");
  const code = `SMK-${run}`.toUpperCase();
  const roomBody = { name: `Ruang Uji ${run}`, code: code.toLowerCase(), location: "Gedung Uji Lt. 2", capacity: 30, facilities: "Proyektor, AC", description: "Ruang untuk uji" };
  eq("student tidak bisa buat ruangan", (await call("POST", "/admin/rooms", { token: tA, body: roomBody })).status, 403);
  eq("validasi kapasitas 0 -> 400", (await call("POST", "/admin/rooms", { token: A, body: { ...roomBody, capacity: 0 } })).status, 400);
  const created = await call("POST", "/admin/rooms", { token: A, body: roomBody });
  eq("buat ruangan 201", created.status, 201);
  const room = created.json.data;
  eq("kode di-uppercase", room.code, code);
  eq("kode duplikat -> 409", (await call("POST", "/admin/rooms", { token: A, body: roomBody })).status, 409);
  const upd = await call("PATCH", `/admin/rooms/${room.id}`, { token: A, body: { capacity: 40, location: "Gedung Uji Lt. 3" } });
  eq("edit ruangan 200", upd.status, 200);
  eq("kapasitas berubah", upd.json.data.capacity, 40);
  check("PATCH parsial tidak mereset field lain (deskripsi, status)", upd.json.data.description === "Ruang untuk uji" && upd.json.data.isActive === true && upd.json.data.facilities === "Proyektor, AC");
  const clr = await call("PATCH", `/admin/rooms/${room.id}`, { token: A, body: { description: "" } });
  check("string kosong menghapus deskripsi, field lain tetap", clr.json.data.description === null && clr.json.data.capacity === 40);
  eq("edit kosong -> 400", (await call("PATCH", `/admin/rooms/${room.id}`, { token: A, body: {} })).status, 400);
  eq("ruangan tak ada -> 404", (await call("GET", "/admin/rooms/99999999", { token: A })).status, 404);

  // upload foto (PNG 1x1)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData(); fd.append("photo", new Blob([png], { type: "image/png" }), "a.png");
  const up = await call("POST", `/admin/rooms/${room.id}/photo`, { token: A, form: fd });
  eq("upload foto 200", up.status, 200);
  check("imageUrl terisi", up.json?.data?.imageUrl?.startsWith("/uploads/rooms/"));
  const img = await fetch(API.replace("/api/v1", "") + up.json.data.imageUrl);
  eq("foto bisa diakses", img.status, 200);
  const fd2 = new FormData(); fd2.append("photo", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "x.png");
  eq("file palsu (bukan gambar) ditolak", (await call("POST", `/admin/rooms/${room.id}/photo`, { token: A, form: fd2 })).status, 400);
  const fd3 = new FormData(); fd3.append("photo", new Blob(["hello"], { type: "text/html" }), "x.html");
  eq("mimetype salah ditolak", (await call("POST", `/admin/rooms/${room.id}/photo`, { token: A, form: fd3 })).status, 400);
  const pub = await call("GET", "/rooms");
  check("ruangan tampil di /rooms publik", pub.json.data.some((r) => r.id === room.id && r.imageUrl));

  console.log("# Peminjaman & konflik jadwal");
  const base = { roomId: room.id, title: "Rapat Uji", purpose: "Uji konflik", attendees: 2 };
  const baseMs = workdayBase(3);
  const s1 = wibSlotAt(baseMs, 0), e1 = wibSlotAt(baseMs, 2);
  const b1 = await call("POST", "/bookings", { token: tA, body: { ...base, startTime: s1, endTime: e1 } });
  eq("ajukan 201", b1.status, 201);
  eq("waktu selesai < mulai -> 400", (await call("POST", "/bookings", { token: tA, body: { ...base, startTime: e1, endTime: s1 } })).status, 400);
  eq("waktu lampau -> 400", (await call("POST", "/bookings", { token: tA, body: { ...base, startTime: hoursFromNow(-5), endTime: hoursFromNow(-3) } })).status, 400);
  eq("bentrok persis -> 409", (await call("POST", "/bookings", { token: tB, body: { ...base, startTime: s1, endTime: e1 } })).status, 409);
  eq("bentrok sebagian (tumpang tindih awal) -> 409", (await call("POST", "/bookings", { token: tB, body: { ...base, startTime: wibSlotAt(baseMs, -1), endTime: wibSlotAt(baseMs, 1) } })).status, 409);
  eq("bentrok mencakup -> 409", (await call("POST", "/bookings", { token: tB, body: { ...base, startTime: wibSlotAt(baseMs, -1), endTime: wibSlotAt(baseMs, 4) } })).status, 409);
  const adjacent = await call("POST", "/bookings", { token: tB, body: { ...base, startTime: e1, endTime: wibSlotAt(baseMs, 4) } });
  eq("bersebelahan (end == start) -> boleh 201", adjacent.status, 201);
  const before = await call("POST", "/bookings", { token: tB, body: { ...base, startTime: wibSlotAt(baseMs, -2), endTime: s1 } });
  eq("sebelum (end == start) -> boleh 201", before.status, 201);

  // race: 6 permintaan serentak untuk slot yang sama
  const { startTime: rs, endTime: re } = nextOpenSlot(5);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call("POST", "/bookings", { token: i % 2 ? tA : tB, body: { ...base, title: `Race ${i}`, startTime: rs, endTime: re } })));
  const okCount = results.filter((r) => r.status === 201).length;
  eq("race condition: hanya 1 yang lolos", okCount, 1);

  console.log("# Persetujuan / penolakan / pembatalan");
  const id1 = b1.json.data.id;
  eq("student tidak bisa review -> 403", (await call("PATCH", `/admin/bookings/${id1}/review`, { token: tA, body: { status: "APPROVED" } })).status, 403);
  eq("tolak tanpa alasan -> 400", (await call("PATCH", `/admin/bookings/${id1}/review`, { token: A, body: { status: "REJECTED" } })).status, 400);
  eq("status ngawur -> 400", (await call("PATCH", `/admin/bookings/${id1}/review`, { token: A, body: { status: "FOO" } })).status, 400);
  const ap = await call("PATCH", `/admin/bookings/${id1}/review`, { token: A, body: { status: "APPROVED", adminNote: "Silakan" } });
  eq("setujui 200", ap.status, 200);
  eq("setujui ulang -> 400", (await call("PATCH", `/admin/bookings/${id1}/review`, { token: A, body: { status: "APPROVED" } })).status, 400);
  const raceWinner = results.find((r) => r.status === 201).json.data.id;
  const rej = await call("PATCH", `/admin/bookings/${raceWinner}/review`, { token: A, body: { status: "REJECTED", adminNote: "Ditolak karena uji" } });
  eq("tolak dengan alasan 200", rej.status, 200);
  const detail = await call("GET", `/admin/bookings/${id1}`, { token: A });
  eq("detail 200", detail.status, 200);
  check("detail memuat riwayat status (CREATED, APPROVED)", detail.json.data.logs.map((l) => l.action).join() === "CREATED,APPROVED");
  check("detail memuat mahasiswa & ruangan", detail.json.data.student?.email === sA.email && detail.json.data.room?.id === room.id);
  const cancelSlot = nextOpenSlot(8);
  const bq = await call("POST", "/bookings", { token: tA, body: { ...base, ...cancelSlot } });
  const cancelled = await call("PATCH", `/admin/bookings/${bq.json.data.id}/cancel`, { token: A, body: { reason: "Ruangan perbaikan" } });
  eq("admin batalkan 200", cancelled.status, 200);
  eq("batalkan ulang -> 400", (await call("PATCH", `/admin/bookings/${bq.json.data.id}/cancel`, { token: A, body: { reason: "lagi" } })).status, 400);
  eq("setelah batal slot bisa dipakai lagi", (await call("POST", "/bookings", { token: tB, body: { ...base, ...cancelSlot } })).status, 201);
  const ownSlot = nextOpenSlot(10);
  const ownBooking = await call("POST", "/bookings", { token: tA, body: { ...base, ...ownSlot } });
  const own = await call("PATCH", `/bookings/${ownBooking.json.data.id}/cancel`, { token: tB });
  eq("mahasiswa lain tidak bisa batalkan -> 403", own.status, 403);
  await call("PATCH", `/bookings/${adjacent.json.data.id}/cancel`, { token: tB });
  await call("PATCH", `/bookings/${before.json.data.id}/cancel`, { token: tB });

  console.log("# Daftar peminjaman (filter & paginasi)");
  const list = await call("GET", `/admin/bookings?roomId=${room.id}&pageSize=2`, { token: A });
  eq("list 200", list.status, 200);
  eq("pageSize dihormati", list.json.data.length, 2);
  check("total & totalPages ada", list.json.total >= 5 && list.json.totalPages >= 3);
  const onlyAp = await call("GET", `/admin/bookings?roomId=${room.id}&status=APPROVED`, { token: A });
  check("filter status APPROVED", onlyAp.json.data.length === 1 && onlyAp.json.data[0].status === "APPROVED");
  const searched = await call("GET", `/admin/bookings?q=${encodeURIComponent(sA.name)}`, { token: A });
  check("pencarian nama mahasiswa", searched.json.data.length >= 1);
  eq("status filter ngawur -> 400", (await call("GET", "/admin/bookings?status=XYZ", { token: A })).status, 400);
  eq("format tanggal salah -> 400", (await call("GET", "/admin/bookings?from=31-12-2026", { token: A })).status, 400);

  console.log("# Notifikasi");
  const nA = await call("GET", "/notifications", { token: tA });
  check("mahasiswa A menerima notifikasi disetujui", nA.json.data.some((n) => n.type === "BOOKING_APPROVED"));
  check("mahasiswa A menerima notifikasi dibatalkan admin", nA.json.data.some((n) => n.type === "BOOKING_CANCELLED"));
  const nAdmin = await call("GET", "/notifications?unread=true", { token: A });
  check("admin menerima notifikasi pengajuan baru", nAdmin.json.data.some((n) => n.type === "BOOKING_SUBMITTED"));
  const nid = nA.json.data[0].id;
  eq("tandai dibaca 200", (await call("PATCH", `/notifications/${nid}/read`, { token: tA })).status, 200);
  eq("notifikasi milik orang lain -> 404", (await call("PATCH", `/notifications/${nid}/read`, { token: tB })).status, 404);
  const uc = await call("GET", "/notifications/unread-count", { token: tA });
  check("unread-count angka", typeof uc.json.data.count === "number");
  eq("read-all 200", (await call("PATCH", "/notifications/read-all", { token: tA })).status, 200);
  eq("unread jadi 0", (await call("GET", "/notifications/unread-count", { token: tA })).json.data.count, 0);

  console.log("# Dashboard & jadwal");
  const dash = await call("GET", `/admin/dashboard?from=${day(-1)}&to=${day(30)}`, { token: A });
  eq("dashboard 200", dash.status, 200);
  const d = dash.json.data;
  check("statistik ruangan ada", d.rooms.total >= 1 && d.rooms.active >= 1);
  check("jumlah status konsisten dengan total", d.bookings.total === d.bookings.pending + d.bookings.approved + d.bookings.rejected + d.bookings.cancelled + d.bookings.completed);
  check("grafik harian", d.chart.granularity === "day" && d.chart.points.length >= 30);
  check("jumlah grafik = total booking", d.chart.points.reduce((s, p) => s + p.total, 0) === d.bookings.total);
  check("aktivitas terbaru", d.recentActivity.length > 0 && d.recentActivity[0].booking?.title);
  const dash2 = await call("GET", `/admin/dashboard?from=${day(-1)}&to=${day(30)}&status=APPROVED`, { token: A });
  check("filter status dashboard", dash2.json.data.chart.points.reduce((s, p) => s + p.total, 0) === d.bookings.approved);
  eq("rentang terbalik -> 400", (await call("GET", `/admin/dashboard?from=${day(5)}&to=${day(1)}`, { token: A })).status, 400);
  const sch = await call("GET", `/admin/schedule?from=${day(0)}&to=${day(10)}&roomId=${room.id}`, { token: A });
  eq("jadwal 200", sch.status, 200);
  check("jadwal berisi booking ruangan", sch.json.data.bookings.length >= 3 && sch.json.data.bookings.every((b) => b.room.id === room.id));
  check("jadwal tidak memuat yang ditolak/dibatalkan", sch.json.data.bookings.every((b) => ["PENDING", "APPROVED", "COMPLETED"].includes(b.status)));
  const rs2 = await call("GET", `/rooms/${room.id}/schedule?from=${day(0)}&to=${day(10)}`, { token: tA });
  eq("jadwal ruangan (mahasiswa) 200", rs2.status, 200);
  check("jadwal ruangan tanpa data pribadi", !JSON.stringify(rs2.json).includes("email"));

  console.log("# Mahasiswa");
  const sl = await call("GET", `/admin/students?q=${encodeURIComponent("SMK A " + run)}`, { token: A });
  eq("cari mahasiswa 200", sl.status, 200);
  eq("hasil pencarian 1", sl.json.data.length, 1);
  check("password tidak ikut", !("password" in sl.json.data[0]));
  const sid = sl.json.data[0].id;
  const sd = await call("GET", `/admin/students/${sid}`, { token: A });
  check("detail + riwayat peminjaman", sd.json.data.bookings.length >= 2 && sd.json.data.stats.total >= 2);
  eq("nonaktifkan akun 200", (await call("PATCH", `/admin/students/${sid}/status`, { token: A, body: { isActive: false } })).status, 200);
  eq("akun nonaktif tidak bisa login -> 403", (await call("POST", "/auth/login", { body: { email: sA.email, password: sA.password } })).status, 403);
  eq("token lama akun nonaktif ditolak -> 403", (await call("GET", "/users/profile", { token: tA })).status, 403);
  eq("aktifkan lagi 200", (await call("PATCH", `/admin/students/${sid}/status`, { token: A, body: { isActive: true } })).status, 200);
  eq("token berfungsi lagi", (await call("GET", "/users/profile", { token: tA })).status, 200);
  eq("admin tidak bisa lewat endpoint mahasiswa -> 404", (await call("GET", `/admin/students/${login.json.data.user.id}`, { token: A })).status, 404);

  console.log("# Profil & password");
  const pr = await call("PATCH", "/users/profile", { token: tB, body: { name: `Mhs SMK B2 ${run}` } });
  eq("ubah nama 200", pr.status, 200);
  eq("email dipakai orang lain -> 409", (await call("PATCH", "/users/profile", { token: tB, body: { email: sA.email } })).status, 409);
  eq("ubah email format salah -> 400", (await call("PATCH", "/users/profile", { token: tB, body: { email: "bukan-email" } })).status, 400);
  eq("password lama salah -> 400", (await call("PATCH", "/users/password", { token: tB, body: { currentPassword: "salahsalah", newPassword: "passwordbaru1" } })).status, 400);
  eq("password baru pendek -> 400", (await call("PATCH", "/users/password", { token: tB, body: { currentPassword: sB.password, newPassword: "abc" } })).status, 400);
  eq("ubah password 200", (await call("PATCH", "/users/password", { token: tB, body: { currentPassword: sB.password, newPassword: "passwordbaru1" } })).status, 200);
  eq("login pakai password baru", (await call("POST", "/auth/login", { body: { email: sB.email, password: "passwordbaru1" } })).status, 200);
  eq("password lama tak berlaku", (await call("POST", "/auth/login", { body: { email: sB.email, password: sB.password } })).status, 401);
  eq("app-info 200", (await call("GET", "/admin/app-info", { token: A })).status, 200);

  console.log("# Validasi hapus / nonaktif ruangan");
  eq("nonaktifkan ruangan dgn jadwal mendatang -> 409", (await call("PATCH", `/admin/rooms/${room.id}`, { token: A, body: { isActive: false } })).status, 409);
  eq("hapus ruangan ber-riwayat -> 409", (await call("DELETE", `/admin/rooms/${room.id}`, { token: A })).status, 409);
  const room2 = (await call("POST", "/admin/rooms", { token: A, body: { ...roomBody, code: `SMK2-${run}`, name: `Ruang Uji2 ${run}` } })).json.data;
  eq("nonaktif ruangan kosong 200", (await call("PATCH", `/admin/rooms/${room2.id}`, { token: A, body: { isActive: false } })).status, 200);
  check("ruangan nonaktif tidak muncul di /rooms", !(await call("GET", "/rooms")).json.data.some((r) => r.id === room2.id));
  const inactiveRoomSlot = nextOpenSlot(1);
  eq("booking ruangan nonaktif -> 404", (await call("POST", "/bookings", { token: tA, body: { ...base, roomId: room2.id, ...inactiveRoomSlot } })).status, 404);
  eq("hapus ruangan tanpa riwayat 200", (await call("DELETE", `/admin/rooms/${room2.id}`, { token: A })).status, 200);
  eq("endpoint tak dikenal -> 404 JSON", (await call("GET", "/tidak-ada")).status, 404);

  console.log("# Endpoint tambahan (me, students, rooms, bookings, reports)");
  const me = await call("GET", "/auth/me", { token: tB });
  check("auth/me mengembalikan profil tanpa password", me.status === 200 && me.json.data.email === sB.email && !("password" in me.json.data));
  eq("auth/me tanpa token -> 401", (await call("GET", "/auth/me")).status, 401);
  eq("auth/logout 200", (await call("POST", "/auth/logout", { token: tB })).status, 200);
  eq("register tanpa NIM diperbolehkan", (await call("POST", "/auth/register", { body: { name: `Tanpa NIM ${run}`, email: `nonim-${run}@test.local`, password: "password123" } })).status, 201);
  eq("students/profile (mahasiswa) 200", (await call("GET", "/students/profile", { token: tA })).status, 200);
  eq("students/profile (admin) -> 403", (await call("GET", "/students/profile", { token: A })).status, 403);
  const sp = await call("PUT", "/students/profile", { token: tA, body: { name: `Mhs SMK A2 ${run}` } });
  eq("PUT students/profile 200", sp.status, 200);
  const sb = await call("GET", "/students/bookings?pageSize=2", { token: tA });
  check("students/bookings + ringkasan", sb.status === 200 && sb.json.summary.total >= 2 && sb.json.data.length <= 2);
  eq("students/notifications 200", (await call("GET", "/students/notifications", { token: tA })).status, 200);

  const rd = await call("GET", `/rooms/${room.id}`);
  check("rooms/:id detail + category", rd.status === 200 && rd.json.data.id === room.id && "category" in rd.json.data);
  eq("rooms/:id tidak ada -> 404", (await call("GET", "/rooms/99999999")).status, 404);
  eq("rooms/:id bukan angka -> 400", (await call("GET", "/rooms/abc")).status, 400);
  const cat = await call("GET", "/rooms/categories");
  check("rooms/categories", cat.status === 200 && Array.isArray(cat.json.data));
  const av1 = await call("GET", `/rooms/available?start=${encodeURIComponent(s1)}&end=${encodeURIComponent(e1)}`);
  check("rooms/available: ruangan terisi tidak muncul", av1.status === 200 && !av1.json.data.some((r) => r.id === room.id));
  const availableSlot = nextOpenSlot(12);
  const av2 = await call("GET", `/rooms/available?start=${encodeURIComponent(availableSlot.startTime)}&end=${encodeURIComponent(availableSlot.endTime)}`);
  check("rooms/available: ruangan kosong muncul", av2.json.data.some((r) => r.id === room.id));
  eq("rooms/available tanpa parameter -> 400", (await call("GET", "/rooms/available")).status, 400);
  const sortPop = await call("GET", "/rooms?sort=popular&pageSize=3");
  check("rooms sort=popular + paginasi", sortPop.status === 200 && sortPop.json.data.length <= 3 && sortPop.json.totalPages >= 1);
  await call("PATCH", `/admin/rooms/${room.id}`, { token: A, body: { category: "Uji", facilities: "Proyektor, AC" } });
  const fc = await call("GET", `/rooms?category=Uji&facility=${encodeURIComponent("Proyektor,AC")}&minCapacity=40`);
  check("filter kategori+fasilitas+kapasitas", fc.json.data.some((r) => r.id === room.id));
  eq("filter kapasitas terlalu besar mengosongkan", (await call("GET", `/rooms?category=Uji&minCapacity=9999`)).json.data.length, 0);

  const rules = await call("GET", "/bookings/rules");
  check("bookings/rules", rules.status === 200 && rules.json.data.maxHours > 0);
  eq("durasi < minimum -> 400", (await call("POST", "/bookings", { token: tA, body: { ...base, startTime: wibSlotAt(workdayBase(20), 0), endTime: wibSlotAt(workdayBase(20), 0.1) } })).status, 400);
  eq("durasi > maksimum -> 400", (await call("POST", "/bookings", { token: tA, body: { ...base, startTime: wibSlotAt(workdayBase(20), -4), endTime: wibSlotAt(workdayBase(20), -4 + rules.json.data.maxHours + 1) } })).status, 400);
  const lst = await call("GET", "/bookings?status=APPROVED", { token: tA });
  check("bookings list filter status", lst.status === 200 && lst.json.data.every((b) => b.status === "APPROVED"));
  const bd = await call("GET", `/bookings/${id1}`, { token: tA });
  check("bookings/:id detail + riwayat", bd.status === 200 && bd.json.data.logs.length >= 2 && bd.json.data.room.name);
  eq("detail milik orang lain -> 404", (await call("GET", `/bookings/${id1}`, { token: tB })).status, 404);

  const approvalSlot = nextOpenSlot(14);
  const pa = await call("POST", "/bookings", { token: tB, body: { ...base, title: "Alias approve", ...approvalSlot } });
  eq("approve alias 200", (await call("PATCH", `/admin/bookings/${pa.json.data.id}/approve`, { token: A, body: {} })).status, 200);
  const rejectionSlot = nextOpenSlot(15);
  const prj = await call("POST", "/bookings", { token: tB, body: { ...base, title: "Alias reject", ...rejectionSlot } });
  eq("reject alias tanpa alasan -> 400", (await call("PATCH", `/admin/bookings/${prj.json.data.id}/reject`, { token: A, body: {} })).status, 400);
  eq("reject alias dengan reason 200", (await call("PATCH", `/admin/bookings/${prj.json.data.id}/reject`, { token: A, body: { reason: "Jadwal tidak sesuai" } })).status, 200);
  check("notifikasi penolakan memuat alasan", (await call("GET", "/notifications", { token: tB })).json.data.some((n) => n.type === "BOOKING_REJECTED" && n.message.includes("Jadwal tidak sesuai")));
  eq("approve oleh mahasiswa -> 403", (await call("PATCH", `/admin/bookings/${pr.json.data.id}/approve`, { token: tB })).status, 403);

  const rep = await call("GET", `/admin/reports?from=${day(-1)}&to=${day(40)}`, { token: A });
  eq("reports 200", rep.status, 200);
  const rp = rep.json.data;
  check("reports: total konsisten", rp.totals.bookings === rp.totals.pending + rp.totals.approved + rp.totals.rejected + rp.totals.cancelled + rp.totals.completed);
  check("reports: top ruangan & mahasiswa", rp.topRooms.length > 0 && rp.topStudents.length > 0 && Array.isArray(rp.byCategory));
  eq("reports mahasiswa -> 403", (await call("GET", "/admin/reports", { token: tA })).status, 403);
  const csv = await fetch(`${API}/admin/reports/export?from=${day(-1)}&to=${day(40)}`, { headers: { Authorization: `Bearer ${A}` } });
  const csvText = await csv.text();
  check("export CSV", csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv") && csvText.includes("Kegiatan,Ruangan"));
  eq("export CSV mahasiswa -> 403", (await fetch(`${API}/admin/reports/export`, { headers: { Authorization: `Bearer ${tA}` } })).status, 403);

  console.log(`\nHasil: ${passed} lulus, ${failed} gagal`);
  if (failed) console.log("Gagal:\n - " + failures.join("\n - "));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
