-- Inventory Engine — spend em moeda original + selo verificado (alinhado ao Prisma em StockAccount).
-- Aplicar com `prisma migrate` / `db push` preferencialmente; este ficheiro é fallback DDL manual.

-- Nome da tabela segue o padrão Prisma sem @@map (geralmente `StockAccount` em MySQL).
ALTER TABLE `StockAccount`
  ADD COLUMN `spent_display_currency` VARCHAR(8) NULL AFTER `last_spend_sync_at`,
  ADD COLUMN `spent_display_amount` DECIMAL(14, 2) NULL AFTER `spent_display_currency`,
  ADD COLUMN `ads_ativos_verified` BOOLEAN NOT NULL DEFAULT TRUE AFTER `spent_display_amount`;
