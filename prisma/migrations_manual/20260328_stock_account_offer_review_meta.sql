-- MySQL: executar após atualizar schema.prisma (npx prisma db push / migrate)
ALTER TABLE `StockAccount` ADD COLUMN `offer_review_meta` JSON NULL;
