-- Módulo Pós-Venda & Rastreabilidade
-- Cria tabelas: quick_sale_credentials, quick_sale_credential_logs
-- e adiciona relação inversa na tabela quick_sale_checkouts

-- ─── Tabela principal de credenciais entregues ────────────────────────────────
CREATE TABLE IF NOT EXISTS `quick_sale_credentials` (
  `id`                    VARCHAR(30)  NOT NULL,
  `checkout_id`           VARCHAR(30)  NOT NULL,
  `asset_id`              VARCHAR(30)  NULL,

  -- Credenciais de acesso
  `login_email`           VARCHAR(300) NULL,
  `login_password`        VARCHAR(500) NULL,
  `recovery_email`        VARCHAR(300) NULL,
  `two_fa_seed`           VARCHAR(500) NULL,
  `extra_data`            JSON         NULL,

  -- Origem
  `asset_origin`          ENUM('INTERNAL','EXTERNAL') NOT NULL DEFAULT 'INTERNAL',
  `executor_name`         VARCHAR(100) NULL,
  `executor_id`           VARCHAR(30)  NULL,
  `supplier_name`         VARCHAR(100) NULL,

  -- Status operacional
  `asset_status`          ENUM('DELIVERED','WARMING','SUSPENDED','REPLACED','RETURNED') NOT NULL DEFAULT 'DELIVERED',
  `support_note`          TEXT         NULL,

  -- Substituição
  `replaced_by_id`        VARCHAR(30)  NULL,
  `replacement_reason`    ENUM('PROFILE_ERROR','DIRTY_PROXY','CREATIVE_ISSUE','PLATFORM_BAN','CLIENT_REQUEST','OTHER') NULL,
  `replacement_note`      VARCHAR(500) NULL,
  `replaced_at`           DATETIME(3)  NULL,

  `created_at`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `idx_qsc_checkout_id`  (`checkout_id`),
  INDEX `idx_qsc_asset_id`     (`asset_id`),
  INDEX `idx_qsc_asset_status` (`asset_status`),
  INDEX `idx_qsc_executor_id`  (`executor_id`),
  INDEX `idx_qsc_created_at`   (`created_at`),

  CONSTRAINT `fk_qsc_checkout` FOREIGN KEY (`checkout_id`)
    REFERENCES `quick_sale_checkouts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `fk_qsc_asset` FOREIGN KEY (`asset_id`)
    REFERENCES `assets`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `fk_qsc_executor` FOREIGN KEY (`executor_id`)
    REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `fk_qsc_replaced_by` FOREIGN KEY (`replaced_by_id`)
    REFERENCES `quick_sale_credentials`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tabela de log de auditoria ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `quick_sale_credential_logs` (
  `id`              VARCHAR(30)   NOT NULL,
  `credential_id`   VARCHAR(30)   NOT NULL,
  `actor_id`        VARCHAR(30)   NULL,
  `actor_name`      VARCHAR(100)  NULL,
  `action`          ENUM('CREATED','PASSWORD_CHANGED','STATUS_CHANGED','NOTE_UPDATED','REPLACED','EXTRA_UPDATED') NOT NULL,
  `details`         JSON          NULL,
  `created_at`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `idx_qscl_credential_id` (`credential_id`),
  INDEX `idx_qscl_actor_id`      (`actor_id`),
  INDEX `idx_qscl_created_at`    (`created_at`),

  CONSTRAINT `fk_qscl_credential` FOREIGN KEY (`credential_id`)
    REFERENCES `quick_sale_credentials`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `fk_qscl_actor` FOREIGN KEY (`actor_id`)
    REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
