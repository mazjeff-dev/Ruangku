# Ringkasan API

Base URL: `http://localhost:3000/api/v1`. Semua endpoint mengembalikan JSON; endpoint terlindungi memakai `Authorization: Bearer <JWT>`. Respons error berbentuk `{ "success": false, "message": "...", "errors"?: { "field": "..." } }`.

| Area | Endpoint utama | Hak akses |
| --- | --- | --- |
| Autentikasi | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Registrasi/login publik; profil dan logout memerlukan sesi |
| Pemulihan password | `POST /auth/forgot-password`, `POST /auth/reset-password` | Publik; respons lupa password generik, token sekali pakai berlaku 30 menit |
| Profil dan mahasiswa | `GET/PUT /students/profile`, `GET /students/bookings`, `GET /students/notifications` | Mahasiswa |
| Ruangan | `GET /rooms`, `/rooms/categories`, `/rooms/available`, `/rooms/:id`, `/rooms/:id/schedule` | Publik; ketersediaan memperhitungkan jam buka dan penutupan |
| Booking | `POST/GET /bookings`, `GET /bookings/rules`, `GET /bookings/:id`, `PATCH /bookings/:id/cancel` | Pengguna login; booking baru wajib menyertakan `attendees` (integer minimal 1, maksimal kapasitas) |
| Antrean | `GET/POST /bookings/waitlist`, `DELETE /bookings/waitlist/:id` | Pengguna login; hanya antrean milik sendiri |
| Perpanjangan | `POST /bookings/:id/extensions` | Pengguna login; booking milik sendiri |
| Kuota dan sanksi | `GET /bookings/quota`, `GET /bookings/violations`, `POST /bookings/:id/check-in`, `POST /bookings/:id/check-out` | Pengguna login; kuota booking aktif, poin pelanggaran, dan kehadiran milik sendiri |
| Unduhan | `GET /bookings/:id/receipt` (PDF), `GET /bookings/:id/calendar.ics`, `GET /bookings/my/export` (CSV) | Pemilik booking (bukti dan kalender juga untuk `ADMIN`); bukti/kalender hanya untuk booking `APPROVED`/`COMPLETED` |
| Verifikasi bukti | `GET /admin/bookings/verify?code=RK-<id>-<8 hex>` | `ADMIN`; memeriksa keaslian kode pada bukti PDF (HMAC dengan `JWT_SECRET`) |
| Antrean (pengelola) | `GET /admin/waitlist`, `GET /lecturer/waitlist`, pembatalan entri dengan alasan | `ADMIN`; `DOSEN` hanya ruangan tugasnya |
| Pimpinan | `GET /leadership/overview`, `GET /leadership/overview/export`; akun dibuat lewat `POST /admin/leaders` | `PIMPINAN` (hanya-baca; semua rute non-GET ditolak 403) |
| Notifikasi | `/notifications`, `/notifications/unread-count`, `/notifications/:id/read`, `/notifications/read-all` | Pengguna login; hanya data sendiri |
| Admin | `/admin/dashboard`, `/bookings`, `/rooms`, `/students`, `/lecturers`, `/extensions`, `/reports`, `/schedule`, `/settings/booking-rules` | `ADMIN` |
| Jam operasional | `GET/PUT /admin/settings/operating-hours`, `GET/PUT/DELETE /admin/rooms/:id/operating-hours` | `ADMIN`; konfigurasi global dan override harian ruangan |
| Penutupan | `GET/POST /admin/closures`, `PATCH/DELETE /admin/closures/:id` | `ADMIN`; daftar mendukung filter tanggal dan ruangan. Pengajuan terdampak dikembalikan sebelum konfirmasi; kirim `confirmAffected: true` untuk membatalkannya |
| Dosen | `/lecturer/dashboard`, `/rooms`, `/bookings`, `/extensions`, `/reports` | `DOSEN`; data dan review dibatasi ke ruangan tugas |
| Password | `PATCH /users/password` | Pengguna login; wajib memverifikasi password saat ini |

Detail metode, filter, dan body tersedia di tabel API dalam [README](../README.md). Role ditentukan ulang dari database untuk setiap token, sehingga akun yang dinonaktifkan langsung kehilangan akses.

Jam global bawaan adalah 07:00–21:00 WIB, Senin–Sabtu. Booking, perpanjangan, dan promosi antrean harus berada di dalam jam operasional, tidak melintasi tengah malam, dan tidak mengenai penutupan. Jadwal dan tanggal closure memakai zona Asia/Jakarta; timestamp API disimpan dalam UTC.
`GET /rooms/available?start=&end=` serta `GET /rooms/:id/schedule?from=&to=` menyertakan informasi jam operasional dan penutupan agar klien dapat menjelaskan ketersediaan.
Email notifikasi dikirim secara asinkron sebagai tambahan notifikasi dalam aplikasi. SMTP yang gagal dicatat di log server dan tidak membuat transaksi booking gagal; akun nonaktif atau preferensi email mati dilewati (kecuali reset password).

Laporan (`GET /admin/reports`, `/lecturer/reports`) menghitung agregasi di database dan membatasi rentang maksimal 366 hari. CSV laporan memuat kolom check-in, check-out, overstay, dan poin pelanggaran; sel CSV disanitasi terhadap formula injection.
