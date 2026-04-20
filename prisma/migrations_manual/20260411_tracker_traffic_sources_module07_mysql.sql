-- Ads Tracker Módulo 07 — fontes de tráfego (dicionário de parâmetros)
CREATE TABLE `tracker_traffic_sources` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(64) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `status` ENUM('ACTIVE', 'PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `network_kind` VARCHAR(32) NOT NULL,
  `built_in` BOOLEAN NOT NULL DEFAULT false,
  `param_blueprint` JSON NOT NULL,
  `global_params` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracker_traffic_sources_slug_key` (`slug`),
  INDEX `tracker_traffic_sources_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
