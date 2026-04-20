-- Bloco 5: SLA, reprovação, registro CNPJ enriquecido, índices de auditoria (MySQL 8+)
-- Executar manualmente se não usar `prisma migrate dev`.

ALTER TABLE `ads_core_assets`
  ADD COLUMN `producer_assigned_at` DATETIME(3) NULL,
  ADD COLUMN `g2_finalized_at` DATETIME(3) NULL,
  ADD COLUMN `rejection_reason` TEXT NULL,
  ADD COLUMN `producer_site_edit_unlocked` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `ads_core_cnpj_registry`
  ADD COLUMN `source` VARCHAR(24) NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN `block_reason` VARCHAR(500) NULL;

CREATE INDEX `audit_logs_entity_entity_id_created_at_idx`
  ON `audit_logs` (`entity`, `entity_id`, `created_at`);

CREATE INDEX `audit_logs_action_created_at_idx`
  ON `audit_logs` (`action`, `created_at`);
