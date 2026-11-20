ALTER TABLE `User`
    MODIFY COLUMN `role` ENUM('STUDENT', 'ADMIN', 'DOSEN', 'PIMPINAN') NOT NULL DEFAULT 'STUDENT';

CREATE TABLE `RoomDemandLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `userId` INTEGER NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RoomDemandLog_roomId_createdAt_idx`(`roomId`, `createdAt`),
    INDEX `RoomDemandLog_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `RoomDemandLog_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `RoomDemandLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
