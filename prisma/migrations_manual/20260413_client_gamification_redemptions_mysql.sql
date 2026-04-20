-- Hall de patentes — resgates de recompensas (e-mail à equipa comercial / Francielle)
CREATE TABLE `client_gamification_redemptions` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `reward_key` VARCHAR(80) NOT NULL,
  `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `fulfilled_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_gamification_redemptions_client_reward_key` (`client_id`, `reward_key`),
  KEY `client_gamification_redemptions_reward_idx` (`reward_key`),
  CONSTRAINT `client_gamification_redemptions_client_fk` FOREIGN KEY (`client_id`) REFERENCES `client_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
