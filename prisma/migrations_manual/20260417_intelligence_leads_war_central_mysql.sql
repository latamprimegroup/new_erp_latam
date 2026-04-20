-- Central de Inteligência: multi-touch, fingerprint, comportamento, upsell, last_interaction
-- MySQL / InnoDB

ALTER TABLE `intelligence_leads`
  ADD COLUMN `utm_first_source` VARCHAR(120) NULL AFTER `utm_campaign`,
  ADD COLUMN `utm_first_medium` VARCHAR(120) NULL AFTER `utm_first_source`,
  ADD COLUMN `utm_first_campaign` VARCHAR(200) NULL AFTER `utm_first_medium`,
  ADD COLUMN `confidence_score` DECIMAL(5,2) NOT NULL DEFAULT 50.00 AFTER `assigned_commercial_id`,
  ADD COLUMN `fingerprint_hash` VARCHAR(64) NULL AFTER `confidence_score`,
  ADD COLUMN `fingerprint_user_agent` VARCHAR(512) NULL AFTER `fingerprint_hash`,
  ADD COLUMN `digital_fingerprint_alert` TINYINT(1) NOT NULL DEFAULT 0 AFTER `fingerprint_user_agent`,
  ADD COLUMN `behavior_tags` JSON NULL AFTER `digital_fingerprint_alert`,
  ADD COLUMN `purchased_product_slugs` JSON NULL AFTER `behavior_tags`,
  ADD COLUMN `last_interaction_at` DATETIME(3) NULL AFTER `purchased_product_slugs`;

CREATE INDEX `intelligence_leads_fingerprint_hash_idx` ON `intelligence_leads` (`fingerprint_hash`);
CREATE INDEX `intelligence_leads_digital_fingerprint_alert_idx` ON `intelligence_leads` (`digital_fingerprint_alert`);
