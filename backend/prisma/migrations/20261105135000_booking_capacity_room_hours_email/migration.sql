ALTER TABLE `Booking`
    ADD COLUMN `attendees` INTEGER NULL;

ALTER TABLE `BookingQueue`
    ADD COLUMN `attendees` INTEGER NULL;

ALTER TABLE `User`
    ADD COLUMN `emailNotifications` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `RoomOperatingHour` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `openTime` VARCHAR(5) NOT NULL,
    `closeTime` VARCHAR(5) NOT NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    UNIQUE INDEX `RoomOperatingHour_roomId_dayOfWeek_key`(`roomId`, `dayOfWeek`),
    INDEX `RoomOperatingHour_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `RoomOperatingHour_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GlobalOperatingHours` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `openTime` VARCHAR(5) NOT NULL,
    `closeTime` VARCHAR(5) NOT NULL,
    `operatingDays` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `GlobalOperatingHours` (`id`, `openTime`, `closeTime`, `operatingDays`, `updatedAt`)
VALUES (1, '07:00', '21:00', '1,2,3,4,5,6', CURRENT_TIMESTAMP(3));

CREATE TABLE `RoomClosure` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `RoomClosure_roomId_startDate_endDate_idx`(`roomId`, `startDate`, `endDate`),
    PRIMARY KEY (`id`),
    CONSTRAINT `RoomClosure_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `RoomClosure_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
