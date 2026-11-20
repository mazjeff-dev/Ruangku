-- Add DOSEN as a role and create explicit room assignments without modifying existing records.
ALTER TABLE `User`
    MODIFY COLUMN `role` ENUM('STUDENT', 'ADMIN', 'DOSEN') NOT NULL DEFAULT 'STUDENT';

CREATE TABLE `RoomLecturer` (
    `roomId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`roomId`, `userId`),
    INDEX `RoomLecturer_userId_idx` (`userId`),
    CONSTRAINT `RoomLecturer_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `RoomLecturer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
