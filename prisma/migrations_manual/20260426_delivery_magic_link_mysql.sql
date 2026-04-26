-- Magic Link de Entrega Segura + Log de Acesso
-- Tabelas: delivery_magic_links, delivery_access_logs

CREATE TABLE IF NOT EXISTS `delivery_magic_links` (
  `id`            VARCHAR(30)   NOT NULL,
  `token`         VARCHAR(64)   NOT NULL,
  `checkout_id`   VARCHAR(30)   NOT NULL,
  `credential_id` VARCHAR(30)   NULL,
  `max_views`     INT           NOT NULL DEFAULT 0,
  `view_count`    INT           NOT NULL DEFAULT 0,
  `expires_at`    DATETIME(3)   NULL,
  `revoked_at`    DATETIME(3)   NULL,
  `revoke_reason` VARCHAR(200)  NULL,
  `created_at`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_dml_token`         (`token`),
  INDEX         `idx_dml_checkout_id`   (`checkout_id`),
  INDEX         `idx_dml_credential_id` (`credential_id`),

  CONSTRAINT `fk_dml_checkout` FOREIGN KEY (`checkout_id`)
    REFERENCES `quick_sale_checkouts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `fk_dml_credential` FOREIGN KEY (`credential_id`)
    REFERENCES `quick_sale_credentials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `delivery_access_logs` (
  `id`          VARCHAR(30)   NOT NULL,
  `link_id`     VARCHAR(30)   NOT NULL,
  `ip`          VARCHAR(64)   NULL,
  `user_agent`  VARCHAR(300)  NULL,
  `referer`     VARCHAR(500)  NULL,
  `accessed_at` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `idx_dal_link_id`     (`link_id`),
  INDEX `idx_dal_accessed_at` (`accessed_at`),

  CONSTRAINT `fk_dal_link` FOREIGN KEY (`link_id`)
    REFERENCES `delivery_magic_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
