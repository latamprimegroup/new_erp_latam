-- Módulo 03 — Creative Vault & Agência On-Demand (mentorado + workflow interno)

CREATE TABLE IF NOT EXISTS `creative_vault_templates` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(96) NOT NULL,
  `niche` VARCHAR(32) NOT NULL DEFAULT 'GERAL',
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `preview_video_url` VARCHAR(2000) NOT NULL,
  `thumbnail_url` VARCHAR(2000) NULL,
  `roi_label` VARCHAR(320) NOT NULL,
  `script_copy` TEXT NULL,
  `published` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `creative_vault_templates_slug_key` (`slug`),
  KEY `creative_vault_templates_niche_published_sort_order_idx` (`niche`, `published`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `creative_agency_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `template_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'FILA',
  `checkout_url` VARCHAR(2000) NOT NULL,
  `logo_url` VARCHAR(2000) NULL,
  `hook_notes` TEXT NULL,
  `iteration_number` INT NOT NULL DEFAULT 1,
  `parent_job_id` VARCHAR(191) NULL,
  `iteration_root_id` VARCHAR(191) NULL,
  `deliverable_url` VARCHAR(2000) NULL,
  `unique_metadata_hash_done` TINYINT(1) NOT NULL DEFAULT 0,
  `ctr_snapshot_at_delivery` DECIMAL(10, 4) NULL,
  `support_ticket_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `creative_agency_jobs_support_ticket_id_key` (`support_ticket_id`),
  KEY `creative_agency_jobs_client_id_status_idx` (`client_id`, `status`),
  KEY `creative_agency_jobs_template_id_idx` (`template_id`),
  KEY `creative_agency_jobs_iteration_root_id_idx` (`iteration_root_id`),
  KEY `creative_agency_jobs_parent_job_id_fkey` (`parent_job_id`),
  CONSTRAINT `creative_agency_jobs_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `creative_agency_jobs_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `creative_vault_templates` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `creative_agency_jobs_parent_job_id_fkey` FOREIGN KEY (`parent_job_id`) REFERENCES `creative_agency_jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `creative_agency_jobs_iteration_root_id_fkey` FOREIGN KEY (`iteration_root_id`) REFERENCES `creative_agency_jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `creative_agency_jobs_support_ticket_id_fkey` FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `creative_ad_metrics_entries` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NULL,
  `metric_date` DATE NOT NULL,
  `spend` DECIMAL(14, 2) NOT NULL,
  `clicks` INT NOT NULL,
  `ctr_percent` DECIMAL(10, 4) NOT NULL,
  `cpc` DECIMAL(14, 4) NOT NULL,
  `sales` DECIMAL(14, 2) NOT NULL,
  `label` VARCHAR(160) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `creative_ad_metrics_entries_client_id_metric_date_idx` (`client_id`, `metric_date`),
  KEY `creative_ad_metrics_entries_job_id_idx` (`job_id`),
  CONSTRAINT `creative_ad_metrics_entries_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `creative_ad_metrics_entries_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `creative_agency_jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cliente_vsl_watch` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `vsl_url` VARCHAR(2000) NOT NULL,
  `drop_off_seconds` INT NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `cliente_vsl_watch_client_id_idx` (`client_id`),
  CONSTRAINT `cliente_vsl_watch_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vsl_adjustment_requests` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `vsl_watch_id` VARCHAR(191) NOT NULL,
  `drop_off_seconds` INT NOT NULL,
  `notes` TEXT NULL,
  `support_ticket_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `vsl_adjustment_requests_support_ticket_id_key` (`support_ticket_id`),
  KEY `vsl_adjustment_requests_client_id_idx` (`client_id`),
  KEY `vsl_adjustment_requests_vsl_watch_id_idx` (`vsl_watch_id`),
  CONSTRAINT `vsl_adjustment_requests_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vsl_adjustment_requests_vsl_watch_id_fkey` FOREIGN KEY (`vsl_watch_id`) REFERENCES `cliente_vsl_watch` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vsl_adjustment_requests_support_ticket_id_fkey` FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
