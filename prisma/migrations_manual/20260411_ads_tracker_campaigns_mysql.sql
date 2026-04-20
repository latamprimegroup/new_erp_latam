-- Ads Ativos Tracker — Módulo 01: Central de Campanhas
CREATE TABLE `ads_tracker_campaigns` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(300) NOT NULL,
  `uni_id` CHAR(36) NOT NULL,
  `landing_url` VARCHAR(2000) NOT NULL,
  `domain_host` VARCHAR(253) NOT NULL,
  `proxy_host_key` VARCHAR(400) NULL,
  `gclid_tracking_required` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `emergency_contingency` BOOLEAN NOT NULL DEFAULT false,
  `click_total` INT NOT NULL DEFAULT 0,
  `gclid_captured` INT NOT NULL DEFAULT 0,
  `last_latency_ms` INT NULL,
  `last_latency_checked_at` DATETIME(3) NULL,
  `safe_browsing_status` VARCHAR(32) NULL,
  `safe_browsing_detail` VARCHAR(500) NULL,
  `safe_browsing_checked_at` DATETIME(3) NULL,
  `edge_webhook_override_url` VARCHAR(800) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ads_tracker_campaigns_domain_host_idx` (`domain_host`),
  INDEX `ads_tracker_campaigns_proxy_host_key_idx` (`proxy_host_key`),
  INDEX `ads_tracker_campaigns_uni_id_idx` (`uni_id`),
  INDEX `ads_tracker_campaigns_status_idx` (`status`),
  CONSTRAINT `ads_tracker_campaigns_uni_id_fkey`
    FOREIGN KEY (`uni_id`) REFERENCES `vault_industrial_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
