-- OS Contingência 27/03/2026 — aplicar manualmente se não usar prisma migrate (MySQL).
-- IMPORTANTE: confira os nomes físicos das tabelas no seu banco (Prisma sem @@map usa o nome do model, ex.: Order, User, StockAccount).

CREATE TABLE IF NOT EXISTS `commercial_leads` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NULL,
  `phone` VARCHAR(30) NULL,
  `whatsapp` VARCHAR(30) NULL,
  `email` VARCHAR(200) NULL,
  `photo_path` VARCHAR(500) NULL,
  `funnel_step` ENUM('STEP_1_CAPTURA','STEP_2_WHATSAPP','STEP_3_FOTO','STEP_4_VALIDACAO','STEP_5_QUALIFICACAO','STEP_6_PROPOSTA','STEP_7_CONVERSAO') NOT NULL DEFAULT 'STEP_1_CAPTURA',
  `validated_at` DATETIME(3) NULL,
  `assigned_commercial_id` VARCHAR(191) NULL,
  `converted_client_id` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `commercial_leads_funnel_step_created_at_idx` (`funnel_step`, `created_at`),
  KEY `commercial_leads_assigned_commercial_id_idx` (`assigned_commercial_id`),
  CONSTRAINT `commercial_leads_assigned_commercial_id_fkey` FOREIGN KEY (`assigned_commercial_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commercial_leads_converted_client_id_fkey` FOREIGN KEY (`converted_client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `affiliate_webhook_events` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `external_id` VARCHAR(200) NULL,
  `payload` JSON NOT NULL,
  `processed` BOOLEAN NOT NULL DEFAULT false,
  `processed_at` DATETIME(3) NULL,
  `roi_value_brl` DECIMAL(12,2) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `affiliate_webhook_events_provider_external_id_idx` (`provider`, `external_id`),
  KEY `affiliate_webhook_events_provider_created_at_idx` (`provider`, `created_at`),
  KEY `affiliate_webhook_events_processed_idx` (`processed`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `synthetic_conversion_intents` (
  `id` VARCHAR(191) NOT NULL,
  `stock_account_id` VARCHAR(191) NULL,
  `webhook_event_id` VARCHAR(191) NULL,
  `provider` VARCHAR(32) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `meta` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `synthetic_conversion_intents_stock_account_id_idx` (`stock_account_id`),
  KEY `synthetic_conversion_intents_status_idx` (`status`),
  CONSTRAINT `synthetic_conversion_intents_stock_account_id_fkey` FOREIGN KEY (`stock_account_id`) REFERENCES `StockAccount` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `synthetic_conversion_intents_webhook_event_id_fkey` FOREIGN KEY (`webhook_event_id`) REFERENCES `affiliate_webhook_events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Pedidos: PIX Inter (ajuste `Order` se sua tabela for outra, ex. orders)
-- ALTER TABLE `Order` ADD COLUMN `inter_pix_txid` VARCHAR(120) NULL;
-- ALTER TABLE `Order` ADD COLUMN `inter_pix_copia_e_cola` TEXT NULL;
-- CREATE UNIQUE INDEX `Order_inter_pix_txid_key` ON `Order` (`inter_pix_txid`);

-- Estoque: compliance
-- ALTER TABLE `StockAccount` ADD COLUMN `compliance_risk_score` INT NULL;
-- ALTER TABLE `StockAccount` ADD COLUMN `compliance_scanned_at` DATETIME(3) NULL;
-- ALTER TABLE `StockAccount` ADD COLUMN `compliance_scan_summary` JSON NULL;
