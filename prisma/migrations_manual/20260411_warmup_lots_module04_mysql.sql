-- Módulo 4 (operação legítima): lotes de aquecimento / escala — agrupa UNIs
CREATE TABLE `warmup_lots` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `niche_tag` VARCHAR(120) NULL,
  `status` ENUM('PLANNING', 'ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNING',
  `internal_maturity_pct` INT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `warmup_lots_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vault_industrial_units`
  ADD COLUMN `warmup_lot_id` VARCHAR(191) NULL,
  ADD INDEX `vault_industrial_units_warmup_lot_id_idx` (`warmup_lot_id`);

ALTER TABLE `vault_industrial_units`
  ADD CONSTRAINT `vault_industrial_units_warmup_lot_id_fkey`
  FOREIGN KEY (`warmup_lot_id`) REFERENCES `warmup_lots` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
