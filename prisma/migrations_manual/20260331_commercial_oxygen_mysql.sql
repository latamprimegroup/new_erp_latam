-- Pulmão Comercial (Oxygen): campos em Order e ClientProfile
-- Ajuste nomes de tabela se o Prisma usar @@map diferente (padrão: Order, ClientProfile).

ALTER TABLE `ClientProfile` ADD COLUMN `commercial_notes` TEXT NULL;
ALTER TABLE `ClientProfile` ADD COLUMN `last_contact_date` DATETIME(3) NULL;

ALTER TABLE `Order` ADD COLUMN `commercial_bridge_at` DATETIME(3) NULL;
ALTER TABLE `Order` ADD COLUMN `markup_brl` DECIMAL(12, 2) NULL;
ALTER TABLE `Order` ADD COLUMN `discount_code` VARCHAR(64) NULL;
