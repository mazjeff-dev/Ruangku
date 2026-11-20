ALTER TABLE `Booking`
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `checkedInAt` DATETIME(3) NULL,
    ADD COLUMN `checkedOutAt` DATETIME(3) NULL,
    ADD COLUMN `overstayMinutes` INTEGER NULL,
    ADD COLUMN `attendanceRequired` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `User`
    ADD COLUMN `bookingBlockedUntil` DATETIME(3) NULL;

ALTER TABLE `Notification`
    MODIFY `type` ENUM(
        'BOOKING_SUBMITTED',
        'BOOKING_APPROVED',
        'BOOKING_REJECTED',
        'BOOKING_CANCELLED',
        'BOOKING_REMINDER',
        'BOOKING_WAITLIST_PROMOTED',
        'BOOKING_EXTENSION_REQUESTED',
        'BOOKING_EXTENSION_APPROVED',
        'BOOKING_EXTENSION_REJECTED',
        'VIOLATION_RECORDED',
        'BOOKING_BLOCKED',
        'BOOKING_UNBLOCKED',
        'QUEUE_POSITION_CHANGED',
        'QUEUE_EXPIRED'
    ) NOT NULL;

ALTER TABLE `BookingRuleSetting`
    ADD COLUMN `gracePeriodMinutes` INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN `noShowPoints` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `overstayPoints` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `lateCancelPoints` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `suspendThreshold` INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN `suspendDays` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `lateCancelWindowMinutes` INTEGER NOT NULL DEFAULT 30;

CREATE TABLE `ViolationPoint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `bookingId` INTEGER NOT NULL,
    `type` ENUM('NO_SHOW', 'OVERSTAY', 'LATE_CANCEL') NOT NULL,
    `points` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `waivedBy` INTEGER NULL,
    `waivedAt` DATETIME(3) NULL,
    `waivedNote` VARCHAR(500) NULL,

    INDEX `ViolationPoint_userId_waivedAt_idx`(`userId`, `waivedAt`),
    INDEX `ViolationPoint_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ViolationPoint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ViolationPoint_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ViolationPoint_waivedBy_fkey` FOREIGN KEY (`waivedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
