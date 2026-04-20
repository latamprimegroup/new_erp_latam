-- Gatekeeper / Cofre — tabelas de ingestão blindada (Módulo 01)
-- Executar manualmente no MySQL 8+ após revisão.

CREATE TABLE IF NOT EXISTS `inventory_gmails` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `password_enc` TEXT NOT NULL,
  `session_cookies` TEXT NULL,
  `gmail_safra` VARCHAR(64) NULL,
  `status` ENUM('AVAILABLE', 'IN_USE', 'BURNED') NOT NULL DEFAULT 'AVAILABLE',
  `two_fa_enc` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_gmails_email_key` (`email`),
  KEY `inventory_gmails_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_ids` (
  `id` CHAR(36) NOT NULL,
  `full_name` VARCHAR(300) NOT NULL,
  `cpf` VARCHAR(14) NOT NULL,
  `doc_urls` JSON NULL,
  `photo_hash` VARCHAR(32) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_ids_cpf_key` (`cpf`),
  UNIQUE KEY `inventory_ids_photo_hash_key` (`photo_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_cnpjs` (
  `id` CHAR(36) NOT NULL,
  `cnpj` VARCHAR(14) NOT NULL,
  `razao_social` VARCHAR(500) NULL,
  `cnae` VARCHAR(20) NULL,
  `niche_inferred` VARCHAR(120) NULL,
  `geofencing` JSON NULL,
  `situacao_rf` VARCHAR(40) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_cnpjs_cnpj_key` (`cnpj`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_cards` (
  `id` CHAR(36) NOT NULL,
  `card_pan_hash` VARCHAR(64) NOT NULL,
  `card_pan_enc` TEXT NOT NULL,
  `holder_name` VARCHAR(200) NULL,
  `status` ENUM('AVAILABLE', 'IN_USE', 'BURNED') NOT NULL DEFAULT 'AVAILABLE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_cards_card_pan_hash_key` (`card_pan_hash`),
  KEY `inventory_cards_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
