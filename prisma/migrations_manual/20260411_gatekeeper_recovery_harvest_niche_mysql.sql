-- Gatekeeper Módulo 01: recuperação cifrada, ano de safra, tag de nicho CNPJ (MySQL)
ALTER TABLE `inventory_gmails`
  ADD COLUMN `recovery_email_enc` TEXT NULL AFTER `password_enc`,
  ADD COLUMN `harvest_year` INT NULL AFTER `recovery_email_enc`;

ALTER TABLE `inventory_cnpjs`
  ADD COLUMN `niche_operator_tag` VARCHAR(120) NULL AFTER `niche_inferred`;
