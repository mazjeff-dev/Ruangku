# RuangKu — Premium Campus Room Booking System

*Find Your Space. Make It Happen.*

Sistem peminjaman ruangan kampus full-stack: aplikasi Android mahasiswa (Flutter), dashboard administrator (SvelteKit), dan REST API (Node.js + Express + Prisma + MySQL) yang memakai satu database yang sama. Zona waktu: Asia/Jakarta (database menyimpan UTC, tampilan WIB).

Dokumentasi tambahan: [ERD](docs/architecture-erd.md) · [API](docs/api.md) · [alur booking](docs/booking-workflows.md) · [deploy](docs/deployment.md) · [akun demo](docs/demo-accounts.md).

## Fitur

**Mahasiswa (Flutter):** splash, onboarding, registrasi & login (JWT), lupa password melalui tautan email, beranda (sapaan, statistik, ruangan populer, tersedia sekarang, booking terbaru, aksi cepat), katalog ruangan (cari, kategori, kapasitas, fasilitas, ketersediaan pada waktu tertentu, urutkan), detail ruangan + jadwal harian, form booking dengan validasi + dialog konfirmasi, riwayat per status, detail & pembatalan booking pending, notifikasi, profil (edit profil, ganti password, logout).

**Dosen (web & Flutter):** seluruh fitur mahasiswa, dashboard penggunaan ruang yang ditugaskan, peninjauan pengajuan dan perpanjangan hanya pada ruangan kewenangannya, laporan dan notifikasi.

**Web (SvelteKit):** login bersama berbasis role dengan lupa/reset password dan kontrol lihat/sembunyikan password; ADMIN diarahkan ke dashboard administrasi, DOSEN ke dashboard ruangan tugas, dan STUDENT ke dashboard mahasiswa. Dashboard mahasiswa menyediakan katalog dan pencarian ruangan, pemeriksaan jadwal/ketersediaan, booking dan riwayat/status, pembatalan sesuai aturan, serta notifikasi.

**Admin (SvelteKit):** dashboard (statistik pengguna, ruangan, peminjaman, grafik dan aktivitas), manajemen ruangan (CRUD aman, kategori, foto, fasilitas), jam operasional global dan override ruangan, penutupan terjadwal dengan konfirmasi booking terdampak, akun mahasiswa dan dosen, penugasan dosen per ruangan, peminjaman (jumlah peserta, persetujuan, penolakan, pembatalan), permintaan perpanjangan, kalender, laporan seluruh ruangan (ekspor CSV), notifikasi, pengaturan profil dan aturan peminjaman.

**Backend:** validasi Zod, bcrypt, JWT + RBAC, rate limiting, transaksi + kunci baris ruangan untuk mencegah bentrok (race condition), jumlah peserta divalidasi terhadap kapasitas, jam operasional WIB dan penutupan, antrean slot FIFO yang dipromosikan menjadi pengajuan saat memenuhi aturan, notifikasi dalam aplikasi dan email opsional, pengingat jadwal, penyelesaian otomatis booking yang sudah lewat.

**Sirkulasi yang transparan (mengacu standar "Elibrary" yang dipadankan ke ruangan):** batas booking dan antrean aktif per pengguna; check-in/check-out dengan penandaan `NO_SHOW` otomatis, poin pelanggaran, penangguhan sementara, dan layar "Poin & Sanksi Saya"; status ketersediaan serta panjang antrean tampil sebelum booking (web dan mobile); admin/dosen dapat melihat dan membatalkan antrean dengan alasan; notifikasi perubahan posisi antrean; peran PIMPINAN hanya-baca dengan dasbor pengadaan berbasis angka; unduhan bukti booking (PDF berkode verifikasi), kalender (`.ics`), dan riwayat (CSV); laporan dengan agregasi di database.

## Struktur folder

```
ruangku/
├── backend/      Express 5 + TypeScript + Prisma + Zod   (src/, prisma/, scripts/)
├── admin-web/    SvelteKit + Svelte 5 + TypeScript
└── mobile/       Flutter (Android) — lib/, test/, tool/
docs/             ERD, ringkasan API, workflow, deployment, dan akun demo
```

## Persyaratan

Node.js 20+ · MySQL 8 / MariaDB 10.6+ (XAMPP/Laragon) · Flutter 3.22+ (Dart 3.4+) dengan Android SDK untuk build APK.

## 1. Database & backend

