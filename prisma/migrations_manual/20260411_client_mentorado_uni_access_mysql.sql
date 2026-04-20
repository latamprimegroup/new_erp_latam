-- Mentorado Ads Ativos — ligação cliente ↔ UNI (War Room). MySQL 8+

CREATE TABLE `client_mentorado_uni_access` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `uni_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_mentorado_uni_access_client_id_uni_id_key` (`client_id`, `uni_id`),
  KEY `client_mentorado_uni_access_uni_id_idx` (`uni_id`),
  CONSTRAINT `client_mentorado_uni_access_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `client_mentorado_uni_access_uni_id_fkey` FOREIGN KEY (`uni_id`) REFERENCES `vault_industrial_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
