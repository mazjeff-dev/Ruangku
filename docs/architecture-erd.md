# ERD RuangKu

Diagram berikut diringkas dari `backend/prisma/schema.prisma`. Semua waktu disimpan di UTC; API dan antarmuka menampilkan WIB.

```mermaid
erDiagram
  User {
    int id PK
    string name
    string email UK
    string password
    string nim UK
    UserRole role
    boolean isActive
    boolean emailNotifications
    datetime createdAt
    datetime updatedAt
  }
  Room {
    int id PK
    string name
    string code UK
    string location
    int capacity
    string category
    boolean isActive
    boolean isAvailable
  }
  RoomLecturer {
    int roomId PK, FK
    int userId PK, FK
    datetime assignedAt
  }
  Booking {
    int id PK
    int userId FK
    int roomId FK
    string title
    string purpose
    datetime startTime
    datetime endTime
    int attendees nullable
    BookingStatus status
    int reviewedBy FK
  }
  BookingQueue {
    int id PK
    int userId FK
    int roomId FK
    string title
    datetime startTime
    datetime endTime
    int attendees nullable
    BookingQueueStatus status
    int promotedBookingId UK, FK
  }
  BookingExtension {
    int id PK
    int bookingId FK
    int requestedBy FK
    datetime requestedEndTime
    BookingExtensionStatus status
    int reviewedBy FK
  }
  BookingLog {
    int id PK
    int bookingId FK
    int userId FK
    string action
    datetime createdAt
  }
  Notification {
    int id PK
    int userId FK
    int bookingId FK
    NotificationType type
    boolean isRead
    datetime createdAt
  }
  BookingRuleSetting {
    int id PK
    int minMinutes
    int maxHours
    int maxDaysAhead
    int updatedBy FK
  }
  PasswordResetToken {
    int id PK
    int userId FK
    string tokenHash UK
    datetime expiresAt
    datetime usedAt
    datetime createdAt
  }
  RoomOperatingHour {
    int id PK
    int roomId FK
    int dayOfWeek
    string openTime
    string closeTime
    boolean isClosed
  }
  GlobalOperatingHours {
    int id PK
    string openTime
    string closeTime
    string operatingDays
    datetime updatedAt
  }
  RoomClosure {
    int id PK
    int roomId FK nullable
    date startDate
    date endDate
    string reason
    int createdBy FK nullable
  }

  User ||--o{ Booking : makes
  Room ||--o{ Booking : reserved_for
  User o|--o{ Booking : reviews
  User ||--o{ RoomLecturer : assigned_to
  Room ||--o{ RoomLecturer : assigned_lecturers
  User ||--o{ BookingQueue : joins
  Room ||--o{ BookingQueue : queues
  Booking o|--o| BookingQueue : promoted_from
  Booking ||--o{ BookingExtension : extended_by
  User ||--o{ BookingExtension : requests
  User o|--o{ BookingExtension : reviews
  Booking ||--o{ BookingLog : records
  User ||--o{ BookingLog : acts
  User ||--o{ Notification : receives
  Booking o|--o{ Notification : relates_to
  User o|--o{ BookingRuleSetting : updates
  User ||--o{ PasswordResetToken : owns
  Room ||--o{ RoomOperatingHour : follows
  Room ||--o{ RoomClosure : may_have
  User o|--o{ RoomClosure : creates
```

`BookingRuleSetting` menggunakan baris singleton (`id = 1`) untuk override aturan booking; bila belum tersedia, backend memakai nilai environment.
`PasswordResetToken` hanya menyimpan hash SHA-256 token, kedaluwarsa setelah 30 menit, dan dihapus otomatis saat akun dihapus.
`Booking.attendees` dan `BookingQueue.attendees` nullable untuk menjaga kompatibilitas data lama; pengajuan baru wajib mengisinya dan nilainya tidak boleh melebihi kapasitas ruangan.
`GlobalOperatingHours` adalah konfigurasi singleton awal 07:00–21:00 WIB, Senin–Sabtu. `RoomOperatingHour` meng-override jam per ruangan dan hari (0=Minggu sampai 6=Sabtu). Semua jadwal serta tanggal penutupan dihitung dalam Asia/Jakarta; timestamp database tetap UTC.
`RoomClosure.roomId = null` berarti penutupan berlaku untuk seluruh ruangan. Penutupan yang menimpa booking aktif memerlukan konfirmasi eksplisit sebelum booking dibatalkan.
`User.emailNotifications` mengatur email notifikasi booking; email reset password selalu dikirim terlepas dari preferensi ini.

## Tambahan Fase 1–6

| Tabel / kolom | Keterangan |
| --- | --- |
| `BookingRuleSetting.maxActiveBookings`, `maxQueueEntries`, `gracePeriodMinutes`, `noShowPoints`, `overstayPoints`, `lateCancelPoints`, `suspendThreshold`, `suspendDays`, `lateCancelWindowMinutes` | Aturan kuota dan sanksi yang dapat diatur admin |
| `Booking.checkedInAt`, `checkedOutAt`, `overstayMinutes`, `attendanceRequired` | Data kehadiran; status baru `NO_SHOW` |
| `ViolationPoint` (`userId`, `bookingId`, `type`, `points`, `reason`, `waivedBy`, `waivedAt`, `waivedNote`) | Poin pelanggaran; indeks `(userId, waivedAt)` |
| `User.bookingBlockedUntil`; `UserRole.PIMPINAN` | Penangguhan booking; peran pimpinan hanya-baca |
| `RoomDemandLog` (`roomId`, `userId`, `startTime`, `endTime`, `reason`) | Permintaan yang ditolak karena bentrok; sumber data dasbor pengadaan |
| `BookingQueueLog` | Audit antrean (pembatalan staf, kedaluwarsa, perubahan posisi) |
| Indeks `Booking(userId, startTime)`, `Booking(startTime)`, `BookingQueue(status, endTime)` | Mempercepat riwayat, laporan periode, dan penjadwal antrean |
