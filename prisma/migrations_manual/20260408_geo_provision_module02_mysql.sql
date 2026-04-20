-- Geo-Provision (Módulo 02) + campos de sócio no InventoryId

ALTER TABLE `inventory_ids`
  ADD COLUMN `partner_legal_name` VARCHAR(300) NULL AFTER `photo_hash`,
  ADD COLUMN `partner_birth_date` DATE NULL AFTER `partner_legal_name`;

CREATE TABLE IF NOT EXISTS `geo_proxy_pool` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `label` VARCHAR(120) NULL,
  `city` VARCHAR(120) NULL,
  `state_uf` VARCHAR(4) NULL,
  `ddd` VARCHAR(3) NULL,
  `proxy_host` VARCHAR(255) NOT NULL,
  `proxy_port` VARCHAR(8) NOT NULL,
  `proxy_user` VARCHAR(200) NULL,
  `proxy_password_enc` TEXT NULL,
  `proxy_soft` VARCHAR(32) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `geo_proxy_pool_active_city_idx` (`active`, `city`),
  KEY `geo_proxy_pool_active_state_uf_idx` (`active`, `state_uf`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vault_industrial_units` (
  `id` CHAR(36) NOT NULL,
  `inventory_gmail_id` CHAR(36) NOT NULL,
  `inventory_cnpj_id` CHAR(36) NOT NULL,
  `inventory_id_id` CHAR(36) NULL,
  `ads_power_profile_id` VARCHAR(64) NULL,
  `status` ENUM('DRAFT', 'PROVISIONING', 'READY_FOR_WARMUP', 'FAILED') NOT NULL DEFAULT 'DRAFT',
  `geo_transition` BOOLEAN NOT NULL DEFAULT false,
  `anchor_city` VARCHAR(120) NULL,
  `anchor_state` VARCHAR(4) NULL,
  `matched_proxy_id` VARCHAR(191) NULL,
  `last_pipeline_logs` JSON NULL,
  `provision_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `vault_industrial_units_status_idx` (`status`),
  KEY `vault_industrial_units_inventory_gmail_id_idx` (`inventory_gmail_id`),
  CONSTRAINT `vault_industrial_units_inventory_gmail_id_fkey` FOREIGN KEY (`inventory_gmail_id`) REFERENCES `inventory_gmails` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `vault_industrial_units_inventory_cnpj_id_fkey` FOREIGN KEY (`inventory_cnpj_id`) REFERENCES `inventory_cnpjs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `vault_industrial_units_inventory_id_id_fkey` FOREIGN KEY (`inventory_id_id`) REFERENCES `inventory_ids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vault_industrial_units_matched_proxy_id_fkey` FOREIGN KEY (`matched_proxy_id`) REFERENCES `geo_proxy_pool` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
