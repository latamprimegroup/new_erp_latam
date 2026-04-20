-- Ads Tracker Módulo 06 — checkout tunnel + logs + tokens efémeros
-- Requer tabela tracker_offers (Módulo 05). Adiciona plataforma PERFECT_PAY.

ALTER TABLE `tracker_offers`
  MODIFY COLUMN `platform` ENUM('KIWIFY','HOTMART','EDUZZ','KIRVANO','PERFECT_PAY','OTHER') NOT NULL DEFAULT 'OTHER';

CREATE TABLE `tracker_checkout_settings` (
  `id` VARCHAR(191) NOT NULL,
  `offer_id` VARCHAR(191) NOT NULL,
  `forwarded_param_keys` JSON NOT NULL,
  `param_mode` ENUM('PRESERVE_ALL_INBOUND','ALLOWLIST_ONLY') NOT NULL DEFAULT 'ALLOWLIST_ONLY',
  `use_ephemeral_links` BOOLEAN NOT NULL DEFAULT false,
  `ephemeral_ttl_minutes` INT NOT NULL DEFAULT 60,
  `ephemeral_max_uses` INT NOT NULL DEFAULT 1,
  `pixel_backup_delay_ms` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_checkout_settings_offer_id_key` (`offer_id`),
  CONSTRAINT `tracker_checkout_settings_offer_id_fkey`
    FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_checkout_initiations` (
  `id` VARCHAR(191) NOT NULL,
  `offer_id` VARCHAR(191) NULL,
  `source_ip` VARCHAR(45) NOT NULL,
  `user_agent` VARCHAR(512) NULL,
  `referer` VARCHAR(2000) NULL,
  `from_google_ads` BOOLEAN NOT NULL DEFAULT false,
  `query_snapshot` JSON NULL,
  `outcome` ENUM(
    'REDIRECT_302',
    'OFFER_NOT_FOUND',
    'INVALID_CHECKOUT_URL',
    'TOKEN_EXPIRED',
    'TOKEN_EXHAUSTED',
    'OFFER_INACTIVE'
  ) NOT NULL,
  `via_ephemeral_token` BOOLEAN NOT NULL DEFAULT false,
  `pay_slug_or_token` VARCHAR(96) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tracker_checkout_initiations_offer_id_created_at_idx` (`offer_id`, `created_at`),
  CONSTRAINT `tracker_checkout_initiations_offer_id_fkey`
    FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_checkout_access_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `offer_id` VARCHAR(191) NOT NULL,
  `token` VARCHAR(32) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `use_count` INT NOT NULL DEFAULT 0,
  `max_uses` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_checkout_access_tokens_token_key` (`token`),
  INDEX `tracker_checkout_access_tokens_offer_id_idx` (`offer_id`),
  INDEX `tracker_checkout_access_tokens_token_expires_at_idx` (`token`, `expires_at`),
  CONSTRAINT `tracker_checkout_access_tokens_offer_id_fkey`
    FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
