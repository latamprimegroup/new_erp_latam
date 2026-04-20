-- MySQL: Plug & Play — plataforma (comissão diferenciada) + motivo queda técnica (contestação)
-- Ajuste o nome da tabela se o Prisma estiver com @@map diferente (padrão: BlackOperation).

ALTER TABLE `BlackOperation`
  ADD COLUMN `platform` VARCHAR(191) NULL AFTER `stock_account_id`;

ALTER TABLE `BlackOperation`
  ADD COLUMN `technical_ban_reason` ENUM('PROXY', 'LOGIN') NULL AFTER `banned_at`;

-- Opcional: backfill plataforma para registros antigos
-- UPDATE `BlackOperation` SET `platform` = 'GOOGLE_ADS' WHERE `platform` IS NULL;
