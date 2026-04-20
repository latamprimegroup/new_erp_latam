-- Vínculo produtor × nicho ADS CORE (atribuição filtrada).
-- Sem linhas para um niche_id = todos os produtores podem ser atribuídos.

CREATE TABLE IF NOT EXISTS `ads_core_producer_niches` (
  `id` VARCHAR(191) NOT NULL,
  `niche_id` VARCHAR(191) NOT NULL,
  `producer_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ads_core_producer_niches_niche_id_producer_id_key` (`niche_id`, `producer_id`),
  KEY `ads_core_producer_niches_producer_id_idx` (`producer_id`),
  CONSTRAINT `ads_core_producer_niches_niche_id_fkey` FOREIGN KEY (`niche_id`) REFERENCES `ads_core_niches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ads_core_producer_niches_producer_id_fkey` FOREIGN KEY (`producer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
