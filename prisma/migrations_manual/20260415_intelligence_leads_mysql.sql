-- Central de Inteligência de Leads (Ecossistema 9D)
CREATE TABLE IF NOT EXISTS `intelligence_leads` (
  `id` VARCHAR(191) NOT NULL,
  `nome` VARCHAR(200) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `whatsapp` VARCHAR(30) NULL,
  `utm_source` VARCHAR(120) NULL,
  `utm_medium` VARCHAR(120) NULL,
  `utm_campaign` VARCHAR(200) NULL,
  `status` ENUM('NOVO', 'QUENTE', 'CLIENTE_ATIVO', 'CHURN') NOT NULL DEFAULT 'NOVO',
  `data_ultima_compra` DATETIME(3) NULL,
  `total_vendas` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `intelligence_leads_email_key` (`email`),
  KEY `intelligence_leads_status_created_at_idx` (`status`, `created_at`),
  KEY `intelligence_leads_utm_source_idx` (`utm_source`),
  KEY `intelligence_leads_data_ultima_compra_idx` (`data_ultima_compra`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
