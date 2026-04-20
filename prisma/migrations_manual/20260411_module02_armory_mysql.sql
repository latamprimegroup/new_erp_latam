-- Módulo 02 — Central de Ativos (Armory): solicitação, UNI na conta, blindagem de domínio, logs de warmup

ALTER TABLE `account_solicitations`
  ADD COLUMN `traffic_source` VARCHAR(24) NULL AFTER `notes`,
  ADD COLUMN `operation_level` VARCHAR(24) NULL AFTER `traffic_source`,
  ADD COLUMN `checkout_url` VARCHAR(2000) NULL AFTER `operation_level`,
  ADD COLUMN `kind` VARCHAR(24) NOT NULL DEFAULT 'LEGACY' AFTER `checkout_url`;

ALTER TABLE `landing_domains`
  ADD COLUMN `shield_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `ssl_status`,
  ADD COLUMN `shield_requested_at` DATETIME(3) NULL AFTER `shield_enabled`,
  ADD COLUMN `shield_last_webhook_at` DATETIME(3) NULL AFTER `shield_requested_at`,
  ADD COLUMN `shield_webhook_error` VARCHAR(500) NULL AFTER `shield_last_webhook_at`;

ALTER TABLE `StockAccount`
  ADD COLUMN `mentorado_linked_uni_id` CHAR(36) NULL,
  ADD COLUMN `mentorado_warmup_log_json` JSON NULL,
  ADD KEY `StockAccount_mentorado_linked_uni_id_idx` (`mentorado_linked_uni_id`),
  ADD CONSTRAINT `StockAccount_mentorado_linked_uni_id_fkey` FOREIGN KEY (`mentorado_linked_uni_id`) REFERENCES `vault_industrial_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
