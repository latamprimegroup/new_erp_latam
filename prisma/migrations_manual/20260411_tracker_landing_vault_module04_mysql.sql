-- Ads Tracker Módulo 04 — cofre de landings (operacional)
CREATE TABLE `tracker_landing_vault` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `primary_url` VARCHAR(2000) NOT NULL,
  `secondary_url` VARCHAR(2000) NULL,
  `stack` ENUM('HTML_PLAIN', 'WORDPRESS', 'ELEMENTOR', 'OTHER') NOT NULL DEFAULT 'HTML_PLAIN',
  `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `last_probe_ms_primary` INT NULL,
  `last_probe_ms_secondary` INT NULL,
  `last_probe_at` DATETIME(3) NULL,
  `script_hygiene_notes` TEXT NULL,
  `conversion_snapshot` JSON NULL,
  `ops_notes` VARCHAR(800) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `tracker_landing_vault_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_landing_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `vault_id` VARCHAR(191) NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_landing_tokens_token_key` (`token`),
  INDEX `tracker_landing_tokens_vault_id_idx` (`vault_id`),
  INDEX `tracker_landing_tokens_token_active_idx` (`token`, `active`),
  CONSTRAINT `tracker_landing_tokens_vault_id_fkey`
    FOREIGN KEY (`vault_id`) REFERENCES `tracker_landing_vault` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_landing_domain_migrations` (
  `id` VARCHAR(191) NOT NULL,
  `vault_id` VARCHAR(191) NOT NULL,
  `from_host` VARCHAR(253) NOT NULL,
  `to_host` VARCHAR(253) NOT NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tracker_landing_domain_migrations_vault_id_idx` (`vault_id`),
  CONSTRAINT `tracker_landing_domain_migrations_vault_id_fkey`
    FOREIGN KEY (`vault_id`) REFERENCES `tracker_landing_vault` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
