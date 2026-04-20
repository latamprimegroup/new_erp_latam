-- Módulo 02 Tracker: atribuição S2S + gastos + shield
ALTER TABLE `affiliate_webhook_events`
  ADD COLUMN `gclid` VARCHAR(512) NULL,
  ADD COLUMN `device_category` VARCHAR(24) NULL,
  ADD COLUMN `payment_status` VARCHAR(24) NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN `uni_id` CHAR(36) NULL,
  ADD INDEX `affiliate_webhook_events_gclid_idx` (`gclid`),
  ADD INDEX `affiliate_webhook_events_uni_id_idx` (`uni_id`),
  ADD INDEX `affiliate_webhook_events_payment_created_idx` (`payment_status`, `created_at`);

ALTER TABLE `affiliate_webhook_events`
  ADD CONSTRAINT `affiliate_webhook_events_uni_id_fkey`
  FOREIGN KEY (`uni_id`) REFERENCES `vault_industrial_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `account_spend_logs`
  ADD COLUMN `conversions` INT NOT NULL DEFAULT 0;

CREATE TABLE `ads_tracker_shield_daily` (
  `id` VARCHAR(191) NOT NULL,
  `day` DATE NOT NULL,
  `blocked_clicks` INT NOT NULL DEFAULT 0,
  `estimated_saved_brl` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ads_tracker_shield_daily_day_key` (`day`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
