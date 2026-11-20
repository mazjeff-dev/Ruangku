-- Indeks tambahan (aditif) untuk laporan periode, riwayat pengguna, dan penjadwal antrean.
CREATE INDEX `Booking_userId_startTime_idx` ON `Booking`(`userId`, `startTime`);
CREATE INDEX `Booking_startTime_idx` ON `Booking`(`startTime`);
CREATE INDEX `BookingQueue_status_endTime_idx` ON `BookingQueue`(`status`, `endTime`);
