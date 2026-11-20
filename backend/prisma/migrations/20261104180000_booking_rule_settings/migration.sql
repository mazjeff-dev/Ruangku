-- Store an optional admin-managed override; when the row is absent, application environment defaults remain active.
CREATE TABLE `BookingRuleSetting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `minMinutes` INTEGER NOT NULL,
    `maxHours` INTEGER NOT NULL,
    `maxDaysAhead` INTEGER NOT NULL,
    `updatedBy` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    CONSTRAINT `BookingRuleSetting_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
