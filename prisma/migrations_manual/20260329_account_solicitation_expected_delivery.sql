-- MySQL: previsão de entrega para o cliente (admin)
ALTER TABLE `account_solicitations` ADD COLUMN `expected_delivery_at` DATETIME NULL;
