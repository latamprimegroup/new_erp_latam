-- Registro permanente de CNPJs já processados (bloqueia recadastro após exclusão).
CREATE TABLE IF NOT EXISTS `ads_core_cnpj_registry` (
  `cnpj` VARCHAR(14) NOT NULL,
  `producer_id` VARCHAR(191) NULL,
  `producer_name` VARCHAR(200) NULL,
  `processed_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`cnpj`),
  KEY `ads_core_cnpj_registry_producer_id_idx` (`producer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