```sh
# buat database (sekali saja)
mysql -u root -e "CREATE DATABASE ruangku_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

cd backend
cp .env.example .env          # lalu sesuaikan (jika sudah punya .env, pertahankan)
npm install
npx prisma migrate deploy     # menerapkan semua migration (aditif, data lama aman)
npx prisma generate
npm run build
npm run dev                   # http://localhost:3000
```

`backend/.env` (lihat [`backend/.env.example`](backend/.env.example)) wajib berisi `DATABASE_URL` dan `JWT_SECRET` acak minimal 32 karakter. `CORS_ORIGIN` wajib di production; `TRUST_PROXY` mengatur proxy tepercaya. Untuk email reset password dan notifikasi booking, atur `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, dan `APP_WEB_URL`. Semua variabel SMTP opsional; tanpa SMTP, tautan reset hanya dicetak ke log dalam development; email notifikasi hanya mencatat metadata pengiriman. Di production token reset tidak pernah dicatat dan backend memberi peringatan jika SMTP belum dikonfigurasi. Untuk compose, salin [`.env.example`](.env.example) ke `.env`. Jangan commit atau arsipkan `.env`.
Seed tidak membuat akun atau data demo secara default. Untuk mengaktifkannya secara eksplisit, atur kredensial seed sesuai [panduan akun demo](docs/demo-accounts.md), kemudian jalankan `npm run db:seed`. Seed tidak menimpa akun maupun data yang sudah ada.

## 2. Dashboard admin

```sh
cd admin-web
npm ci
npm run dev                   # http://localhost:5173
```

Alamat API: `VITE_API_URL` (lihat [`admin-web/.env.example`](admin-web/.env.example), bawaan `http://localhost:3000/api/v1`).

## 3. Aplikasi Flutter

Folder `mobile/` berisi kode Dart lengkap, tetapi **scaffolding Android (gradle, dsb.) dibuat oleh Flutter di komputer Anda**:

```sh
cd mobile
setup_android.bat                          # Windows: scaffold, patch manifest, dan pub get
# atau ./setup_android.sh pada shell POSIX
flutter analyze
flutter test

# emulator Android (10.0.2.2 = localhost komputer)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# HP asli (satu Wi-Fi dengan komputer; ganti dengan IP komputer Anda)
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1
```

### Build APK release

```sh
flutter build apk --release --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1
# hasil: mobile/build/app/outputs/flutter-apk/app-release.apk
```

Untuk produksi gunakan HTTPS dan hapus `usesCleartextTraffic` dari manifest.

## Akun demo

Tidak ada password demo bawaan dalam source. `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` membuat akun admin jika belum ada. `SEED_DEMO=true` mengaktifkan akun mahasiswa/dosen/PIMPINAN, ruangan, penugasan, dan booking contoh; password setiap akun demo ditentukan melalui environment (`SEED_DEMO_STUDENT_PASSWORD`, `SEED_DEMO_LECTURER_PASSWORD`, `SEED_DEMO_LEADERSHIP_PASSWORD`). Lihat [panduan lengkap akun demo](docs/demo-accounts.md). Admin membuat akun dosen dari menu **Dosen** dan akun PIMPINAN dari **Akun Pimpinan**.

## API (`/api/v1`)

Semua endpoint memakai prefix `/api/v1`. Respons error selalu `{ "success": false, "message": "…", "errors"?: {field: pesan} }`.

