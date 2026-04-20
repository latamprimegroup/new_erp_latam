-- Execute após atualizar schema.prisma e alinhar com o banco (MySQL).
CREATE TABLE IF NOT EXISTS `ads_core_niche_allowed_cnaes` (
  `id` VARCHAR(191) NOT NULL,
  `nicho_id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ads_core_niche_allowed_cnaes_nicho_id_code_key` (`nicho_id`, `code`),
  KEY `ads_core_niche_allowed_cnaes_nicho_id_idx` (`nicho_id`),
  CONSTRAINT `ads_core_niche_allowed_cnaes_nicho_id_fkey` FOREIGN KEY (`nicho_id`) REFERENCES `ads_core_niches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
