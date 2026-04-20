-- Inteligência de Leads — scoring, LTV sync, timeline, atribuição comercial
ALTER TABLE `intelligence_leads`
  ADD COLUMN `purchase_count` INT NOT NULL DEFAULT 0,
  ADD COLUMN `last_product_name` VARCHAR(200) NULL,
  ADD COLUMN `landing_page_key` VARCHAR(120) NULL,
  ADD COLUMN `checkout_intent_at` DATETIME(3) NULL,
  ADD COLUMN `engagement_score` INT NOT NULL DEFAULT 0,
  ADD COLUMN `assigned_commercial_id` VARCHAR(191) NULL,
  ADD KEY `intelligence_leads_engagement_score_idx` (`engagement_score`),
  ADD KEY `intelligence_leads_assigned_commercial_id_idx` (`assigned_commercial_id`);

ALTER TABLE `intelligence_leads`
  ADD CONSTRAINT `intelligence_leads_assigned_commercial_id_fkey`
  FOREIGN KEY (`assigned_commercial_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `intelligence_lead_events` (
  `id` VARCHAR(191) NOT NULL,
  `lead_id` VARCHAR(191) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `detail` TEXT NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  KEY `intelligence_lead_events_lead_id_occurred_at_idx` (`lead_id`, `occurred_at`),
  CONSTRAINT `intelligence_lead_events_lead_id_fkey`
    FOREIGN KEY (`lead_id`) REFERENCES `intelligence_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