| Method | Path | Akses |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | publik (rate limit) |
| POST | `/auth/forgot-password` | publik (respons generik; rate limit IP dan email) |
| POST | `/auth/reset-password` | publik (token reset sekali pakai, berlaku 30 menit) |
| GET / POST | `/auth/me` / `/auth/logout` | login |
| GET / PUT | `/students/profile` | mahasiswa |
| GET | `/students/bookings`, `/students/notifications` | mahasiswa |
| PATCH | `/users/password` | login |
| GET | `/rooms` (`q, category, minCapacity, facility, sort=name\|capacity\|popular, page, pageSize`) | publik |
| GET | `/rooms/available?start=&end=` · `/rooms/categories` · `/rooms/:id` | publik |
| GET | `/rooms/:id/schedule?from=&to=` | publik |
| POST | `/bookings` | login |
| GET | `/bookings` · `/bookings/rules` · `/bookings/:id` | login / publik (rules) |
| PATCH | `/bookings/:id/cancel` (booking sendiri yang belum dimulai) | login |
| POST | `/bookings/:id/extensions` (permintaan perpanjangan milik sendiri) | login |
| GET / POST | `/bookings/waitlist` (lihat / bergabung antrean sendiri) | login |
| DELETE | `/bookings/waitlist/:id` | login (pemilik antrean) |
| GET / PATCH | `/notifications`, `/notifications/unread-count`, `/notifications/:id/read`, `/notifications/read-all` | login |
| GET | `/admin/dashboard`, `/admin/reports`, `/admin/reports/export` (CSV), `/admin/schedule`, `/admin/app-info` | admin |
| POST | `/admin/leaders` | admin (membuat akun PIMPINAN) |
| GET | `/admin/leaders` | admin |
| GET | `/leadership/overview` | PIMPINAN |
| GET | `/leadership/overview/export` (CSV) | PIMPINAN |
| GET | `/bookings/:id/receipt` (PDF), `/bookings/:id/calendar.ics`, `/bookings/my/export` (CSV) | pemilik booking (bukti/kalender juga admin) |
| GET | `/admin/bookings/verify?code=` | admin (memeriksa kode verifikasi bukti) |
| GET / PUT / DELETE | `/admin/settings/booking-rules` (kelola aturan atau pulihkan nilai `.env`) | admin |
| GET / PUT | `/admin/settings/operating-hours` (jam global 07:00–21:00, Senin–Sabtu) | admin |
| GET / PUT / DELETE | `/admin/rooms/:id/operating-hours` (override tujuh hari atau kembali ke global) | admin |
| GET / POST / PATCH / DELETE | `/admin/closures` dan `/admin/closures/:id` (filter tanggal/ruangan; pembatalan terdampak perlu `confirmAffected: true`) | admin |
| GET | `/admin/bookings`, `/admin/bookings/:id` | admin |
| PATCH | `/admin/bookings/:id/approve`, `/reject` (body `reason`), `/review`, `/cancel` | admin |
| GET / POST | `/admin/rooms` · GET/PATCH/DELETE `/admin/rooms/:id` · POST/DELETE `/admin/rooms/:id/photo` | admin |
| GET / PATCH | `/admin/students`, `/admin/students/:id`, `/admin/students/:id/status` | admin |
| GET / POST | `/admin/lecturers` | admin |
| PATCH / PUT | `/admin/lecturers/:id/status`, `/admin/lecturers/:id/rooms` | admin |
| GET / PATCH | `/admin/extensions`, `/admin/extensions/:id/review` | admin |
| GET | `/lecturer/dashboard`, `/lecturer/rooms`, `/lecturer/bookings`, `/lecturer/bookings/:id`, `/lecturer/extensions`, `/lecturer/reports`, `/lecturer/reports/export` | dosen (data dibatasi ke ruangan tugas) |
| PATCH | `/lecturer/bookings/:id/review`, `/lecturer/extensions/:id/review` | dosen (hanya ruangan tugas, bukan pengajuan sendiri) |

PIMPINAN diarahkan ke dasbor pengadaan dan hanya dapat membaca data. Middleware API menolak seluruh permintaan non-GET yang membawa token PIMPINAN. Dasbor menyajikan okupansi terhadap jam operasional, permintaan bentrok dan antrean, jam sibuk, rasio peserta/kapasitas, tingkat no-show/overstay, serta rekomendasi dengan dasar angka. Filter `lowUsageThreshold`, `highOccupancyThreshold`, dan `minimumDemand` dapat diatur pada query dasbor.

Catatan: nama endpoint disesuaikan dengan struktur yang sudah ada (prefix `/api/v1`, `PATCH` untuk persetujuan, dst.); `POST /auth/logout` bersifat stateless — klien membuang token.

## Aturan bisnis

