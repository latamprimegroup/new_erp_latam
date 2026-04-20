-- Módulo 11 — gestão operacional de UNI + log de atividade
ALTER TABLE vault_industrial_units
  ADD COLUMN display_name VARCHAR(200) NULL,
  ADD COLUMN primary_domain_host VARCHAR(253) NULL,
  ADD COLUMN timezone_iana VARCHAR(64) NULL,
  ADD COLUMN preferred_locale VARCHAR(24) NULL,
  ADD COLUMN custom_headers_json JSON NULL,
  ADD COLUMN risk_level VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN killed_at DATETIME(3) NULL,
  ADD COLUMN killed_reason VARCHAR(500) NULL,
  ADD COLUMN last_proxy_probe_at DATETIME(3) NULL,
  ADD COLUMN last_proxy_probe_ok TINYINT(1) NULL,
  ADD COLUMN last_proxy_probe_ms INT NULL;

CREATE INDEX idx_viu_primary_domain ON vault_industrial_units (primary_domain_host);

CREATE TABLE vault_industrial_unit_activity_logs (
  id VARCHAR(191) NOT NULL,
  uni_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_viual_uni_created (uni_id, created_at),
  CONSTRAINT fk_viual_uni FOREIGN KEY (uni_id) REFERENCES vault_industrial_units(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
