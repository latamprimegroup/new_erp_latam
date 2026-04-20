-- Cupons comerciais + log de contato WhatsApp

CREATE TABLE IF NOT EXISTS `commercial_coupons` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `percent_off` INT NOT NULL,
  `min_quantity` INT NOT NULL DEFAULT 1,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `description` VARCHAR(200) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `commercial_coupons_code_key` (`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `commercial_contact_logs` (
  `id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NULL,
  `channel` VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commercial_contact_logs_client_id_created_at_idx` (`client_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Opcional: após criar as tabelas, adicione FKs para ClientProfile e User se o banco ainda não as criar via Prisma Migrate.
