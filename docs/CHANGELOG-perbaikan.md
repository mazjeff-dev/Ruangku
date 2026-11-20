# Catatan perubahan: standar sirkulasi transparan (acuan Elibrary → ruangan)

Dokumen ini merangkum seluruh perbaikan Fase 1–7. Fase 1–4 dikerjakan sebelumnya dengan agen coding dan diteruskan di sini; Fase 5–7 serta perbaikan tes dikerjakan pada putaran terakhir.

## Fase 1 — Kuota booking aktif
`maxActiveBookings` dan `maxQueueEntries` (dapat diatur admin), dicek dalam transaksi setelah mengunci baris pengguna (aman dari permintaan serentak).

## Fase 2 — Kehadiran dan sanksi
Check-in/check-out, `NO_SHOW` otomatis (penjadwal 60 detik) yang melepas slot dan mempromosikan antrean, overstay, `ViolationPoint`, penangguhan (`bookingBlockedUntil`), waive oleh admin, layar "Poin & Sanksi Saya" (web dan mobile), notifikasi pelanggaran.

## Fase 3 — Antrean terlihat
`waitlistCount`, `myWaitlistPosition`, dan `availability` di daftar/detail ruangan; gabung antrean dari web dan mobile; daftar antrean dan pembatalan beralasan oleh admin/dosen (ruangan tugas); notifikasi `QUEUE_POSITION_CHANGED` dan `QUEUE_EXPIRED`.

## Fase 4 — Peran PIMPINAN
Peran hanya-baca (non-GET ditolak 403), akun dibuat admin, `/leadership` dengan okupansi, ruangan sering penuh/jarang dipakai, jam sibuk, rasio kapasitas, top pengguna (mahasiswa dan dosen), no-show/overstay, rekomendasi berdasar angka, ekspor CSV; `RoomDemandLog`.

## Fase 5 — Unduhan (baru)
- `GET /bookings/:id/receipt`: bukti booking PDF dengan kode verifikasi `RK-<id>-<8 hex>` (HMAC dengan `JWT_SECRET`). Dibuat tanpa dependensi baru (`src/lib/pdf.ts`).
- `GET /bookings/:id/calendar.ics`: acara kalender dengan pengingat 30 menit (`src/lib/ics.ts`).
- `GET /bookings/my/export`: riwayat pribadi CSV.
- `GET /admin/bookings/verify?code=`: admin memeriksa keaslian kode.
- Hanya pemilik (dan admin untuk bukti/kalender); bukti/kalender hanya untuk booking `APPROVED`/`COMPLETED`; milik orang lain → 404.
- CSV admin kini memuat check-in, check-out, overstay, dan poin pelanggaran; `csvCell` dipindah ke `src/lib/csv.ts` dan dipakai bersama.
- Web: tombol "Bukti (PDF)" dan "Kalender (.ics)" di detail booking, "Unduh riwayat (CSV)" di halaman peminjaman mahasiswa.
- Mobile: tombol "Bukti (PDF)" dan "Kalender" di detail booking (berbagi lewat lembar bagikan sistem). **Menambah dependensi `path_provider` dan `share_plus` di `pubspec.yaml`: jalankan `flutter pub get`.**

## Fase 6 — Kecepatan
- `GET /admin/reports` dan `/lecturer/reports` kini menghitung agregasi di database (`src/lib/report-aggregates.ts`), bukan memuat semua baris ke memori. Bentuk respons tidak berubah.
- Migrasi indeks `20261111090000_report_performance_indexes`: `Booking(userId, startTime)`, `Booking(startTime)`, `BookingQueue(status, endTime)`.

## Fase 7 — Kelengkapan dan dokumentasi
README, `docs/api.md`, `docs/booking-workflows.md`, dan `docs/architecture-erd.md` diperbarui.

## Perbaikan tes
- `smoke-test.mjs`: jadwal tidak lagi memakai `hoursFromNow()` (rapuh terhadap jam operasional); memakai slot hari kerja pada jam 07.00–21.00 WIB.
- `mobile-contract-test.mjs`: membersihkan booking ujinya sendiri di awal dan akhir (agar kuota booking aktif tidak penuh), berhenti dengan pesan jelas bila booking uji gagal dibuat. Batas kuota tidak diubah.
- `workflow-test.mjs`: tes baru untuk unduhan (PDF/ICS/CSV, otorisasi, kode verifikasi asli vs diubah), konsistensi laporan dengan hitungan manual dari tabel `Booking`, dan angka dasbor pimpinan (no-show, selesai, overstay, jam terpakai ruangan).
- `src/lib/downloads.test.ts`: 8 tes unit untuk CSV, PDF, ICS, dan kode verifikasi.

## Perbaikan susulan (laporan galat 403 dan 500 di admin web)
- **403 lalu keluar sendiri di `/leadership`:** menu "Dasbor Pengadaan" tampil di sidebar admin, tetapi API hanya mengizinkan PIMPINAN; respons 403 memicu logout otomatis. Kini `authorizeLeadership` mengizinkan PIMPINAN dan ADMIN (endpoint hanya GET); mahasiswa dan dosen tetap 403. Tes ditambahkan.
- **500 `Cannot read properties of undefined (reading 'name')` di halaman Peminjaman admin:** saat berpindah tab Peminjaman/Antrean, `view` berubah sebelum `rows` dimuat ulang, sehingga baris lama dibaca dengan field yang salah (`user` vs `student`). Kini baris dikosongkan saat berpindah tab dan pembacaan pemohon dibuat aman.
- **Dua menu sidebar menyala bersamaan ("Akun Pimpinan" dan "Dasbor Pengadaan"):** penentuan menu aktif memakai `startsWith`, dan `/leadership` diawali `/leaders`. Kini pencocokan persis atau sebagai sub-halaman (`href + '/'`).
- **Teks tidak rapi di kartu Dasbor Pengadaan** ("Belum ada booking..." menempel di tepi kiri): isi kartu di bawah judul tidak punya padding. Ditambahkan padding 22px seperti halaman Laporan.
