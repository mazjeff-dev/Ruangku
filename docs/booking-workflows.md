# Alur booking, antrean, dan perpanjangan

## Booking dan persetujuan

1. Pengguna login, memilih ruangan, tanggal, waktu, jumlah peserta, dan tujuan.
2. Backend memvalidasi waktu mulai/selesai, durasi, batas hari, status ruangan, jumlah peserta (minimal 1 dan tidak melebihi kapasitas), jam operasional, serta penutupan.
3. Backend mengunci baris ruangan di transaksi, memeriksa kapasitas dan tumpang tindih interval, lalu menyimpan pengajuan `PENDING`.
4. Admin dapat memproses seluruh ruangan. Dosen hanya dapat menyetujui/menolak pengajuan untuk ruangan yang ditugaskan kepadanya dan bukan pengajuan miliknya sendiri.
5. Persetujuan menghasilkan `APPROVED`; penolakan menghasilkan `REJECTED` dan mewajibkan alasan. Pemohon menerima notifikasi dalam aplikasi dan, jika diaktifkan, email.

Interval berkonflik bila `slotLama.mulai < slotBaru.selesai` dan `slotLama.selesai > slotBaru.mulai`; waktu yang bersebelahan tepat diperbolehkan. Booking `PENDING` dan `APPROVED` menghalangi slot yang sama.

## Pembatalan dan antrean

- Pemilik dapat membatalkan booking `PENDING` atau `APPROVED` sebelum waktu mulai. Admin membatalkan dengan alasan.
- Antrean hanya menerima permintaan untuk slot yang saat itu bertabrakan. Posisi antrean dihitung berdasarkan waktu pendaftaran dan ID.
- Saat slot dilepas, backend mengunci ruangan dan memeriksa antrean dari yang tertua. Entri yang memenuhi syarat dipromosikan menjadi booking `PENDING`, lalu pemohon dan pihak peninjau diberi notifikasi.
- Antrean menyimpan jumlah peserta dan saat dipromosikan divalidasi ulang terhadap kapasitas, jam operasional, penutupan, serta konflik slot.
- Pengguna dapat membatalkan entri antrean selama statusnya masih `WAITING`.

## Jam operasional dan penutupan

- Jam global awal adalah 07:00–21:00 WIB, Senin–Sabtu; admin dapat mengubahnya dan mengatur override tiap hari untuk ruangan tertentu.
- Bila override per ruangan belum diatur, jam global berlaku. Tanggal dan jam dihitung dalam Asia/Jakarta sementara timestamp disimpan UTC.
- Seluruh rentang booking dan perpanjangan harus berada dalam jam buka. Booking yang melewati tengah malam atau terkena tanggal penutupan ditolak dengan alasan yang ditampilkan kepada pengguna.
- Admin dapat menjadwalkan penutupan pada satu ruangan atau semua ruangan. Jika ada booking `PENDING`/`APPROVED` yang terdampak, perubahan meminta konfirmasi eksplisit; setelah dikonfirmasi booking dibatalkan dengan alasan penutupan, dicatat di `BookingLog`, dan slot antreannya diproses.
- Jadwal dan ketersediaan ruangan menyertakan informasi jam operasional serta penutupan mendatang.

## Perpanjangan

- Pemilik booking `APPROVED` yang belum selesai dapat meminta waktu akhir baru.
- Backend menolak waktu akhir yang tidak lebih lama, melewati aturan maksimum, atau berbenturan dengan booking lain. Hanya satu permintaan `PENDING` diizinkan per booking.
- Dosen yang ditugaskan atau admin dapat menerima/menolak permintaan. Waktu booking diperbarui hanya saat disetujui; pemohon menerima notifikasi hasil.
- Perpanjangan yang disetujui juga harus tetap berada dalam jam operasional dan tidak boleh melewati penutupan.

Status booking: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. Riwayat perubahan disimpan sebagai `BookingLog`. Email notifikasi bersifat tambahan terhadap notifikasi dalam aplikasi; kegagalan SMTP dicatat di server dan tidak membatalkan aksi booking.

## Kuota booking aktif

- Setiap pengguna dibatasi `maxActiveBookings` (booking `PENDING`/`APPROVED` yang belum lewat) dan `maxQueueEntries` (antrean `WAITING`). Batas diatur admin di Pengaturan > Aturan peminjaman.
- Pengecekan dilakukan di dalam transaksi yang sama dengan penyimpanan dan setelah mengunci baris pengguna, sehingga dua permintaan serentak tidak dapat melewati batas. Promosi antrean juga menghormati kuota.

## Kehadiran dan sanksi keterlambatan

1. Booking `APPROVED` dapat di-check-in mulai 10 menit sebelum waktu mulai hingga `gracePeriodMinutes` setelah mulai, dan di-check-out setelah check-in.
2. Penjadwal server (setiap 60 detik) menandai booking yang tidak di-check-in sampai batas toleransi sebagai `NO_SHOW`, melepas slot, dan mempromosikan antrean. Booking yang selesai tetapi check-out-nya melewati `endTime` mencatat `overstayMinutes`.
3. Pelanggaran (`NO_SHOW`, `OVERSTAY`, `LATE_CANCEL`) menghasilkan `ViolationPoint` dengan bobot yang dapat diatur. Bila total poin aktif mencapai `suspendThreshold`, `User.bookingBlockedUntil` diisi dan pembuatan booking/antrean ditolak sampai tanggal itu.
4. Pengguna melihat total poin, riwayat beserta alasan, dan tanggal berakhirnya penangguhan di layar "Poin & Sanksi Saya" (web dan mobile). Admin dapat membatalkan poin (waive) dengan catatan wajib; penangguhan dihitung ulang.
5. Notifikasi: `VIOLATION_RECORDED`, `BOOKING_BLOCKED`, `BOOKING_UNBLOCKED`.

## Antrean yang terlihat

- Daftar dan detail ruangan menyertakan `waitlistCount`, posisi pengguna (`myWaitlistPosition`), dan `availability` untuk waktu yang dipilih.
- Admin dan dosen (ruangan tugasnya) dapat melihat dan membatalkan entri antrean dengan alasan wajib; pembatalan tercatat di `BookingQueueLog` dan pemilik diberi notifikasi.
- Notifikasi `QUEUE_POSITION_CHANGED` hanya dikirim saat posisi benar-benar berubah; `QUEUE_EXPIRED` dikirim sekali untuk antrean yang slotnya sudah lewat.

## Unduhan untuk pemilik booking

- Bukti PDF memuat kode verifikasi `RK-<id>-<8 hex>` yang ditandatangani HMAC; admin dapat memeriksanya lewat `GET /admin/bookings/verify`. Berkas kalender `.ics` menyertakan pengingat 30 menit. Riwayat pribadi dapat diekspor sebagai CSV.
