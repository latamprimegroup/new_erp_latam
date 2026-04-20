-- Dashboard Gestão de Contas (MCC): snapshots, log de contingência, pedidos de reembolso
-- MySQL 8+

CREATE TABLE `ads_mcc_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `payload` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ads_mcc_snapshots_created_at_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ads_contingency_logs` (
  `id` VARCHAR(191) NOT NULL,
  `google_customer_id` VARCHAR(32) NOT NULL,
  `fell_at` DATETIME(3) NOT NULL,
  `reason` VARCHAR(64) NOT NULL,
  `policy_detail` VARCHAR(512) NULL,
  `current_status_label` VARCHAR(40) NOT NULL,
  `recovered_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ads_contingency_logs_google_customer_id_recovered_at_idx` (`google_customer_id`, `recovered_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ads_refund_requests` (
  `id` VARCHAR(191) NOT NULL,
  `google_customer_id` VARCHAR(32) NOT NULL,
  `requested_by_id` VARCHAR(191) NOT NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ads_refund_requests_google_customer_id_idx` (`google_customer_id`),
  INDEX `ads_refund_requests_status_idx` (`status`),
  CONSTRAINT `ads_refund_requests_requested_by_id_fkey`
    FOREIGN KEY (`requested_by_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
