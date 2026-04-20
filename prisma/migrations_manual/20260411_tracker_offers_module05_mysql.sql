-- Ads Tracker Módulo 05 — ofertas S2S + sinais de venda
CREATE TABLE `tracker_offers` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `platform` ENUM('KIWIFY', 'HOTMART', 'EDUZZ', 'KIRVANO', 'PERFECT_PAY', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `status` ENUM('ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `postback_public_token` VARCHAR(48) NOT NULL,
  `webhook_secret` VARCHAR(128) NOT NULL,
  `click_id_field` VARCHAR(120) NOT NULL DEFAULT 'auto',
  `checkout_target_url` VARCHAR(2000) NOT NULL,
  `pay_slug` VARCHAR(80) NOT NULL,
  `google_offline_delay_minutes` INT NOT NULL DEFAULT 120,
  `last_webhook_at` DATETIME(3) NULL,
  `last_webhook_ok` BOOLEAN NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_offers_postback_public_token_key` (`postback_public_token`),
  UNIQUE INDEX `tracker_offers_pay_slug_key` (`pay_slug`),
  INDEX `tracker_offers_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_offer_sale_signals` (
  `id` VARCHAR(191) NOT NULL,
  `offer_id` VARCHAR(191) NOT NULL,
  `dedupe_key` VARCHAR(64) NOT NULL,
  `platform_order_id` VARCHAR(200) NULL,
  `amount_gross` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'BRL',
  `payment_state` ENUM('APPROVED', 'BOLETO_PENDING', 'PIX_PENDING', 'CHARGEBACK', 'REFUNDED', 'UNKNOWN') NOT NULL,
  `gclid` VARCHAR(512) NULL,
  `payload_snapshot` JSON NULL,
  `source_ip` VARCHAR(45) NOT NULL DEFAULT '',
  `ip_trust` ENUM('ALLOWLIST_DISABLED', 'ALLOWLIST_OK', 'ALLOWLIST_FAIL') NOT NULL,
  `signature_valid` BOOLEAN NOT NULL DEFAULT false,
  `counted_for_revenue` BOOLEAN NOT NULL DEFAULT true,
  `google_offline_sent_at` DATETIME(3) NULL,
  `google_offline_error` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_offer_sale_signals_offer_id_dedupe_key_key` (`offer_id`, `dedupe_key`),
  INDEX `tracker_offer_sale_signals_offer_id_created_at_idx` (`offer_id`, `created_at`),
  CONSTRAINT `tracker_offer_sale_signals_offer_id_fkey`
    FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