- Bentrok: `existing.start < requested.end AND existing.end > requested.start`, dicek di backend dalam transaksi dengan kunci baris ruangan. PENDING dan APPROVED memblokir slot; REJECTED/CANCELLED tidak.
- Durasi booking mengikuti `BOOKING_MIN_MINUTES` (30) dan `BOOKING_MAX_HOURS` (8).
- Booking baru dan antrean wajib mencantumkan jumlah peserta minimal 1 dan tidak melebihi kapasitas ruangan. Kolom `attendees` nullable sehingga riwayat lama tetap terbaca.
- Jam global awal adalah 07:00–21:00 WIB, Senin–Sabtu; override per ruangan dapat diatur untuk tiap hari. Booking, perpanjangan, dan promosi antrean harus berada dalam jam operasional, tidak melintasi tengah malam, dan tidak mengenai penutupan.
- Admin dapat menjadwalkan penutupan untuk satu atau semua ruangan. Bila ada booking PENDING/APPROVED yang terdampak, API mengembalikan daftarnya dan tidak membatalkan sebelum konfirmasi eksplisit; setelah konfirmasi alasan dicatat dalam riwayat dan antrean diproses kembali.
- Admin dapat mengatur durasi booking dan batas hari ke depan dari Pengaturan; sebelum override disimpan, nilai `.env` tetap digunakan.
- Pemilik dapat membatalkan booking PENDING atau APPROVED yang belum dimulai. Admin dapat membatalkan dengan alasan; slot yang lepas memicu pemrosesan antrean berdasarkan urutan pengajuan.
- Antrean hanya dapat dibuat untuk slot yang bentrok. Saat slot tersedia, entri tertua yang memenuhi jadwal dipromosikan menjadi booking PENDING dan notifikasi dikirim.
- Perpanjangan hanya untuk booking APPROVED yang belum selesai; tambahan waktu dibatasi aturan durasi, dicek ulang terhadap konflik saat disetujui.
- Dosen hanya dapat meninjau booking/perpanjangan pada ruangan yang ditugaskan dan tidak dapat meninjau pengajuannya sendiri; admin dapat meninjau seluruh ruangan.
- Penolakan dan pembatalan oleh admin wajib beralasan; ruangan dengan riwayat booking atau antrean tidak bisa dihapus (nonaktifkan); akun nonaktif langsung ditolak di semua endpoint.
- Booking APPROVED yang waktunya lewat otomatis menjadi COMPLETED; pengingat dikirim `REMINDER_LEAD_MINUTES` sebelum mulai.
- Notifikasi email mengikuti preferensi `emailNotifications` akun, kecuali reset password yang selalu dikirim; akun nonaktif tidak menerima email. Kegagalan SMTP hanya masuk log server dan tidak membatalkan transaksi/notifikasi aplikasi.

## Pengujian

Tes integrasi API membuat/ubah data uji. Jalankan hanya pada database disposable yang tidak berisi data pengguna; jangan mengarahkannya ke production atau database bersama.

```sh
cd backend
npx prisma generate
npx tsc --noEmit
npx prisma validate
npm run test:unit
# API_URL dan kredensial admin/demo harus mengarah ke database uji disposable.
npm run test:api
npm run test:workflows
npm run test:mobile
# Alur reset + ketiga tes integrasi di atas pada database acak localhost yang dihapus setelah selesai.
npm run test:password-reset

cd ../admin-web
npm run check
npm run build
node scripts/auth-routing-test.mjs

cd ../mobile
flutter analyze
flutter test
```

`test:api` dan `test:mobile` meninggalkan beberapa fixture pada database yang dipakai; `test:workflows` membersihkan fixture uniknya. Baseline integrasi tercatat di CI/local handoff; gunakan schema MySQL terisolasi untuk mengulanginya.
`test:password-reset` membuat database bernama acak hanya jika `DATABASE_URL` menunjuk ke localhost, menjalankan migration dan seluruh tes API/workflow/mobile, lalu menghapus database sementara tersebut. Akun database uji memerlukan izin `CREATE DATABASE` dan `DROP DATABASE`; skrip menolak host non-lokal.

## Docker dan CI

Stack MySQL + backend + admin-web tersedia lewat `docker compose up --build -d`. Compose memakai volume persisten dan menjalankan `prisma migrate deploy` (bukan reset) sebelum backend start. Langkah deploy, health check, origin CORS, dan trust proxy dijelaskan di [panduan deployment](docs/deployment.md).

GitHub Actions menjalankan Prisma generate/validate, TypeScript, unit tests, backend build, Svelte check, role routing, dan build admin-web.

## Troubleshooting

- **Flutter "Tidak dapat terhubung ke server"** — emulator memakai `10.0.2.2`, HP asli memakai IP komputer; pastikan satu Wi-Fi dan firewall mengizinkan port 3000.
- **Aplikasi tidak bisa akses API di HP** — pastikan `dart run tool/patch_manifest.dart` sudah dijalankan (izin INTERNET).
- **`prisma migrate deploy` gagal** — periksa `DATABASE_URL` dan bahwa database sudah dibuat.
- **Login admin gagal** — periksa email/password yang sudah tersimpan. Seed hanya membuat akun admin dari `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` jika email belum ada; data akun yang ditemukan tidak diubah.
- **429 Terlalu banyak percobaan** — tunggu 15 menit (rate limit login/registrasi) atau restart backend saat pengembangan.
- **Foto ruangan tidak tampil di aplikasi** — pastikan `API_BASE_URL` memakai alamat yang bisa dijangkau perangkat (bukan `localhost`).
