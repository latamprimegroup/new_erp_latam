-- Live Proof Labs — upgrade a partir da v1 antiga (status VALIDATED_ACTIVE / GRAVEYARD, sem spend_days, etc.)
-- NÃO executar se aplicaste o 20260411_live_proof_lab_mysql.sql já na versão v2 (ENUM novo + colunas extra).

-- 1) Expandir ENUM de status (mantém valores antigos um momento)
ALTER TABLE `live_proof_lab_cases`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'VALIDATED_ACTIVE',
    'GRAVEYARD',
    'EM_TESTE',
    'VALIDADA',
    'REPROVADA',
    'EM_ESCALA'
  ) NOT NULL DEFAULT 'DRAFT';

UPDATE `live_proof_lab_cases` SET `status` = 'VALIDADA' WHERE `status` = 'VALIDATED_ACTIVE';
UPDATE `live_proof_lab_cases` SET `status` = 'REPROVADA' WHERE `status` = 'GRAVEYARD';

ALTER TABLE `live_proof_lab_cases`
  MODIFY COLUMN `status` ENUM('DRAFT', 'EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA') NOT NULL DEFAULT 'DRAFT';

-- 2) Colunas de métricas sincronizadas
ALTER TABLE `live_proof_lab_cases`
  ADD COLUMN `gasto_total_brl` DECIMAL(14, 2) NULL AFTER `spend_7d_brl`,
  ADD COLUMN `cpa_medio_brl` DECIMAL(12, 4) NULL AFTER `gasto_total_brl`,
  ADD COLUMN `roi_liquido_percent` DECIMAL(10, 4) NULL AFTER `cpa_medio_brl`,
  ADD COLUMN `volume_vendas` INT NULL AFTER `roi_liquido_percent`,
  ADD COLUMN `metrics_synced_at` DATETIME(3) NULL AFTER `volume_vendas`;

-- 3) Timestamp do print
ALTER TABLE `live_proof_lab_screenshots`
  ADD COLUMN `captured_at` DATETIME(3) NULL AFTER `caption`;

-- 4) Gasto diário (Skin in the Game)
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

-- 5) Desbloqueio Creative Vault
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
