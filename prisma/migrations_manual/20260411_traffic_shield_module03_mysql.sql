-- Ads Tracker — Traffic Shield (WAF / política de borda; sem cloaking)
CREATE TABLE `traffic_shield_settings` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default',
  `block_datacenter_asns` BOOLEAN NOT NULL DEFAULT false,
  `require_click_id_param` BOOLEAN NOT NULL DEFAULT false,
  `push_environment_hints` BOOLEAN NOT NULL DEFAULT false,
  `edge_webhook_url` VARCHAR(800) NULL,
  `last_push_at` DATETIME(3) NULL,
  `last_push_ok` BOOLEAN NOT NULL DEFAULT false,
  `last_push_error` VARCHAR(500) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `traffic_shield_settings` (`id`, `updated_at`)
VALUES ('default', NOW(3));

CREATE TABLE `traffic_shield_access_logs` (
  `id` VARCHAR(191) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `country` VARCHAR(8) NULL,
  `region` VARCHAR(80) NULL,
  `user_agent` VARCHAR(600) NULL,
  `referer` VARCHAR(1200) NULL,
  `gclid_present` BOOLEAN NOT NULL DEFAULT false,
  `verdict` VARCHAR(24) NOT NULL,
  `reason` VARCHAR(300) NULL,
  `asn` VARCHAR(32) NULL,
  `context_key` VARCHAR(120) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `traffic_shield_access_logs_created_at_idx` (`created_at`),
  INDEX `traffic_shield_access_logs_ip_created_at_idx` (`ip`, `created_at`),
  INDEX `traffic_shield_access_logs_verdict_created_at_idx` (`verdict`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `traffic_shield_ip_blocks` (
  `id` VARCHAR(191) NOT NULL,
  `cidr_or_ip` VARCHAR(64) NOT NULL,
  `note` VARCHAR(400) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `traffic_shield_ip_blocks_cidr_or_ip_key` (`cidr_or_ip`),
  INDEX `traffic_shield_ip_blocks_active_idx` (`active`),
  CONSTRAINT `traffic_shield_ip_blocks_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
