-- War Room OS: notas técnicas + snapshot de IDs na venda (MySQL 8+)

CREATE TABLE IF NOT EXISTS `client_technical_notes` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `author_id` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `client_technical_notes_client_id_created_at_idx` (`client_id`, `created_at`),
  CONSTRAINT `client_technical_notes_client_id_fkey`
    FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `client_technical_notes_author_id_fkey`
    FOREIGN KEY (`author_id`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ajuste o nome da tabela de pedidos se o @@map for diferente no seu banco (ex.: `Order`).
ALTER TABLE `Order`
  ADD COLUMN `delivered_asset_ids_json` JSON NULL;
