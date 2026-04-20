-- Módulo 04 — Shield & Tracker (mentorado): UNI + destino + TrackerOffer

CREATE TABLE IF NOT EXISTS `mentorado_shield_tracker_links` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `uni_id` CHAR(36) NOT NULL,
  `label` VARCHAR(200) NULL,
  `destination_url` VARCHAR(2000) NOT NULL,
  `protection_niche` VARCHAR(48) NOT NULL,
  `shield_profile` VARCHAR(16) NOT NULL,
  `offer_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mentorado_shield_tracker_links_offer_id_key` (`offer_id`),
  KEY `mentorado_shield_tracker_links_client_id_idx` (`client_id`),
  KEY `mentorado_shield_tracker_links_uni_id_idx` (`uni_id`),
  CONSTRAINT `mentorado_shield_tracker_links_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `mentorado_shield_tracker_links_uni_id_fkey` FOREIGN KEY (`uni_id`) REFERENCES `vault_industrial_units` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `mentorado_shield_tracker_links_offer_id_fkey` FOREIGN KEY (`offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
