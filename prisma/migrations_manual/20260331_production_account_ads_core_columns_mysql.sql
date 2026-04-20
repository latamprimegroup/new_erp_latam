-- Colunas ADS CORE / identificador de produção + enum UNDER_REVIEW (MySQL 8+)
-- Ajuste os nomes das tabelas se o seu banco usar outro casing.

-- 1) Novas colunas em ProductionAccount
ALTER TABLE `ProductionAccount`
  ADD COLUMN `account_code` VARCHAR(120) NULL,
  ADD COLUMN `password_hash` TEXT NULL,
  ADD COLUMN `production_niche` VARCHAR(32) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN `verification_goal` VARCHAR(48) NOT NULL DEFAULT 'G2_AND_ADVERTISER',
  ADD COLUMN `primary_domain` VARCHAR(253) NULL,
  ADD COLUMN `proxy_note` VARCHAR(500) NULL,
  ADD COLUMN `proxy_configured` TINYINT(1) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `ProductionAccount_account_code_key` ON `ProductionAccount` (`account_code`);
CREATE UNIQUE INDEX `ProductionAccount_primary_domain_key` ON `ProductionAccount` (`primary_domain`);

-- 2) Incluir UNDER_REVIEW no ENUM de status (ProductionAccount e StockAccount usam o mesmo conjunto no Prisma)
ALTER TABLE `ProductionAccount` MODIFY COLUMN `status` ENUM(
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'IN_USE',
  'AVAILABLE',
  'CRITICAL',
  'DELIVERED'
) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `StockAccount` MODIFY COLUMN `status` ENUM(
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'IN_USE',
  'AVAILABLE',
  'CRITICAL',
  'DELIVERED'
) NOT NULL DEFAULT 'AVAILABLE';
