-- Live Proof Labs — Módulo 07 (v2: ciclo de vida, métricas sync, skin-in-game, unlocks)
-- Instalação nova: executar só este ficheiro.
-- Se já tinhas aplicado uma versão antiga deste SQL (VALIDATED_ACTIVE / GRAVEYARD), corre também 20260412_live_proof_lab_v2_lifecycle_mysql.sql

CREATE TABLE `live_proof_lab_cases` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(96) NOT NULL,
  `status` ENUM('DRAFT', 'EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA') NOT NULL DEFAULT 'DRAFT',
  `title` VARCHAR(200) NOT NULL,
  `product_label` VARCHAR(200) NOT NULL,
  `niche_label` VARCHAR(120) NOT NULL,
  `headline` VARCHAR(320) NULL,
  `summary` TEXT NULL,
  `internal_tracker_offer_id` VARCHAR(191) NULL,
  `creative_template_id` VARCHAR(191) NULL,
  `suggested_checkout_url` VARCHAR(2000) NULL,
  `default_offer_platform` VARCHAR(32) NULL,
  `vsl_script_notes` TEXT NULL,
  `analysis_text` TEXT NULL,
  `cpa_ideal_brl` DECIMAL(12, 2) NULL,
  `scale_budget_hint_brl` DECIMAL(14, 2) NULL,
  `spend_24h_brl` DECIMAL(14, 2) NULL,
  `spend_7d_brl` DECIMAL(14, 2) NULL,
  `gasto_total_brl` DECIMAL(14, 2) NULL,
  `cpa_medio_brl` DECIMAL(12, 4) NULL,
  `roi_liquido_percent` DECIMAL(10, 4) NULL,
  `volume_vendas` INT NULL,
  `metrics_synced_at` DATETIME(3) NULL,
  `graveyard_reason` TEXT NULL,
  `graveyard_loss_brl` DECIMAL(14, 2) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `validated_at` DATETIME(3) NULL,
  `published_to_clients` BOOLEAN NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `live_proof_lab_cases_slug_key` (`slug`),
  UNIQUE KEY `live_proof_lab_cases_internal_tracker_offer_id_key` (`internal_tracker_offer_id`),
  KEY `live_proof_lab_cases_creative_template_id_idx` (`creative_template_id`),
  KEY `live_proof_lab_cases_status_pub_sort_idx` (`status`, `published_to_clients`, `sort_order`),
  CONSTRAINT `live_proof_lab_cases_tracker_offer_fk` FOREIGN KEY (`internal_tracker_offer_id`) REFERENCES `tracker_offers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `live_proof_lab_cases_template_fk` FOREIGN KEY (`creative_template_id`) REFERENCES `creative_vault_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_proof_lab_screenshots` (
  `id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `image_url` VARCHAR(2000) NOT NULL,
  `caption` VARCHAR(300) NULL,
  `captured_at` DATETIME(3) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `live_proof_lab_screenshots_case_sort_idx` (`case_id`, `sort_order`),
  CONSTRAINT `live_proof_lab_screenshots_case_fk` FOREIGN KEY (`case_id`) REFERENCES `live_proof_lab_cases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_proof_lab_insights` (
  `id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `kind` ENUM('AUDIO', 'VIDEO') NOT NULL,
  `media_url` VARCHAR(2000) NOT NULL,
  `title` VARCHAR(200) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `live_proof_lab_insights_case_sort_idx` (`case_id`, `sort_order`),
  CONSTRAINT `live_proof_lab_insights_case_fk` FOREIGN KEY (`case_id`) REFERENCES `live_proof_lab_cases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_proof_lab_replicate_logs` (
  `id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `live_proof_lab_rep_client_created_idx` (`client_id`, `created_at`),
  KEY `live_proof_lab_rep_case_idx` (`case_id`),
  CONSTRAINT `live_proof_lab_rep_case_fk` FOREIGN KEY (`case_id`) REFERENCES `live_proof_lab_cases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `live_proof_lab_rep_client_fk` FOREIGN KEY (`client_id`) REFERENCES `client_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `live_proof_lab_rep_job_fk` FOREIGN KEY (`job_id`) REFERENCES `creative_agency_jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_proof_lab_spend_days` (
  `id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `day` DATE NOT NULL,
  `amount_brl` DECIMAL(14, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `live_proof_lab_spend_days_case_day_key` (`case_id`, `day`),
  KEY `live_proof_lab_spend_days_case_idx` (`case_id`),
  CONSTRAINT `live_proof_lab_spend_days_case_fk` FOREIGN KEY (`case_id`) REFERENCES `live_proof_lab_cases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_proof_lab_template_unlocks` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `template_id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `live_proof_lab_template_unlocks_client_template_key` (`client_id`, `template_id`),
  KEY `live_proof_lab_template_unlocks_case_idx` (`case_id`),
  CONSTRAINT `live_proof_lab_unlock_client_fk` FOREIGN KEY (`client_id`) REFERENCES `client_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `live_proof_lab_unlock_template_fk` FOREIGN KEY (`template_id`) REFERENCES `creative_vault_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `live_proof_lab_unlock_case_fk` FOREIGN KEY (`case_id`) REFERENCES `live_proof_lab_cases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
