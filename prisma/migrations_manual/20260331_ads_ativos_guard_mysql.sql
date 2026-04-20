-- Ads Ativos Guard — tabelas tb_blacklist_terms, tb_compliance_history, tb_compliance_scan_jobs, tb_google_ads_policy_snapshots
-- Ajuste tipos se a sua base não for MySQL 8+.

CREATE TABLE IF NOT EXISTS `tb_blacklist_terms` (
  `id` VARCHAR(191) NOT NULL,
  `term` VARCHAR(200) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `category` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `tb_blacklist_terms_term_key`(`term`),
  INDEX `tb_blacklist_terms_active_idx`(`active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_compliance_history` (
  `id` VARCHAR(191) NOT NULL,
  `tipo_midia` VARCHAR(16) NOT NULL,
  `score_risco` INTEGER NOT NULL,
  `termos_detectados` JSON NOT NULL,
  `status_final_google` VARCHAR(64) NULL,
  `summary` TEXT NULL,
  `suggested_rewrites` JSON NULL,
  `layers` JSON NULL,
  `stock_account_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tb_compliance_history_tipo_midia_created_at_idx`(`tipo_midia`, `created_at`),
  INDEX `tb_compliance_history_stock_account_id_idx`(`stock_account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_compliance_scan_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `tipo_midia` VARCHAR(16) NOT NULL,
  `temp_path` VARCHAR(500) NULL,
  `result_json` JSON NULL,
  `error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `tb_compliance_scan_jobs_status_created_at_idx`(`status`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_google_ads_policy_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `source_url` VARCHAR(500) NOT NULL,
  `content_hash` VARCHAR(64) NOT NULL,
  `normalized_text` LONGTEXT NOT NULL,
  `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tb_google_ads_policy_snapshots_fetched_at_idx`(`fetched_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK opcional (descomente se stock_account_id existir e for seguro na sua base)
-- ALTER TABLE `tb_compliance_history` ADD CONSTRAINT `tb_compliance_history_stock_account_id_fkey`
--   FOREIGN KEY (`stock_account_id`) REFERENCES `stock_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
