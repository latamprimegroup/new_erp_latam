-- War Room OS — triagem IA, resgate carrinho, pulses tráfego, auditoria comercial

ALTER TABLE `intelligence_leads`
  ADD COLUMN `commercial_ai_brief` VARCHAR(600) NULL AFTER `hot_stalled_alert`,
  ADD COLUMN `cart_rescue_immediate` TINYINT(1) NOT NULL DEFAULT 0 AFTER `commercial_ai_brief`;

CREATE INDEX `intelligence_leads_cart_rescue_immediate_idx` ON `intelligence_leads` (`cart_rescue_immediate`);

CREATE TABLE `intelligence_checkout_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `lead_id` VARCHAR(191) NULL,
  `status` ENUM('STARTED','PAYMENT_PENDING','APPROVED','ABANDONED','RESCUE_IMMEDIATE') NOT NULL DEFAULT 'STARTED',
  `gateway_code` VARCHAR(32) NULL,
  `external_ref` VARCHAR(200) NULL,
  `value_brl` DECIMAL(12,2) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `approved_at` DATETIME(3) NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `intelligence_checkout_sessions_email_status_idx` (`email`, `status`),
  INDEX `intelligence_checkout_sessions_status_started_at_idx` (`status`, `started_at`),
  INDEX `intelligence_checkout_sessions_lead_id_idx` (`lead_id`),
  CONSTRAINT `intelligence_checkout_sessions_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `intelligence_leads` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lead_ingest_pulses` (
  `id` VARCHAR(191) NOT NULL,
  `minute_utc` DATETIME(3) NOT NULL,
  `ingest_count` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `lead_ingest_pulses_minute_utc_key` (`minute_utc`),
  INDEX `lead_ingest_pulses_minute_utc_idx` (`minute_utc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `traffic_alert_state` (
  `id` VARCHAR(32) NOT NULL,
  `last_volume_drop_alert_at` DATETIME(3) NULL,
  `last_silence_alert_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `traffic_alert_state` (`id`, `updated_at`) VALUES ('default', NOW(3))
  ON DUPLICATE KEY UPDATE `id` = `id`;

CREATE TABLE `commercial_data_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `role` VARCHAR(24) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(48) NOT NULL,
  `entity_id` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `commercial_data_audit_logs_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `commercial_data_audit_logs_action_created_at_idx` (`action`, `created_at`),
  CONSTRAINT `commercial_data_audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
