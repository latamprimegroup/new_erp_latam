-- Vault Intelligence: ledger, chargeback, wallet, supply lots, producer cycles, stock compromise
-- MySQL 8+

ALTER TABLE `StockAccount`
  ADD COLUMN `compromised_at` DATETIME(3) NULL,
  ADD COLUMN `compromise_reason` VARCHAR(64) NULL;

CREATE TABLE `vault_ledger_journals` (
  `id` VARCHAR(191) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `memo` VARCHAR(500) NULL,
  `source` VARCHAR(64) NOT NULL,
  `source_id` VARCHAR(64) NULL,
  `created_by_id` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `vault_ledger_journals_occurred_at_idx` (`occurred_at`),
  INDEX `vault_ledger_journals_source_source_id_idx` (`source`, `source_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `vault_ledger_lines` (
  `id` VARCHAR(191) NOT NULL,
  `journal_id` VARCHAR(191) NOT NULL,
  `account` VARCHAR(48) NOT NULL,
  `debit` DECIMAL(16, 4) NOT NULL DEFAULT 0,
  `credit` DECIMAL(16, 4) NOT NULL DEFAULT 0,
  `meta` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `vault_ledger_lines_journal_id_idx` (`journal_id`),
  CONSTRAINT `vault_ledger_lines_journal_id_fkey`
    FOREIGN KEY (`journal_id`) REFERENCES `vault_ledger_journals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chargeback_records` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14, 4) NOT NULL,
  `gateway_ref` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  `affected_stock_account_ids` JSON NULL,
  `created_by_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `chargeback_records_order_id_idx` (`order_id`),
  INDEX `chargeback_records_created_at_idx` (`created_at`),
  CONSTRAINT `chargeback_records_order_id_fkey`
    FOREIGN KEY (`order_id`) REFERENCES `Order` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chargeback_records_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `client_wallet_ledger` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `amount` DECIMAL(16, 4) NOT NULL,
  `balance_after` DECIMAL(16, 4) NOT NULL,
  `order_id` VARCHAR(191) NULL,
  `memo` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `client_wallet_ledger_client_id_created_at_idx` (`client_id`, `created_at`),
  CONSTRAINT `client_wallet_ledger_client_id_fkey`
    FOREIGN KEY (`client_id`) REFERENCES `ClientProfile` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supply_lots` (
  `id` VARCHAR(191) NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `total_cost` DECIMAL(16, 4) NOT NULL,
  `units_purchased` INT NOT NULL,
  `units_remaining` INT NOT NULL,
  `unit_cost_computed` DECIMAL(16, 4) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `supply_lots_expires_at_idx` (`expires_at`),
  INDEX `supply_lots_category_idx` (`category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `producer_vault_cycles` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `opened_at` DATETIME(3) NOT NULL,
  `closed_at` DATETIME(3) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  `provisioned_production` DECIMAL(16, 4) NOT NULL DEFAULT 0,
  `provisioned_elite` DECIMAL(16, 4) NOT NULL DEFAULT 0,
  `units_production_counted` INT NOT NULL DEFAULT 0,
  `units_elite_counted` INT NOT NULL DEFAULT 0,
  `closed_report_json` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `producer_vault_cycles_user_id_status_idx` (`user_id`, `status`),
  INDEX `producer_vault_cycles_opened_at_idx` (`opened_at`),
  CONSTRAINT `producer_vault_cycles_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
