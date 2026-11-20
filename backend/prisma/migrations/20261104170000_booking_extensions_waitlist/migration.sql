-- Add extension requests and an ordered waitlist without removing booking history.
ALTER TABLE `Notification`
    MODIFY COLUMN `type` ENUM(
        'BOOKING_SUBMITTED',
        'BOOKING_APPROVED',
        'BOOKING_REJECTED',
        'BOOKING_CANCELLED',
        'BOOKING_REMINDER',
        'BOOKING_WAITLIST_PROMOTED',
        'BOOKING_EXTENSION_REQUESTED',
        'BOOKING_EXTENSION_APPROVED',
        'BOOKING_EXTENSION_REJECTED'
    ) NOT NULL;

CREATE TABLE `BookingQueue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `roomId` INTEGER NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `purpose` TEXT NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `status` ENUM('WAITING', 'PROMOTED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `promotedBookingId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BookingQueue_promotedBookingId_key` (`promotedBookingId`),
    INDEX `BookingQueue_roomId_status_createdAt_idx` (`roomId`, `status`, `createdAt`),
    INDEX `BookingQueue_userId_status_createdAt_idx` (`userId`, `status`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `BookingQueue_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `BookingQueue_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `BookingQueue_promotedBookingId_fkey` FOREIGN KEY (`promotedBookingId`) REFERENCES `Booking` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BookingExtension` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `requestedBy` INTEGER NOT NULL,
    `requestedEndTime` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedBy` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BookingExtension_bookingId_status_createdAt_idx` (`bookingId`, `status`, `createdAt`),
    INDEX `BookingExtension_requestedBy_createdAt_idx` (`requestedBy`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `BookingExtension_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `BookingExtension_requestedBy_fkey` FOREIGN KEY (`requestedBy`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `BookingExtension_reviewedBy_fkey` FOREIGN KEY (`reviewedBy`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
