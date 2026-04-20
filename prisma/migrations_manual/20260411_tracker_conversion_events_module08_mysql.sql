-- Ads Tracker Módulo 08 — regras de conversão + fila offline + upsell no sinal
ALTER TABLE `tracker_offer_sale_signals`
  ADD COLUMN `is_upsell` BOOLEAN NOT NULL DEFAULT false AFTER `google_offline_error`;

CREATE TABLE `tracker_conversion_rules` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `event_kind` ENUM('PURCHASE','LEAD','INITIATE_CHECKOUT','HIGH_INTENT_LEAD') NOT NULL,
  `offer_id` VARCHAR(191) NULL,
  `only_approved_purchases` BOOLEAN NOT NULL DEFAULT true,
  `upsell_mode` ENUM('INCLUDE_ALL','PRIMARY_ONLY','UPSELL_ONLY') NOT NULL DEFAULT 'INCLUDE_ALL',
  `value_mode` ENUM('FULL_GROSS','NET_AFTER_PLATFORM_FEE','MICRO_ZERO') NOT NULL DEFAULT 'FULL_GROSS',
  `platform_fee_percent` DECIMAL(5, 2) NULL,
  `conversion_weight_percent` INT NOT NULL DEFAULT 100,
  `google_ads_customer_id` VARCHAR(32) NULL,
  `google_conversion_action_id` VARCHAR(32) NULL,
  `google_conversion_label` VARCHAR(255) NULL,
  `delay_minutes_before_send` INT NOT NULL DEFAULT 60,
  `backend_action` VARCHAR(64) NOT NULL DEFAULT 'OFFLINE_GCLIC_UPLOAD',
  `early_signal_min_seconds_on_page` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_conversion_rules_slug_key` (`slug`),
  INDEX `tracker_conversion_rules_active_event_kind_idx` (`active`, `event_kind`),
  INDEX `tracker_conversion_rules_offer_id_idx` (`offer_id`),
  CONSTRAINT `tracker_conversion_rules_offer_id_fkey`
    FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_conversion_dispatches` (
  `id` VARCHAR(191) NOT NULL,
  `rule_id` VARCHAR(191) NOT NULL,
  `sale_signal_id` VARCHAR(191) NULL,
  `status` ENUM('QUEUED','SENT','SKIPPED_ORGANIC','SKIPPED_FILTER','FAILED') NOT NULL,
  `match_kind` VARCHAR(32) NOT NULL,
  `value_computed` DECIMAL(14, 2) NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'BRL',
  `scheduled_for` DATETIME(3) NOT NULL,
  `processed_at` DATETIME(3) NULL,
  `error_message` VARCHAR(500) NULL,
  `gclid_snapshot` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_conversion_dispatches_rule_id_sale_signal_id_key` (`rule_id`, `sale_signal_id`),
  INDEX `tracker_conversion_dispatches_status_scheduled_for_idx` (`status`, `scheduled_for`),
  INDEX `tracker_conversion_dispatches_created_at_idx` (`created_at`),
  CONSTRAINT `tracker_conversion_dispatches_rule_id_fkey`
    FOREIGN KEY (`rule_id`) REFERENCES `tracker_conversion_rules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tracker_conversion_dispatches_sale_signal_id_fkey`
    FOREIGN KEY (`sale_signal_id`) REFERENCES `tracker_offer_sale_signals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
