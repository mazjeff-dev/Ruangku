-- Keep queue notification types explicit in an additive migration.
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
        'BOOKING_EXTENSION_REJECTED',
        'VIOLATION_RECORDED',
        'BOOKING_BLOCKED',
        'BOOKING_UNBLOCKED',
        'QUEUE_POSITION_CHANGED',
        'QUEUE_EXPIRED'
    ) NOT NULL;

CREATE TABLE `BookingQueueLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `queueId` INTEGER NOT NULL,
    `actorId` INTEGER NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingQueueLog_queueId_createdAt_idx`(`queueId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `BookingQueueLog_queueId_fkey` FOREIGN KEY (`queueId`) REFERENCES `BookingQueue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `BookingQueueLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
