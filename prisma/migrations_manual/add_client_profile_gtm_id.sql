-- ClientProfile: ID do container GTM por cliente (atribuição / Conversion Engine)
-- Ajuste o nome da tabela se o seu Prisma usar @@map diferente.

ALTER TABLE `ClientProfile` ADD COLUMN `gtm_id` VARCHAR(32) NULL;
