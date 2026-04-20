-- Módulo 05 — War Room Live, pré-flight, chat ao vivo

CREATE TABLE IF NOT EXISTS `campaign_preflight_reviews` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `campaign_url` VARCHAR(2000) NOT NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
  `checklist_json` JSON NULL,
  `analyst_notes` TEXT NULL,
  `ticket_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `campaign_preflight_reviews_ticket_id_key` (`ticket_id`),
  KEY `campaign_preflight_reviews_client_id_status_idx` (`client_id`, `status`),
  CONSTRAINT `campaign_preflight_reviews_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `campaign_preflight_reviews_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `war_room_live_messages` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `body` VARCHAR(2000) NOT NULL,
  `kind` VARCHAR(24) NOT NULL DEFAULT 'chat',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `war_room_live_messages_created_at_idx` (`created_at`),
  CONSTRAINT `war_room_live_messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
