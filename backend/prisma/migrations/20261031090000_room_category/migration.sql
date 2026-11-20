-- Migrasi aditif: kategori ruangan (untuk filter katalog) + indeks. Tidak menghapus data.
ALTER TABLE `Room` ADD COLUMN `category` VARCHAR(60) NULL;
CREATE INDEX `Room_category_idx` ON `Room`(`category`);
