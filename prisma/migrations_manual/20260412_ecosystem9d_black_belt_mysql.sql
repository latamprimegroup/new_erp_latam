-- Ecossistema 9D — CPA, alerta intenção, spend por campanha, pulses checkout, perfil cliente antifraude

ALTER TABLE `intelligence_leads`
  ADD COLUMN `cpa_brl` DECIMAL(12,2) NULL AFTER `last_interaction_at`,
  ADD COLUMN `hot_stalled_alert` TINYINT(1) NOT NULL DEFAULT 0 AFTER `cpa_brl`;

CREATE INDEX `intelligence_leads_hot_stalled_alert_idx` ON `intelligence_leads` (`hot_stalled_alert`);

CREATE TABLE `intelligence_campaign_spend` (
  `id` VARCHAR(191) NOT NULL,
  `utm_source` VARCHAR(120) NOT NULL,
  `utm_campaign` VARCHAR(200) NOT NULL,
  `period_month` DATE NOT NULL,
  `spend_brl` DECIMAL(14,2) NOT NULL,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `intelligence_campaign_spend_utm_source_utm_campaign_period_month_key` (`utm_source`, `utm_campaign`, `period_month`),
  INDEX `intelligence_campaign_spend_period_month_idx` (`period_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `checkout_gateway_pulses` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `label` VARCHAR(120) NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `last_webhook_at` DATETIME(3) NULL,
  `last_approved_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `checkout_gateway_pulses_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `checkout_gateway_pulses` (`id`, `code`, `label`, `enabled`, `updated_at`)
VALUES
  ('cgwp_appmax', 'APPMAX', 'Appmax', 1, NOW(3)),
  ('cgwp_hotmart', 'HOTMART', 'Hotmart', 1, NOW(3)),
  ('cgwp_stripe', 'STRIPE', 'Stripe', 1, NOW(3)),
  ('cgwp_kiwify', 'KIWIFY', 'Kiwify', 1, NOW(3)),
  ('cgwp_erp_pix', 'ERP_PIX', 'PIX / ERP interno', 1, NOW(3))
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

ALTER TABLE `ClientProfile`
  ADD COLUMN `trust_score` INT NULL,
  ADD COLUMN `average_ticket_brl` DECIMAL(12,2) NULL,
  ADD COLUMN `next_best_offer_slug` VARCHAR(120) NULL,
  ADD COLUMN `last_seen_ip_hash` VARCHAR(64) NULL,
  ADD COLUMN `risk_block_checkout` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `risk_block_reason` VARCHAR(500) NULL;

CREATE INDEX `ClientProfile_trust_score_idx` ON `ClientProfile` (`trust_score`);
CREATE INDEX `ClientProfile_risk_block_checkout_idx` ON `ClientProfile` (`risk_block_checkout`);
